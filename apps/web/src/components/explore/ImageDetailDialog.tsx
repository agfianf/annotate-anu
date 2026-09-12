/**
 * Image detail viewer, implemented as a real modal dialog (G06).
 *
 * The viewer used to be plain `div`s inside the gallery: no dialog role, no modal semantics, no focus management, and a window-level arrow-key listener that navigated images while the user was typing in a field. This component implements the WAI-ARIA modal dialog pattern (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) directly — the repository has no accessible dialog primitive and no focus-trap dependency, and adding one for a single call site was not worth a new package.
 *
 * Three things make it modal rather than merely overlaid:
 *
 * - It renders through a portal on `document.body`, and the application root is marked `inert` plus `aria-hidden` while it is open. That is what actually keeps Tab, pointer input, and assistive-technology navigation out of the gallery behind it — a keydown trap alone cannot stop a screen reader's virtual cursor.
 * - Tab cycles through the dialog *and* through any portal the dialog itself opened afterwards. The tag picker renders its panel with its own `createPortal` onto `document.body`, so that panel is a DOM sibling of this dialog rather than a descendant: a trap built only from the dialog's own subtree would send Tab off the last panel control straight out of the page (`#root` is inert and nothing else in `body` takes focus) and would skip the open panel entirely when tabbing off the dialog's last control. The ring is therefore the dialog's backdrop plus every later sibling of it in `body`, in document order.
 * - Escape closes the viewer from inside the dialog, and also when focus has escaped to `<body>` — a keydown there never reaches this component's React tree, which is why there is a document-level fallback as well as the React handler. Escape raised inside a later portal is left to that portal, so dismissing the tag picker does not also discard the viewer. Pressing on the backdrop and releasing there closes the viewer too, which is the pointer equivalent of Escape.
 * - Focus starts on the dialog, and on close it returns to the control that opened the viewer, falling back to the tile itself when the original element was unmounted by row virtualization.
 * - Arrow keys are handled here, not on `window`, and never while focus is in a text field, a select, or any editable control; those own their own arrow keys.
 *
 * Viewer data is keyed by image id (G07): the jobs request is a query keyed on the image, so a slow response for the previously viewed image cannot land on the current one.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2, X } from '@/components/ui/icons';
import { getTextColorForBackground } from '@/lib/colors';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import type { AnnotationVisibilityPredicate } from '@/hooks/useAnnotationFilters';
import type { AnnotationDisplayState } from '@/hooks/useExploreVisibility';
import {
  getFullSizeThumbnailUrl,
  sharedImagesApi,
  type SharedImage,
  type Tag as TagType,
  type TagCategory,
} from '@/lib/data-management-client';
import { FullscreenImage } from './FullscreenImage';
import TagSelectorDropdown from '../TagSelectorDropdown';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Elements that belong to the dialog's focus ring but live outside its subtree: every later sibling
 * of the backdrop in `body`, which is where a portal opened from inside the dialog lands. `#root` is
 * excluded defensively — it precedes the portal, and it is inert while the dialog is open.
 */
function satelliteContainers(backdrop: HTMLElement | null): HTMLElement[] {
  if (!backdrop) return [];
  const containers: HTMLElement[] = [];
  for (let sibling = backdrop.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
    if (sibling instanceof HTMLElement && sibling.id !== 'root') containers.push(sibling);
  }
  return containers;
}

/** Everything Tab may reach while the dialog is open, in document order: the dialog first, then any portal it opened. */
function collectFocusable(backdrop: HTMLElement | null): HTMLElement[] {
  if (!backdrop) return [];
  const focusable: HTMLElement[] = [];
  [backdrop, ...satelliteContainers(backdrop)].forEach((container) => {
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR).forEach((element) => {
      if (element.offsetParent === null && element !== document.activeElement) return;
      if (!focusable.includes(element)) focusable.push(element);
    });
  });
  return focusable;
}

/** True when a portal opened from inside the dialog is still on screen and can take focus. */
function hasOpenSatellite(backdrop: HTMLElement | null): boolean {
  return satelliteContainers(backdrop).some(
    (container) => container.querySelector(FOCUSABLE_SELECTOR) !== null
  );
}

/** Controls that own their arrow keys. Navigating images while one of them has focus would steal the keystroke from the user's caret or option list. */
function ownsArrowKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  const role = target.getAttribute('role');
  return role === 'combobox' || role === 'listbox' || role === 'textbox' || role === 'slider';
}

function getJobStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    assigned: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    review: 'bg-purple-100 text-purple-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
  };
  return statusColors[status] || 'bg-gray-100 text-gray-700';
}

