/**
 * Web Worker for offloading Quadtree spatial queries
 *
 * Benefits:
 * - Moves O(log n + k) query computation off main thread
 * - Prevents frame drops during intensive culling operations
 * - Allows continuous smooth pan/zoom while culling happens in background
 *
 * Usage:
 * - Main thread sends viewport bounds + annotation data
 * - Worker performs quadtree query and returns visible IDs
 */

import { Quadtree, getAnnotationBounds, type AABB } from './Quadtree';

// Message types for type-safe communication
export interface WorkerMessage {
  type: 'init' | 'update' | 'query' | 'clear';
  id: number; // Request ID for matching responses
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

export interface WorkerResponse {
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

// Worker state
let quadtree: Quadtree | null = null;

// Handle messages from main thread
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, id, data } = event.data;

  try {
    switch (type) {
      case 'init': {
        // Initialize Quadtree with image bounds
        if (data?.bounds) {
          quadtree = new Quadtree(data.bounds);
          postResponse({ type: 'init', id, data: {} });
          console.log('[QUADTREE WORKER] Initialized with bounds:', data.bounds);
        } else {
          throw new Error('Missing bounds for init');
        }
        break;
      }

      case 'update': {
        // Update Quadtree with new annotations
        if (!quadtree) {
          throw new Error('Quadtree not initialized');
        }
        if (!data?.annotations) {
          throw new Error('Missing annotations for update');
        }

        // Clear and rebuild (simpler than incremental for now)
        quadtree.clear();
        for (const ann of data.annotations) {
          const bounds = getAnnotationBounds(ann);
          quadtree.insert(ann.id, bounds);
        }

        const stats = quadtree.getStats();
        postResponse({
          type: 'update',
          id,
          data: {
            stats: {
              totalAnnotations: stats.totalAnnotations,
              queryTimeMs: 0,
            },
          },
        });
        console.log('[QUADTREE WORKER] Updated with', data.annotations.length, 'annotations');
        break;
      }

      case 'query': {
        // Query visible annotations within viewport
        if (!quadtree) {
          throw new Error('Quadtree not initialized');
        }
        if (!data?.viewport) {
          throw new Error('Missing viewport for query');
        }

        const startTime = performance.now();
        const visibleIds = quadtree.query(data.viewport);
        const queryTimeMs = performance.now() - startTime;

        postResponse({
          type: 'query',
          id,
          data: {
            visibleIds,
            stats: {
              totalAnnotations: quadtree.getStats().totalAnnotations,
              queryTimeMs,
            },
          },
        });
        break;
      }

      case 'clear': {
        // Clear Quadtree
        if (quadtree) {
          quadtree.clear();
        }
        postResponse({ type: 'clear', id, data: {} });
        console.log('[QUADTREE WORKER] Cleared');
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    postResponse({
      type: 'error',
      id,
      data: { error: error instanceof Error ? error.message : String(error) },
    });
  }
};

function postResponse(response: WorkerResponse) {
  self.postMessage(response);
}

// Export types for use in main thread
export type { AABB };
