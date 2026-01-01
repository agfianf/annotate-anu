/**
 * Deduplicated toast hook for analytics panels
 * Prevents duplicate toasts in React StrictMode by using:
 * - Toast ID to prevent duplicates
 * - Debounce window (100ms) for rapid successive calls
 * - Liquid glass styling (emerald gradient + backdrop blur)
 */

import { useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

interface ToastOptions {
  icon?: string;
  duration?: number;
}

/**
 * Liquid glass toast styling (emerald theme)
 */
const LIQUID_GLASS_STYLE = {
  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 253, 244, 0.98) 100%)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(16, 185, 129, 0.3)',
  boxShadow: '0 8px 32px rgba(16, 185, 129, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.5) inset',
  color: '#065f46', // emerald-800
  fontWeight: 500,
  padding: '12px 16px',
  borderRadius: '12px',
};

/**
 * Debounce window in milliseconds
 * Ignores duplicate toasts within this timeframe
 */
const DEBOUNCE_MS = 100;

/**
 * Hook that provides deduplicated toast notifications with liquid glass styling
 * @returns Object with showSuccess method
 */
export function useAnalyticsToast() {
  const lastToastRef = useRef<{ message: string; timestamp: number } | null>(null);

  const showSuccess = useCallback((message: string, options: ToastOptions = {}) => {
    const now = Date.now();

    // Deduplicate: ignore if same message within debounce window
    if (
      lastToastRef.current &&
      lastToastRef.current.message === message &&
      now - lastToastRef.current.timestamp < DEBOUNCE_MS
    ) {
      return;
    }

    lastToastRef.current = { message, timestamp: now };

    // Generate a stable toast ID based on message to prevent duplicates
    const toastId = `analytics-${message.replace(/\s+/g, '-').toLowerCase().slice(0, 50)}`;

    toast.success(message, {
      id: toastId,
      icon: options.icon || '✓',
      duration: options.duration || 2500,
      style: LIQUID_GLASS_STYLE,
    });
  }, []);

  return { showSuccess };
}