/** Warms the shared authenticated-image cache for a neighbouring image so stepping to it is instant. Renders nothing; the cache entry outlives this subscriber. */
function PrefetchImage({ url }: { url: string | null }) {
  useAuthenticatedImage(url);
  return null;
}

export interface ImageDetailDialogProps {
  /** The image to show. Always the live object from the gallery query, looked up by id, so tag edits elsewhere are reflected here. */
  image: SharedImage;
  /** 1-based position within the matching result set. */
  position: number;
  /** Server-reported total for the current filters — the honest denominator, not the number of loaded images. */
  matchingTotal: number;
  /** Images materialised in the client, reported alongside the position when it differs from the total. */
  loadedCount: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  /** True while the next page is being fetched to continue past the last loaded image. */
  isAdvancing?: boolean;
  /** Full-size URLs of the adjacent images, prefetched through the shared cache. */
  prefetchUrls?: (string | null)[];
  allTags: TagType[];
  tagCategories: TagCategory[];
  onAddTags: (imageId: string, tagIds: string[]) => void;
  onRemoveTag: (imageId: string, tagId: string) => void;
  isAddTagPending?: boolean;
  isRemoveTagPending?: boolean;
  displayOptions?: AnnotationDisplayState;
  shouldShowAnnotation?: AnnotationVisibilityPredicate;
  onAnnotate: (imageId: string, jobId: number) => void;
  /** The control the viewer was opened from. Focus returns here on close when it is still in the document. */
  restoreFocusTo?: HTMLElement | null;
}

