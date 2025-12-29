/**
 * Hook for using Quadtree Web Worker for viewport culling
 *
 * This hook manages communication with the QuadtreeWorker to offload
 * spatial queries from the main thread, improving pan/zoom performance.
 */

import { useRef, useCallback, useEffect } from 'react';
import type { AABB } from './Quadtree';

// Import types from worker (we'll use inline Worker for Vite compatibility)
interface WorkerMessage {
  type: 'init' | 'update' | 'query' | 'clear';
  id: number;
  data?: {
    bounds?: AABB;
    annotations?: Array<{
      id: string;
      type: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      points?: { x: number; y: number }[];
    }>;
    viewport?: AABB;
  };
}

interface WorkerResponse {
  type: 'init' | 'update' | 'query' | 'clear' | 'error';
  id: number;
  data?: {
    visibleIds?: string[];
    stats?: {
      totalAnnotations: number;
      queryTimeMs: number;
    };
    error?: string;
  };
}

interface QueryResult {
  visibleIds: string[];
  queryTimeMs: number;
}

interface UseQuadtreeWorkerOptions {
  enabled?: boolean;
  onQueryComplete?: (result: QueryResult) => void;
}

/**
 * Hook to manage Quadtree Web Worker for viewport culling
 */
export function useQuadtreeWorker(options: UseQuadtreeWorkerOptions = {}) {
  const { enabled = true, onQueryComplete } = options;

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingQueriesRef = useRef<Map<number, (result: QueryResult) => void>>(new Map());
  const isInitializedRef = useRef(false);
  const onQueryCompleteRef = useRef(onQueryComplete);

  // Keep callback ref updated
  useEffect(() => {
    onQueryCompleteRef.current = onQueryComplete;
  }, [onQueryComplete]);

  // Initialize worker
  useEffect(() => {
    if (!enabled) return;

    // Create inline worker using Vite's ?worker import
    // For now, we'll use a blob URL approach for compatibility
    const workerCode = `
      // Quadtree implementation inlined for worker
      class Quadtree {
        constructor(bounds, capacity = 8, maxDepth = 8) {
          this.capacity = capacity;
          this.maxDepth = maxDepth;
          this.annotationToNode = new Map();
          this.root = {
            bounds,
            annotations: new Map(),
            children: null,
            divided: false,
          };
        }

        insert(id, bounds) {
          this._insert(this.root, id, bounds, 0);
        }

        _insert(node, id, bounds, depth) {
          if (!this.intersects(node.bounds, bounds)) return false;
          if (node.annotations.size < this.capacity && !node.divided) {
            node.annotations.set(id, bounds);
            this.annotationToNode.set(id, node);
            return true;
          }
          if (!node.divided && depth < this.maxDepth) {
            this.subdivide(node);
          }
          if (node.divided && node.children) {
            for (const child of node.children) {
              if (this._insert(child, id, bounds, depth + 1)) return true;
            }
          }
          node.annotations.set(id, bounds);
          this.annotationToNode.set(id, node);
          return true;
        }

        query(viewport) {
          const results = [];
          this._query(this.root, viewport, results);
          return results;
        }

        _query(node, viewport, results) {
          if (!this.intersects(node.bounds, viewport)) return;
          for (const [id, bounds] of node.annotations) {
            if (this.intersects(bounds, viewport)) {
              results.push(id);
            }
          }
          if (node.divided && node.children) {
            for (const child of node.children) {
              this._query(child, viewport, results);
            }
          }
        }

        clear() {
          this.root.annotations.clear();
          this.root.children = null;
          this.root.divided = false;
          this.annotationToNode.clear();
        }

        subdivide(node) {
          const { x, y, width, height } = node.bounds;
          const hw = width / 2, hh = height / 2;
          node.children = [
            { bounds: { x, y, width: hw, height: hh }, annotations: new Map(), children: null, divided: false },
            { bounds: { x: x + hw, y, width: hw, height: hh }, annotations: new Map(), children: null, divided: false },
            { bounds: { x, y: y + hh, width: hw, height: hh }, annotations: new Map(), children: null, divided: false },
            { bounds: { x: x + hw, y: y + hh, width: hw, height: hh }, annotations: new Map(), children: null, divided: false },
          ];
          node.divided = true;
        }

        intersects(a, b) {
          return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
        }

        getStats() {
          return { totalAnnotations: this.annotationToNode.size };
        }
      }

      function getAnnotationBounds(ann) {
        if (ann.type === 'rectangle' && ann.x !== undefined) {
          return { x: ann.x, y: ann.y, width: ann.width || 0, height: ann.height || 0 };
        } else if (ann.type === 'polygon' && ann.points) {
          const xs = ann.points.map(p => p.x);
          const ys = ann.points.map(p => p.y);
          const minX = Math.min(...xs), minY = Math.min(...ys);
          const maxX = Math.max(...xs), maxY = Math.max(...ys);
          return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
        return { x: 0, y: 0, width: 0, height: 0 };
      }

      let quadtree = null;

      self.onmessage = (e) => {
        const { type, id, data } = e.data;
        try {
          switch (type) {
            case 'init':
              quadtree = new Quadtree(data.bounds);
              self.postMessage({ type: 'init', id, data: {} });
              break;
            case 'update':
              if (!quadtree) throw new Error('Not initialized');
              quadtree.clear();
              for (const ann of data.annotations) {
                quadtree.insert(ann.id, getAnnotationBounds(ann));
              }
              self.postMessage({ type: 'update', id, data: { stats: quadtree.getStats() } });
              break;
            case 'query':
              if (!quadtree) throw new Error('Not initialized');
              const start = performance.now();
              const visibleIds = quadtree.query(data.viewport);
              const queryTimeMs = performance.now() - start;
              self.postMessage({ type: 'query', id, data: { visibleIds, stats: { queryTimeMs } } });
              break;
            case 'clear':
              if (quadtree) quadtree.clear();
              self.postMessage({ type: 'clear', id, data: {} });
              break;
          }
        } catch (error) {
          self.postMessage({ type: 'error', id, data: { error: error.message } });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { type, id, data } = event.data;

      if (type === 'error') {
        console.error('[QUADTREE WORKER] Error:', data?.error);
        pendingQueriesRef.current.delete(id);
        return;
      }

      if (type === 'query' && data?.visibleIds) {
        const callback = pendingQueriesRef.current.get(id);
        if (callback) {
          callback({
            visibleIds: data.visibleIds,
            queryTimeMs: data.stats?.queryTimeMs || 0,
          });
          pendingQueriesRef.current.delete(id);
        }
        onQueryCompleteRef.current?.({
          visibleIds: data.visibleIds,
          queryTimeMs: data.stats?.queryTimeMs || 0,
        });
      }
    };

    worker.onerror = (error) => {
      console.error('[QUADTREE WORKER] Worker error:', error);
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      workerRef.current = null;
      isInitializedRef.current = false;
    };
  }, [enabled]);

  /**
   * Initialize Quadtree with image bounds
   */
  const initialize = useCallback((bounds: AABB) => {
    if (!workerRef.current) return;

    const id = ++requestIdRef.current;
    const message: WorkerMessage = {
      type: 'init',
      id,
      data: { bounds },
    };
    workerRef.current.postMessage(message);
    isInitializedRef.current = true;
    console.log('[QUADTREE WORKER HOOK] Initialized with bounds:', bounds);
  }, []);

  /**
   * Update Quadtree with annotations
   */
  const updateAnnotations = useCallback((annotations: Array<{
    id: string;
    type: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    points?: { x: number; y: number }[];
  }>) => {
    if (!workerRef.current || !isInitializedRef.current) return;

    const id = ++requestIdRef.current;
    const message: WorkerMessage = {
      type: 'update',
      id,
      data: { annotations },
    };
    workerRef.current.postMessage(message);
  }, []);

  /**
   * Query visible annotations within viewport
   * Returns a Promise that resolves with visible IDs
   */
  const query = useCallback((viewport: AABB): Promise<QueryResult> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current || !isInitializedRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = ++requestIdRef.current;
      pendingQueriesRef.current.set(id, resolve);

      const message: WorkerMessage = {
        type: 'query',
        id,
        data: { viewport },
      };
      workerRef.current.postMessage(message);

      // Timeout fallback
      setTimeout(() => {
        if (pendingQueriesRef.current.has(id)) {
          pendingQueriesRef.current.delete(id);
          reject(new Error('Query timeout'));
        }
      }, 5000);
    });
  }, []);

  /**
   * Clear Quadtree
   */
  const clear = useCallback(() => {
    if (!workerRef.current) return;

    const id = ++requestIdRef.current;
    const message: WorkerMessage = {
      type: 'clear',
      id,
      data: {},
    };
    workerRef.current.postMessage(message);
  }, []);

  return {
    initialize,
    updateAnnotations,
    query,
    clear,
    isEnabled: enabled && workerRef.current !== null,
  };
}

export type { AABB, QueryResult };
