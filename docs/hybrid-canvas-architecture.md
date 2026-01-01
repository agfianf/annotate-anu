# Annotation Canvas Architecture

This document describes the current annotation canvas used in the main annotation app.

## Overview

The annotation app uses Konva for rendering and interaction. The canvas renders the
background image on a static layer and annotations on two layers for performance:

- Static layer: unselected annotations.
- Interactive layer: selected annotations with drag/transform controls.

Pixi-based renderers exist in `apps/web/src/components/canvas/` but are not wired into
`Canvas.tsx` today. Treat them as experimental.

## Layer Stack

1. Background stage (image + boundary)
2. Static annotation layer (non-selected shapes)
3. Interactive annotation layer (selected shapes + transformers)

## Rendering Strategy

- The canvas filters annotations to those in view and always includes selected items.
- Annotations are deduplicated by ID to avoid rendering duplicates.
- Hover and selection state drive styling without reflowing all nodes.

## Zoom and Pan

- Zoom and pan apply to both stages to keep the background and overlays aligned.
- Stroke widths scale with zoom to keep line weights stable.
- Autofit centers the image within the container.

## Performance Features

- Viewport culling: only render annotations visible on screen.
- Static vs interactive layers: isolates expensive transforms.
- Memoized components for static annotations.

## Key Files

- `apps/web/src/components/Canvas.tsx`
- `apps/web/src/components/canvas/` (experimental Pixi renderers)
- `apps/web/src/components/canvas/AnnotationTooltip.tsx`
