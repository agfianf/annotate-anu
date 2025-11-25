/**
 * Navigation and localStorage utilities for AnnotateANU
 */

const VISITED_KEY = 'annotateau-visited';

/**
 * Mark that the user has visited the application
 */
export const markAsVisited = (): void => {
  localStorage.setItem(VISITED_KEY, 'true');
};

/**
 * Check if the user has previously visited the application
 */
export const hasVisited = (): boolean => {
  return localStorage.getItem(VISITED_KEY) === 'true';
};

/**
 * Clear the visited flag (useful for testing or reset)
 */
export const clearVisitedFlag = (): void => {
  localStorage.removeItem(VISITED_KEY);
};
