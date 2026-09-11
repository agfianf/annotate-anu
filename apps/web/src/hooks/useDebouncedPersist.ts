/**
 * Debounced localStorage persistence.
 *
 * Writes `JSON.stringify(value)` under `key` on a trailing debounce so rapid
 * state changes (toggling many checkboxes, dragging a slider) do not hit
 * localStorage on every render. Pending writes are flushed when the page is
 * hidden or unloaded (`pagehide`, `visibilitychange`) and when the owning
 * component unmounts, so nothing is lost on navigation or tab close.
 *
 * Pass `key = null` to disable persistence.
 */

import { useCallback, useEffect, useRef } from 'react';

interface PendingWrite {
  key: string;
  value: unknown;
}

export function useDebouncedPersist<T>(key: string | null, value: T, ms = 300): void {
  const pendingRef = useRef<PendingWrite | null>(null);
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    try {
      localStorage.setItem(pending.key, JSON.stringify(pending.value));
    } catch (e) {
      console.warn(`Failed to persist "${pending.key}" to localStorage:`, e);
    }
  }, []);

  // Schedule a trailing write whenever the key or value changes.
  useEffect(() => {
    if (key === null) return;

    // A write for a different key is still pending: flush it now so a key
    // switch (e.g. navigating between projects) never drops the last change.
    if (pendingRef.current && pendingRef.current.key !== key) {
      flush();
    }

    pendingRef.current = { key, value };
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      flush();
    }, ms);
  }, [key, value, ms, flush]);

  // Flush on page hide / tab hidden and on unmount.
  useEffect(() => {
    const onPageHide = () => flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, [flush]);
}
