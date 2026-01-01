# Pixi Performance Experiments

This document describes the experimental PixiJS renderers in the web app.
They are not wired into the main annotation canvas by default.

## Status

- Experimental components live in `apps/web/src/components/canvas/`.
- The primary annotation canvas uses Konva (`Canvas.tsx`).

## Components

- `AnnotationCanvasGL.tsx`: baseline Pixi renderer.
- `AnnotationCanvasGL.optimized.tsx`: quadtree + dirty tracking.
- `AnnotationCanvasGL.viewport.tsx`: pixi-viewport camera control.
- `HybridCanvas.tsx`: hooks for Konva + Pixi hybrid mode.
- `pixi/optimization/Quadtree.ts`: spatial indexing.
- `pixi/optimization/DirtyTracker.ts`: incremental updates.
- `pixi/optimization/LODRenderer.ts`: level-of-detail helpers.

## When to Use

If you see performance issues with very large annotation counts, the optimized Pixi
paths are the starting point for a WebGL-based renderer. Expect integration work in
`Canvas.tsx` and additional QA for selection, transforms, and keyboard tooling.

## Suggested Integration Steps

1. Wire `HybridCanvas` into `Canvas.tsx` with a feature flag.
2. Use `AnnotationCanvasGL.viewport.tsx` for the Pixi layer.
3. Keep Konva for active selection and editing.
4. Measure FPS at 500+ annotations before enabling by default.
