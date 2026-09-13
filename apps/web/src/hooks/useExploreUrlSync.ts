/**
 * Saved views: versioned, validated serialisation of an Explore view into the URL.
 *
 * A view is the canonical image-filter contract plus a sort order. Display preferences (density, overlay toggles) travel in a separate `display` object because they change how the gallery looks, never which images are in it — restoring a view must reproduce the same result set regardless of how the recipient likes their tiles.
 *
 * The payload is versioned and parsed with Zod. Anything unreadable, or written by a newer version of the gallery, resolves to "no view" plus a message the caller can show, so a stale or hand-edited link degrades to the unfiltered gallery instead of throwing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { z } from 'zod';
import {
  contractToExploreFiltersState,
  contractToToolbarFilters,
  filterSnapshotToContract,
  toFilterContract,
  type ImageFilterContract,
} from '@/lib/explore-filter-contract';
import type { FilterSnapshot } from '@/types/export';
import type { ExploreFiltersState } from './useExploreFilters';

/** Bump when the encoded shape changes in a way older payloads cannot be read as. */
export const EXPLORE_VIEW_VERSION = 1;

const matchModeSchema = z.enum(['AND', 'OR']);

/** Zod mirror of `ImageFilterContract`. Every field optional; absent means unconstrained. */
export const imageFilterContractSchema = z.object({
  search: z.string().optional(),
  tag_ids: z.array(z.string()).optional(),
  excluded_tag_ids: z.array(z.string()).optional(),
  include_match_mode: matchModeSchema.optional(),
  exclude_match_mode: matchModeSchema.optional(),
  task_ids: z.array(z.number()).optional(),
  job_id: z.number().optional(),
  is_annotated: z.boolean().optional(),
  width_min: z.number().optional(),
  width_max: z.number().optional(),
  height_min: z.number().optional(),
  height_max: z.number().optional(),
  aspect_ratio_min: z.number().optional(),
  aspect_ratio_max: z.number().optional(),
  file_size_min: z.number().optional(),
  file_size_max: z.number().optional(),
  object_count_min: z.number().optional(),
  object_count_max: z.number().optional(),
  bbox_count_min: z.number().optional(),
  bbox_count_max: z.number().optional(),
  polygon_count_min: z.number().optional(),
  polygon_count_max: z.number().optional(),
  filepath_pattern: z.string().optional(),
  filepath_paths: z.array(z.string()).optional(),
  image_uids: z.array(z.string()).optional(),
  quality_min: z.number().optional(),
  quality_max: z.number().optional(),
  sharpness_min: z.number().optional(),
  sharpness_max: z.number().optional(),
  brightness_min: z.number().optional(),
  brightness_max: z.number().optional(),
  contrast_min: z.number().optional(),
  contrast_max: z.number().optional(),
  uniqueness_min: z.number().optional(),
  uniqueness_max: z.number().optional(),
  red_min: z.number().optional(),
  red_max: z.number().optional(),
  green_min: z.number().optional(),
  green_max: z.number().optional(),
  blue_min: z.number().optional(),
  blue_max: z.number().optional(),
  issues: z.array(z.string()).optional(),
});

/**
 * Sort order carried by a view. The explore endpoint does not accept a sort parameter yet — it orders by `(filename, id)` — so this is stored and restored but not sent; a sort selector can start honouring it without invalidating saved links.
 */
export const exploreSortSchema = z.object({
  field: z.enum(['filename', 'created_at', 'width', 'height', 'file_size', 'quality']),
  direction: z.enum(['asc', 'desc']),
});

/** Display preferences. Never affects which images match. */
export const exploreDisplaySchema = z.object({
  density: z.enum(['xs', 's', 'm', 'l', 'xl']).optional(),
  showBboxes: z.boolean().optional(),
  showPolygons: z.boolean().optional(),
  showLabels: z.boolean().optional(),
  showConfidence: z.boolean().optional(),
});

export const exploreViewSchema = z.object({
  v: z.number().int().min(1),
  filters: imageFilterContractSchema.optional(),
  sort: exploreSortSchema.optional(),
  display: exploreDisplaySchema.optional(),
});

