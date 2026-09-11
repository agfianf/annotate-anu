/**
 * Hook to load images that require authentication
 * Fetches images with JWT token and creates blob URLs for <img> tags
 *
 * Blob URLs are kept in a module-level LRU cache so that scrolling back to a
 * thumbnail (or re-opening the same image) reuses the already-decoded blob
 * instead of refetching it. Concurrent requests for the same URL share one
 * in-flight fetch. Entries are only revoked when the cache grows past its
 * entry or byte budget, and never while a mounted component still uses them.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { getAccessToken } from '../lib/api-client';

export interface AuthenticatedImageState {
  blobUrl: string | null;
  isLoading: boolean;
  error: Error | null;
}

interface CacheEntry {
  promise: Promise<string>;
  blobUrl?: string;
  error?: Error;
  /** Number of mounted hook instances currently using this entry */
  refCount: number;
  lastUsed: number;
  /** Blob size in bytes (0 until loaded) */
  size: number;
  /** Immutable snapshot handed to React; replaced on every state change */
  snapshot: AuthenticatedImageState;
  listeners: Set<() => void>;
}

/** Evict least-recently-used idle entries once the cache exceeds this many URLs */
const MAX_ENTRIES = 300;
/** Also evict when idle blobs exceed this many bytes (full-size images are large) */
const MAX_BYTES = 256 * 1024 * 1024;

const LOADING_STATE: AuthenticatedImageState = { blobUrl: null, isLoading: true, error: null };
const EMPTY_STATE: AuthenticatedImageState = { blobUrl: null, isLoading: false, error: null };

// Map preserves insertion order; entries are re-inserted on use so iteration
// order is least-recently-used first.
const cache = new Map<string, CacheEntry>();
let totalBytes = 0;

function notify(entry: CacheEntry): void {
  entry.listeners.forEach((listener) => listener());
}

function touch(url: string, entry: CacheEntry): void {
  entry.lastUsed = Date.now();
  cache.delete(url);
  cache.set(url, entry);
}

async function fetchBlobUrl(url: string): Promise<{ blobUrl: string; size: number }> {
  const token = getAccessToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error(`Failed to load image: ${response.status}`);
  }

  const blob = await response.blob();
  return { blobUrl: URL.createObjectURL(blob), size: blob.size };
}

function startFetch(url: string, entry: CacheEntry): void {
  entry.error = undefined;
  entry.blobUrl = undefined;
  entry.snapshot = LOADING_STATE;

  const promise = fetchBlobUrl(url).then(
    ({ blobUrl, size }) => {
      // The entry may have been evicted and replaced while the fetch was in
      // flight; only adopt the result if this entry is still the live one.
      if (cache.get(url) !== entry) {
        URL.revokeObjectURL(blobUrl);
        return blobUrl;
      }
      entry.blobUrl = blobUrl;
      entry.size = size;
      totalBytes += size;
      entry.snapshot = { blobUrl, isLoading: false, error: null };
      notify(entry);
      evictIfNeeded();
      return blobUrl;
    },
    (err: unknown) => {
      const error = err instanceof Error ? err : new Error('Failed to load image');
      entry.error = error;
      entry.snapshot = { blobUrl: null, isLoading: false, error };
      notify(entry);
      throw error;
    }
  );
  // Rejections are surfaced through the snapshot; keep the promise from being
  // reported as unhandled when no one awaits it.
  promise.catch(() => {});
  entry.promise = promise;
}

function acquire(url: string): CacheEntry {
  let entry = cache.get(url);
  if (!entry) {
    entry = {
      promise: Promise.resolve(''),
      refCount: 0,
      lastUsed: Date.now(),
      size: 0,
      snapshot: LOADING_STATE,
      listeners: new Set(),
    };
    cache.set(url, entry);
    startFetch(url, entry);
  } else if (entry.error && entry.refCount === 0) {
    // A previous attempt failed (expired token, transient network error):
    // retry on the next mount, matching the old refetch-on-mount behaviour.
    startFetch(url, entry);
  }
  entry.refCount += 1;
  touch(url, entry);
  return entry;
}

function release(url: string, entry: CacheEntry): void {
  entry.refCount = Math.max(0, entry.refCount - 1);
  entry.lastUsed = Date.now();
  if (entry.refCount === 0) {
    evictIfNeeded();
  }
}

function evictEntry(url: string, entry: CacheEntry): void {
  cache.delete(url);
  if (entry.blobUrl) {
    URL.revokeObjectURL(entry.blobUrl);
    totalBytes -= entry.size;
  }
}

function evictIfNeeded(): void {
  if (cache.size <= MAX_ENTRIES && totalBytes <= MAX_BYTES) return;

  for (const [url, entry] of cache) {
    if (cache.size <= MAX_ENTRIES && totalBytes <= MAX_BYTES) break;
    // Never evict entries in use or still loading; failed entries hold no blob
    // but are cheap to drop as well.
    if (entry.refCount > 0) continue;
    if (!entry.blobUrl && !entry.error) continue;
    evictEntry(url, entry);
  }
}

export function useAuthenticatedImage(imageUrl: string | null): AuthenticatedImageState {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!imageUrl) return () => {};
      const entry = acquire(imageUrl);
      entry.listeners.add(onStoreChange);
      // The snapshot may have changed between render and subscribe (e.g. a
      // shared in-flight fetch resolved); let React re-check it.
      onStoreChange();
      return () => {
        entry.listeners.delete(onStoreChange);
        release(imageUrl, entry);
      };
    },
    [imageUrl]
  );

  const getSnapshot = useCallback((): AuthenticatedImageState => {
    if (!imageUrl) return EMPTY_STATE;
    return cache.get(imageUrl)?.snapshot ?? LOADING_STATE;
  }, [imageUrl]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
