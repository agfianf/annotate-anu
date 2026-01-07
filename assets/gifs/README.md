# GIF Assets Checklist

This folder contains demo GIFs for marketing and documentation.

## Recording Checklist

### Annotation Workspace GIFs

| Status | Filename | Feature | Duration | Priority |
|--------|----------|---------|----------|----------|
| [ ] | `annotation-sam3-text-prompt.gif` | Type text → SAM3 mask → accept | 8-10s | P1 |
| [ ] | `annotation-sam3-bbox-prompt.gif` | Draw bbox → SAM3 refines → polygon | 8-10s | P1 |
| [ ] | `annotation-polygon-simplify.gif` | Toggle simplification → reduced points | 10s | P2 |
| [ ] | `annotation-byom-inference.gif` | Switch model → run inference | 8s | P2 |
| [ ] | `annotation-rectangle-tool.gif` | Draw, resize, move bbox | 6s | P3 |
| [ ] | `annotation-polygon-tool.gif` | Draw polygon, edit vertices | 8s | P3 |
| [ ] | `annotation-undo-redo.gif` | Undo/redo chain | 6s | P3 |
| [ ] | `annotation-zoom-pan.gif` | Zoom, pan, fit-to-screen | 6s | P4 |
| [ ] | `annotation-gallery-strip.gif` | Navigate images | 6s | P4 |
| [ ] | `annotation-job-sync.gif` | Sync status, sync now | 6s | P4 |
| [ ] | `annotation-coco-export.gif` | Export to COCO JSON | 8s | P3 |
| [ ] | `annotation-yolo-export.gif` | Export to YOLO format | 8s | P3 |
| [ ] | `annotation-shortcuts.gif` | Keyboard shortcuts panel | 6s | P4 |

### Explore Gallery GIFs

| Status | Filename | Feature | Duration | Priority |
|--------|----------|---------|----------|----------|
| [ ] | `explore-gallery-virtualized-scroll.gif` | Smooth scroll 1000+ images | 8s | P1 |
| [ ] | `explore-gallery-tri-state-tags.gif` | Include/exclude/idle + AND/OR | 10s | P1 |
| [ ] | `explore-gallery-histogram-filter.gif` | Multi-select histogram bars | 12s | P1 |
| [ ] | `explore-gallery-quality-metrics.gif` | Process button → progress → complete | 15s | P1 |
| [ ] | `explore-gallery-confidence-slider.gif` | Drag sliders, gallery updates | 8s | P2 |
| [ ] | `explore-gallery-bulk-selection.gif` | Multi-select, bulk tag | 10s | P2 |
| [ ] | `explore-gallery-fullscreen-view.gif` | Click → modal → navigate | 8s | P3 |
| [ ] | `explore-gallery-model-source.gif` | Filter by SAM3/BYOM/manual | 8s | P3 |
| [ ] | `explore-gallery-section-toggles.gif` | Collapse/expand sections | 6s | P4 |
| [ ] | `explore-gallery-overlay-toggle.gif` | Toggle bboxes/polygons/labels | 8s | P4 |
| [ ] | `explore-gallery-spatial-heatmap.gif` | Show 2D heatmap | 8s | P3 |
| [ ] | `explore-gallery-class-balance.gif` | Label distribution chart | 8s | P4 |
| [ ] | `explore-gallery-pixelgrid-loader.gif` | Loading animation | 4s | P4 |
| [ ] | `explore-gallery-task-job-filter.gif` | Select task/job scope | 8s | P4 |
| [ ] | `explore-gallery-export-workflow.gif` | Select → export → download | 10s | P3 |

## Recording Settings

| Setting | Value |
|---------|-------|
| Resolution | 1920x1080 or 1280x720 |
| Frame Rate | 30 FPS |
| Format | GIF or WebP (WebP preferred) |
| Max File Size | < 5MB per GIF |
| Mouse Cursor | Visible, deliberate movements |

## Tools for Recording

- **macOS**: Kap, Gifox, CleanShot X
- **Windows**: ScreenToGif, ShareX
- **Linux**: Peek, Gifine
- **Cross-platform**: OBS Studio (record → convert)

## Conversion Commands

```bash
# Convert MP4 to GIF with good quality
ffmpeg -i input.mp4 -vf "fps=15,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 output.gif

# Convert to WebP (smaller file size)
ffmpeg -i input.mp4 -vf "fps=15,scale=1280:-1" -c:v libwebp -lossless 0 -q:v 75 -loop 0 output.webp

# Optimize existing GIF
gifsicle -O3 --colors 256 input.gif -o output.gif
```

## After Recording

1. Check file size (< 5MB)
2. Verify smooth playback
3. Update README status: `[ ]` → `[x]`
4. Commit with message: `docs(assets): add {feature} demo gif`