export type ExploreSort = z.infer<typeof exploreSortSchema>;
export type ExploreViewDisplay = z.infer<typeof exploreDisplaySchema>;

export interface ExploreView {
  version: number;
  filters: ImageFilterContract;
  sort?: ExploreSort;
  display?: ExploreViewDisplay;
}

export type ExploreViewDecodeResult =
  | { status: 'ok'; view: ExploreView }
  | { status: 'empty' }
  | { status: 'error'; message: string };

/**
 * Search params this hook reads and writes. Merge it into the project route's `validateSearch` schema; both entries are `.catch(undefined)` so a malformed value never fails route validation.
 */
export const exploreViewSearchSchema = z.object({
  /** Encoded `ExploreView`. */
  view: z.string().optional().catch(undefined),
  /** Legacy: base64 `FilterSnapshot`, the link shape used by export history. */
  filter: z.string().optional().catch(undefined),
});

// ============================================================================
// Encoding
// ============================================================================

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * The display preferences a fresh gallery starts with. A view that only restates these carries no information, so it must not produce a `view` param: the caller always supplies a complete `display` object (density plus both overlay toggles), and treating a non-empty object as "worth restoring" made every mount write a param. That write replaced an unreadable incoming `?view=` with a valid display-only one before anyone could read the explanation for it.
 */
const DEFAULT_VIEW_DISPLAY: Required<ExploreViewDisplay> = {
  density: 'm',
  showBboxes: true,
  showPolygons: true,
  showLabels: false,
  showConfidence: false,
};

/** True when at least one display preference differs from the gallery's defaults. */
function hasNonDefaultDisplay(display: ExploreViewDisplay | undefined): boolean {
  if (!display) return false;
  return (Object.keys(display) as (keyof ExploreViewDisplay)[]).some(
    (key) => display[key] !== undefined && display[key] !== DEFAULT_VIEW_DISPLAY[key]
  );
}

/** Encode a view for the `view` search param. Returns undefined when the view constrains nothing worth restoring. */
export function encodeExploreView(view: Omit<ExploreView, 'version'>): string | undefined {
  const filters = toFilterContract(view.filters ?? {});
  const hasFilters = Object.keys(filters).length > 0;
  const hasDisplay = hasNonDefaultDisplay(view.display);
  if (!hasFilters && !view.sort && !hasDisplay) return undefined;

  return encodeBase64Url(
    JSON.stringify({
      v: EXPLORE_VIEW_VERSION,
      ...(hasFilters ? { filters } : {}),
      ...(view.sort ? { sort: view.sort } : {}),
      ...(hasDisplay ? { display: view.display } : {}),
    })
  );
}

/** Decode and validate a `view` param. Never throws: an unreadable view becomes a message. */
export function decodeExploreView(raw: string | undefined): ExploreViewDecodeResult {
  if (!raw) return { status: 'empty' };

  let json: unknown;
  try {
    json = JSON.parse(decodeBase64Url(raw));
  } catch {
    return {
      status: 'error',
      message: 'This view link could not be read, so the gallery is showing all images.',
    };
  }

  const parsed = exploreViewSchema.safeParse(json);
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'This view link is not a valid saved view, so the gallery is showing all images.',
    };
  }

  if (parsed.data.v > EXPLORE_VIEW_VERSION) {
    return {
      status: 'error',
      message: `This view was saved by a newer version of the gallery (v${parsed.data.v}) and cannot be restored here. The gallery is showing all images.`,
    };
  }

  return {
    status: 'ok',
    view: {
      version: parsed.data.v,
      filters: toFilterContract(parsed.data.filters ?? {}),
      sort: parsed.data.sort,
      display: parsed.data.display,
    },
  };
}

/** Decode the legacy `filter` param (base64 `FilterSnapshot`) that export history links still use. */
export function decodeLegacyFilterParam(raw: string | undefined): ExploreViewDecodeResult {
  if (!raw) return { status: 'empty' };
  try {
    const snapshot = JSON.parse(atob(raw)) as FilterSnapshot;
    return {
      status: 'ok',
      view: { version: EXPLORE_VIEW_VERSION, filters: filterSnapshotToContract(snapshot) },
    };
  } catch {
    return {
      status: 'error',
      message: 'This export filter link could not be read, so the gallery is showing all images.',
    };
  }
}