export function ImageDetailDialog({
  image,
  position,
  matchingTotal,
  loadedCount,
  onClose,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  isAdvancing = false,
  prefetchUrls = [],
  allTags,
  tagCategories,
  onAddTags,
  onRemoveTag,
  isAddTagPending = false,
  isRemoveTagPending = false,
  displayOptions,
  shouldShowAnnotation,
  onAnnotate,
  restoreFocusTo,
}: ImageDetailDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  /**
   * What the pointer press that is about to become a click should do. Decided on mousedown, not on
   * the click: a drag that begins inside the dialog and ends on the backdrop is not a dismissal, and
   * the tag picker dismisses itself on the same mousedown, so by click time it is no longer possible
   * to tell that a press landed on the backdrop only to close that panel.
   */
  const backdropPressRef = useRef<'none' | 'dismiss' | 'refocus'>('none');
  const imageId = image.id;

  // Jobs are a query keyed by image id, which is what makes a slow response
  // harmless: it resolves into its own cache entry instead of overwriting the
  // job list of whichever image the user has moved on to (G07).
  const {
    data: jobs,
    isLoading: jobsLoading,
    isError: jobsIsError,
  } = useQuery({
    queryKey: ['shared-image-jobs', imageId],
    queryFn: () => sharedImagesApi.getImageJobs(imageId),
    staleTime: 30000,
  });

  // The chosen job is stored with the image it belongs to, so stepping to another image cannot
  // carry the previous image's annotation target with it.
  const [jobChoice, setJobChoice] = useState<{ imageId: string; jobId: number } | null>(null);
  const selectedJobId = jobChoice?.imageId === imageId ? jobChoice.jobId : null;

  const activeJobs = useMemo(() => (jobs ?? []).filter((job) => !job.job_is_archived), [jobs]);
  const annotateJobId = activeJobs.length === 1 ? activeJobs[0].job_id : selectedJobId;

  const tagsByCategory = useMemo(() => {
    const grouped: Record<string, { category: TagCategory | null; tags: TagType[] }> = {};
    const sorted = [...image.tags].sort((a, b) => {
      if (a.category_id && !b.category_id) return -1;
      if (!a.category_id && b.category_id) return 1;
      return 0;
    });
    sorted.forEach((tag) => {
      const key = tag.category_id || 'uncategorized';
      if (!grouped[key]) {
        const category = tag.category_id
          ? tagCategories.find((c) => c.id === tag.category_id) || null
          : null;
        grouped[key] = { category, tags: [] };
      }
      grouped[key].tags.push(tag);
    });
    return grouped;
  }, [image.tags, tagCategories]);

  // Modal semantics: the rest of the application is inert and hidden from
  // assistive technology for as long as the dialog is open, and focus is moved
  // into the dialog and returned to its opener afterwards.
  useEffect(() => {
    const opener =
      restoreFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const appRoot = document.getElementById('root');
    const previousOverflow = document.body.style.overflow;

    appRoot?.setAttribute('inert', '');
    appRoot?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = 'hidden';

    const frame = requestAnimationFrame(() => {
      const node = dialogRef.current;
      if (!node) return;
      if (node.contains(document.activeElement)) return;
      node.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      appRoot?.removeAttribute('inert');
      appRoot?.removeAttribute('aria-hidden');
      document.body.style.overflow = previousOverflow;

      // Prefer the exact control that opened the viewer. Row virtualization can
      // unmount it while the dialog is open, so fall back to the tile's own open
      // button, which the grid keeps as its tab stop for that image.
      const fallback = document.querySelector<HTMLElement>(
        `[data-image-id="${CSS.escape(imageId)}"] [data-tile-control="open"]`
      );
      const target = opener && opener.isConnected ? opener : fallback;
      target?.focus();
    };
    // The opener and the inert background are established once per dialog, not
    // per image: stepping to the next image must not re-run focus management.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape has to work even when nothing in the dialog has focus. Pressing the backdrop moves
  // focus to `<body>`, and a keydown on `body` never passes through the React tree that owns the
  // dialog, so the handler below would never see it. Anything focused — including a later portal's
  // own controls — is left to the React handler, which keeps the tag picker's Escape to itself.
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.target !== document.body && event.target !== document.documentElement) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleBackdropMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      backdropPressRef.current = 'none';
      return;
    }
    // With the tag picker's panel open, a press outside it is dismissing that panel and must not
    // also discard the viewer underneath — but it would still leave focus on `<body>`, so the
    // dialog takes focus back instead.
    backdropPressRef.current = hasOpenSatellite(backdropRef.current) ? 'refocus' : 'dismiss';
  }, []);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const press = backdropPressRef.current;
      backdropPressRef.current = 'none';
      if (event.target !== event.currentTarget) return;
      if (press === 'dismiss') onClose();
      else if (press === 'refocus') dialogRef.current?.focus();
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        // A portal the dialog opened (the tag picker) reaches this handler through the React tree
        // even though it is a DOM sibling. Escape there closes that panel, not the viewer.
        if (!dialogRef.current?.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === 'Tab') {
        const node = dialogRef.current;
        if (!node) return;
        const focusable = collectFocusable(backdropRef.current);
        if (focusable.length === 0) {
          event.preventDefault();
          node.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        // Focus that is neither on the dialog nor anywhere in the ring has escaped — a backdrop
        // press leaves it on `<body>` — so the next Tab pulls it back in rather than walking off
        // into an inert page.
        const escaped =
          active !== node && !(active instanceof HTMLElement && focusable.includes(active));
        if (!event.shiftKey && (escaped || active === last || active === node)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && (escaped || active === first || active === node)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (ownsArrowKeys(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'ArrowLeft') {
        if (hasPrevious) onPrevious();
      } else if (hasNext) {
        onNext();
      }
    },
    [onClose, onPrevious, onNext, hasPrevious, hasNext]
  );

  const positionLabel =
    matchingTotal > 0
      ? `${position.toLocaleString()} of ${matchingTotal.toLocaleString()}`
      : `${position.toLocaleString()}`;
  const positionTitle =
    matchingTotal > loadedCount
      ? `Image ${position.toLocaleString()} of ${matchingTotal.toLocaleString()} matching the current filters; ${loadedCount.toLocaleString()} loaded so far`
      : `Image ${position.toLocaleString()} of ${matchingTotal.toLocaleString()}`;

  return createPortal(
    <div
      ref={backdropRef}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-detail-dialog-title"
        aria-describedby="image-detail-dialog-position"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="bg-white rounded-2xl shadow-2xl w-[90vw] h-[90vh] overflow-hidden flex flex-col focus:outline-none"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <h2 id="image-detail-dialog-title" className="text-lg font-semibold text-gray-900 truncate">
              {image.filename}
            </h2>
            <span
              id="image-detail-dialog-position"
              className="text-sm text-gray-500 whitespace-nowrap tabular-nums"
              title={positionTitle}
            >
              {positionLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrevious}
              disabled={!hasPrevious}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous image (Left arrow)"
              aria-label="Previous image"
            >
              <ChevronDown className="w-5 h-5 rotate-90" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext || isAdvancing}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Next image (Right arrow)"
              aria-label="Next image"
            >
              {isAdvancing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ChevronDown className="w-5 h-5 -rotate-90" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              title="Close (Esc)"
              aria-label="Close image viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
            <div className="lg:col-span-3 bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center">
              <FullscreenImage
                src={getFullSizeThumbnailUrl(image.thumbnail_url)}
                alt={image.filename}
                className="w-full h-full object-contain"
                bboxes={image.annotation_summary?.bboxes}
                polygons={image.annotation_summary?.polygons}
                displayOptions={displayOptions}
                shouldShowAnnotation={shouldShowAnnotation}
                annotationSummary={image.annotation_summary}
                sourceWidth={image.width}
                sourceHeight={image.height}
              />
            </div>

            <div className="lg:col-span-1 overflow-y-auto space-y-4 pr-1">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">File Info</h3>
                <div className="bg-gray-50 rounded-lg p-3 space-y-3 text-sm">
                  <div>
                    <span className="text-xs text-gray-500 uppercase tracking-wide">Path</span>
                    <p className="text-gray-900 font-mono text-xs break-all mt-1">{image.file_path}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Dimensions</span>
                      <p className="text-gray-900 mt-0.5">
                        {image.width || '?'} × {image.height || '?'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Size</span>
                      <p className="text-gray-900 mt-0.5">
                        {image.file_size_bytes
                          ? `${(image.file_size_bytes / 1024 / 1024).toFixed(2)} MB`
                          : 'Unknown'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Type</span>
                      <p className="text-gray-900 mt-0.5">{image.mime_type || 'Unknown'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-500">Tags</h3>
                  <TagSelectorDropdown
                    tags={allTags.filter((t) => t.category_id === null)}
                    categories={tagCategories}
                    excludeTagIds={image.tags.map((t) => t.id)}
                    onAddTags={(tagIds) => onAddTags(imageId, tagIds)}
                    buttonText="Add Tags"
                    disabled={isAddTagPending}
                    showUsageCount={true}
                    size="sm"
                    showCategoryGrouping={true}
                  />
                </div>

                {image.tags.length === 0 ? (
                  <span className="text-sm text-gray-400">No tags assigned</span>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(tagsByCategory).map(([categoryId, { category, tags }]) => (
                      <div key={categoryId}>
                        <div className="flex items-center gap-2 mb-1.5">
                          {category ? (
                            <>
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: category.color }}
                              />
                              <span className="text-xs font-medium text-gray-600">{category.name}</span>
                            </>
                          ) : (
                            <span className="text-xs font-medium text-gray-400 italic">Uncategorized</span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 pl-4">
                          {tags.map((tag) => {
                            const background = tag.color || '#10B981';
                            const textColor = getTextColorForBackground(tag.color || '#10B981');
                            return (
                              <div
                                key={tag.id}
                                className="px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-2 group"
                                style={{ background, color: textColor }}
                              >
                                <span>{tag.name}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveTag(imageId, tag.id);
                                  }}
                                  disabled={isRemoveTagPending}
                                  className="opacity-60 hover:opacity-100 focus:opacity-100 transition-opacity"
                                  style={{ color: textColor }}
                                  title={`Remove tag ${tag.name}`}
                                  aria-label={`Remove tag ${tag.name}`}
                                >
                                  <X className="w-3 h-3 hover:scale-110" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Jobs &amp; Tasks</h3>
                {jobsLoading ? (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="animate-pulse h-8 bg-gray-200 rounded" />
                  </div>
                ) : jobsIsError ? (
                  <div className="text-sm text-red-600" role="alert">
                    Failed to load job information
                  </div>
                ) : jobs && jobs.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {jobs.map((job) => (
                      <div key={`${job.task_id}-${job.job_id}`} className="bg-gray-50 rounded-lg p-3 text-sm">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{job.task_name}</div>
                            <div className="text-xs text-gray-500 mt-1">Job #{job.job_sequence}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${getJobStatusColor(job.job_status)}`}
                          >
                            {job.job_status}
                          </span>
                          {job.job_is_archived && (
                            <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded">Archived</span>
                          )}
                          {job.assignee_email && (
                            <span className="text-xs text-gray-600 truncate max-w-[150px]">
                              {job.assignee_email}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No jobs assigned</p>
                )}
              </div>

              {image.annotation_summary && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Annotations</h3>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Detections</span>
                      <span className="text-gray-900">{image.annotation_summary.detection_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Segmentations</span>
                      <span className="text-gray-900">{image.annotation_summary.segmentation_count}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap justify-between items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            {activeJobs.length > 1 && (
              <>
                <label htmlFor="image-detail-job-select" className="sr-only">
                  Job to annotate
                </label>
                <select
                  id="image-detail-job-select"
                  value={selectedJobId ?? ''}
                  onChange={(e) =>
                    setJobChoice(e.target.value ? { imageId, jobId: Number(e.target.value) } : null)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a job to annotate...</option>
                  {activeJobs.map((job) => (
                    <option key={job.job_id} value={job.job_id}>
                      {job.task_name} - Job #{job.job_sequence}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              Close
            </button>
            {activeJobs.length > 0 && (
              <button
                type="button"
                onClick={() => annotateJobId && onAnnotate(imageId, annotateJobId)}
                disabled={!annotateJobId}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Annotate
              </button>
            )}
          </div>
        </div>
      </div>
      {prefetchUrls.map((url) => (
        <PrefetchImage key={url ?? 'none'} url={url} />
      ))}
    </div>,
    document.body
  );
}