/** Split a restored view into the two pieces of Explore filter state that hold it. */
export function exploreViewToFilterState(view: ExploreView): {
  sidebar: Partial<ExploreFiltersState>;
  toolbar: ReturnType<typeof contractToToolbarFilters>;
} {
  return {
    sidebar: contractToExploreFiltersState(view.filters),
    toolbar: contractToToolbarFilters(view.filters),
  };
}

// ============================================================================
// Hook
// ============================================================================

export interface UseExploreUrlSyncOptions {
  /** The membership filters currently applied to the gallery. */
  filters: ImageFilterContract;
  sort?: ExploreSort;
  display?: ExploreViewDisplay;
  /**
   * Called with a view decoded from the URL: once on mount, and again whenever the `view` param changes from outside this hook (Back/Forward, or a pasted link). Not called for views this hook itself wrote.
   */
  onApplyView?: (view: ExploreView) => void;
  /** Set false to stop reading and writing the URL (for example while the Explore tab is not the active tab). */
  enabled?: boolean;
}

export interface UseExploreUrlSyncResult {
  /** True when the URL carried a view, valid or not. */
  hasUrlView: boolean;
  /** Human-readable reason the URL's view could not be restored, or null. */
  viewError: string | null;
  dismissViewError: () => void;
  /** Absolute URL for the current view, for a Copy link action. */
  buildShareUrl: () => string;
}

export function useExploreUrlSync({
  filters,
  sort,
  display,
  onApplyView,
  enabled = true,
}: UseExploreUrlSyncOptions): UseExploreUrlSyncResult {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const viewParam = typeof search.view === 'string' ? search.view : undefined;
  const legacyFilterParam = typeof search.filter === 'string' ? search.filter : undefined;

  /** The last value this hook wrote, so its own writes are not read back as external navigations. */
  const writtenRef = useRef<string | undefined>(undefined);
  const appliedRef = useRef<string | null>(null);

  const encoded = useMemo(
    () => encodeExploreView({ filters, sort, display }),
    [filters, sort, display]
  );

  // Decoding is pure, so the view and any message are derived rather than stored: no
  // effect has to push an error into state, and Back/Forward recomputes both for free.
  const decoded = useMemo(
    () =>
      viewParam ? decodeExploreView(viewParam) : decodeLegacyFilterParam(legacyFilterParam),
    [viewParam, legacyFilterParam]
  );
  const decodeError = decoded.status === 'error' ? decoded.message : null;
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  // Read: apply a view that arrived from outside this hook.
  useEffect(() => {
    if (!enabled || decoded.status !== 'ok') return;
    const incoming = viewParam ?? `legacy:${legacyFilterParam ?? ''}`;
    if (incoming === writtenRef.current || incoming === appliedRef.current) return;
    appliedRef.current = incoming;
    onApplyView?.(decoded.view);
  }, [enabled, decoded, viewParam, legacyFilterParam, onApplyView]);

  // Write: keep the URL describing the current view, without adding history entries.
  useEffect(() => {
    if (!enabled) return;
    if (encoded === viewParam) return;
    writtenRef.current = encoded;
    appliedRef.current = encoded ?? null;
    navigate({
      search: ((prev: Record<string, unknown>) => {
        const next = { ...prev };
        delete next.filter;
        if (encoded) {
          next.view = encoded;
        } else {
          delete next.view;
        }
        return next;
      }) as never,
      replace: true,
    });
  }, [enabled, encoded, viewParam, navigate]);

  const buildShareUrl = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('filter');
    if (encoded) {
      url.searchParams.set('view', encoded);
    } else {
      url.searchParams.delete('view');
    }
    return url.toString();
  }, [encoded]);

  const dismissViewError = useCallback(() => setDismissedError(decodeError), [decodeError]);

  return {
    hasUrlView: !!viewParam || !!legacyFilterParam,
    viewError: decodeError && decodeError !== dismissedError ? decodeError : null,
    dismissViewError,
    buildShareUrl,
  };
}
