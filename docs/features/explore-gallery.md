# Explore Gallery and Filters

The Explore view provides a fast, virtualized gallery with rich filtering and analytics.
Use it to review large datasets, tag images, and start exports.

---

## Feature Demos

> **Note**: GIF placeholders below - replace `[GIF_PLACEHOLDER]` with actual recordings.

### Core Gallery Experience

| Feature | Demo | What to Record |
|---------|------|----------------|
| **Virtualized Gallery** | ![Virtualized scrolling][GIF_PLACEHOLDER] | Smooth scrolling through 1000+ images, showing loading indicators and instant rendering. Zoom in/out with slider. |
| **Multi-Select & Bulk Actions** | ![Bulk selection][GIF_PLACEHOLDER] | Click to select multiple images, floating action bar appears, apply bulk tags, clear selection. |
| **Fullscreen Image View** | ![Fullscreen view][GIF_PLACEHOLDER] | Click image → fullscreen modal with metadata panel, next/prev navigation, "Annotate" button click. |
| **PixelGrid Loader** | ![Loading animation][GIF_PLACEHOLDER] | Show the animated pixel grid loader during gallery updates/filtering. |

### Filtering System

| Feature | Demo | What to Record |
|---------|------|----------------|
| **Tri-State Tag Filtering** | ![Tag filtering][GIF_PLACEHOLDER] | Click tag to include (green), click again to exclude (red), click again to reset. Show AND/OR toggle. |
| **Confidence Range Slider** | ![Confidence filter][GIF_PLACEHOLDER] | Drag min/max sliders to filter annotations by confidence (0.0-1.0), gallery updates in real-time. |
| **Model Source Filter** | ![Model source][GIF_PLACEHOLDER] | Filter by SAM3 predictions vs BYOM models vs manual annotations, show different counts. |
| **Metadata Histograms** | ![Metadata filters][GIF_PLACEHOLDER] | Click on width/height histogram bars to filter, drag file size slider, show instant results. |
| **Directory Path Filter** | ![Path filter][GIF_PLACEHOLDER] | Expand file tree, select specific directories, gallery filters to selected paths only. |

### Visibility Controls

| Feature | Demo | What to Record |
|---------|------|----------------|
| **Section-Level Toggles** | ![Section toggles][GIF_PLACEHOLDER] | Collapse entire Tags section, expand Annotations section, show inheritance to child items. |
| **Annotation Overlays** | ![Overlay toggle][GIF_PLACEHOLDER] | Toggle bboxes on/off, toggle polygons, toggle labels with confidence scores visible. |
| **Per-Tag Visibility** | ![Tag visibility][GIF_PLACEHOLDER] | Show/hide specific tags on thumbnails, category-level toggle affecting all child tags. |

### Analytics Panels

| Feature | Demo | What to Record |
|---------|------|----------------|
| **Dataset Statistics Panel** | ![Dataset stats][GIF_PLACEHOLDER] | Switch between Dimensions/Tags/Quality tabs, show histograms, hover for details. |
| **Multi-Select Histogram Filter** | ![Histogram filter][GIF_PLACEHOLDER] | Click histogram bar to select, Cmd+click for multi-select, click "Apply Filter" → gallery updates. |
| **Spatial Heatmap** | ![Spatial heatmap][GIF_PLACEHOLDER] | Show 2D heatmap of annotation positions, identify clustering patterns, hot zones. |
| **Quality Metrics Processing** | ![Quality processing][GIF_PLACEHOLDER] | Click "Process" button, show progress bar updating, completion → histogram appears. |
| **Class Balance View** | ![Class balance][GIF_PLACEHOLDER] | Show label distribution bars, identify imbalanced classes, click to filter by class. |

### Advanced Workflows

| Feature | Demo | What to Record |
|---------|------|----------------|
| **Annotated vs Unannotated** | ![Annotation status][GIF_PLACEHOLDER] | Toggle "Show annotated only" / "Show unannotated only", count updates in header. |
| **Task/Job Scoping** | ![Task job filter][GIF_PLACEHOLDER] | Select specific task from dropdown, then specific job, gallery shows only those images. |
| **Export from Selection** | ![Export workflow][GIF_PLACEHOLDER] | Select images, click Export, choose format (COCO/YOLO), configure options, download. |

---

## Competitor Comparison

| Feature | AnnotateANU | CVAT | FiftyOne | Encord | Label Studio | Roboflow |
|---------|-------------|------|----------|--------|--------------|----------|
| **Virtualized Gallery** | ✅ Infinite scroll | ⚠️ Paginated | ✅ Grid view | ✅ Grid view | ⚠️ Paginated | ✅ Grid view |
| **Tri-State Tag Filters** | ✅ Include/Exclude/Idle | ❌ | ⚠️ Boolean only | ⚠️ Boolean only | ⚠️ Basic tabs | ❌ |
| **Confidence Filtering** | ✅ Range sliders | ❌ | ✅ Via Python | ⚠️ Limited | ❌ | ❌ |
| **Model Source Tracking** | ✅ Per-annotation | ❌ | ✅ Prediction sets | ⚠️ Limited | ❌ | ❌ |
| **Histogram Filters** | ✅ Multi-select | ❌ | ✅ Via code | ⚠️ Limited | ❌ | ✅ Class balance |
| **Spatial Heatmap** | ✅ Built-in | ❌ | ✅ Via code | ✅ | ❌ | ❌ |
| **Quality Metrics** | ✅ Background processing | ❌ | ⚠️ Via plugins | ✅ Active module | ❌ | ❌ |
| **Real-time Preview** | ✅ Instant | ⚠️ Refresh needed | ✅ | ✅ | ⚠️ | ✅ |
| **Self-Hosted** | ✅ Docker | ✅ Docker | ✅ Local | ❌ Cloud only | ✅ Docker | ⚠️ Limited |
| **SAM Integration** | ✅ SAM3 + BYOM | ✅ SAM | ❌ | ✅ SAM | ⚠️ ML backend | ✅ SAM |
| **Bulk Tagging** | ✅ Multi-select | ⚠️ Limited | ✅ Via Python | ✅ | ✅ | ⚠️ Limited |
| **Export Formats** | ✅ COCO, YOLO, CSV | ✅ Many formats | ✅ Many formats | ✅ Many formats | ✅ Many formats | ✅ Many formats |

### Key Differentiators

| AnnotateANU Advantage | Competitors Lack |
|-----------------------|------------------|
| **Tri-state tag filtering** | Most tools only support include/exclude, not idle state with AND/OR logic |
| **Integrated analytics panels** | FiftyOne requires Python code; CVAT/Label Studio have no built-in analytics |
| **Confidence range sliders** | Real-time visual filtering not available in most annotation tools |
| **Background quality processing** | Only Encord (paid) offers similar automated quality metrics |
| **Model source per annotation** | Track which AI model generated each prediction for debugging |
| **Section-level visibility** | Hierarchical visibility controls unique to AnnotateANU |

---

## Overview

- Entry point: Project > Explore tab
- Container: `apps/web/src/components/ProjectExploreTab.tsx`
- Sidebar: `apps/web/src/components/explore/sidebar/unified/UnifiedExploreSidebar.tsx`
- Gallery: `apps/web/src/components/explore/VirtualizedImageGrid.tsx`

## Layout

- Top toolbar: search, task/job filters, selection actions, export.
- Sidebar: tags, categories, metadata filters, and visibility controls.
- Gallery: virtualized grid with thumbnail overlays and selection.
- Panels: analytics and insights via `AnalyticsPanelContainer`.

## Filters

### Tags and Categories

- Tri-state filter per tag: include, exclude, idle.
- Match mode for include/exclude: AND or OR.
- Category-level toggles apply to all tags in the category.

### Task and Job

- Filter by task IDs and job IDs.
- Toggle annotated vs unannotated images.

### Metadata

- Width, height, and file size ranges (histograms + sliders).
- File path filters with directory selection.
- Image UID filtering for targeted reviews.

### Annotation Filters

- **Confidence range**: Filter by annotation confidence (0.0 - 1.0).
- **Model source**: Filter by which model generated the annotation (SAM3, BYOM models, or manual).
- **Annotation type**: Filter by bbox, polygon, or point annotations.

## Visibility Controls

- Toggle tag visibility per tag or category.
- Toggle annotation overlays (bboxes, polygons, labels).
- **Section-level toggles**: Collapse or expand entire sections (Tags, Annotations) with inheritance to child items.
- Visibility preferences persist per project in localStorage.

### Annotation Display Options

- **Confidence threshold filtering**: Filter annotations by confidence score using min/max sliders.
- **Enhanced labels**: Display confidence scores on annotation labels in the gallery.
- **Annotation highlight mode**: Toggle to highlight annotations with visual emphasis.

## Selection and Bulk Actions

- Click to select multiple images.
- Bulk tag and untag actions on the selection.
- Clear selection from the floating action bar.

## Fullscreen Image View

- Opens from a gallery tile.
- Shows image metadata, tags, and job associations.
- Supports next/previous navigation.
- Provides an "Annotate" action when a job is selected.

## Analytics Panels

The Explore view includes dataset analytics panels driven by API Core endpoints. Panels are organized into consolidated views for better UX:

### Enhanced Dataset Statistics (Consolidated)
- **Dimensions Tab**: Width/height distribution, aspect ratio histogram, resize recommendations
- **Tags Tab**: Tag distribution with category grouping, color-coded bars
- **Quality Tab**: Quality score histogram, status counts (pending/completed/failed), issue breakdown
- Supports multi-select filtering: click bars to filter, Cmd/Ctrl+click for multi-select

### Annotation Analysis (Consolidated)
- **Coverage Tab**: Object count histogram (0, 1, 2-5, 6-10, 11-20, 21+), annotation density
- **BBox/Polygon Counts**: Separate histograms for bounding box and polygon counts per image
- **Spatial Tab**: Canvas-based 2D heatmap showing annotation center distribution
- **Classes Tab**: Label distribution with balance metrics

### Individual Panels (Legacy)
- `dataset-stats`: Tag distribution, dimensions
- `annotation-coverage`: Object count histogram
- `class-balance`: Label distribution
- `spatial-heatmap`: 2D grid density
- `image-quality`: Quality metrics summary

### Panel Features
- **Dynamic binning**: Uses Sturges' rule for optimal histogram bins
- **Multi-select filtering**: Click histogram bars to filter images
- **Category grouping**: Tags grouped by category with collapsible sections
- **Real-time quality processing**: Background job with progress tracking

## Key API Calls

- `projectImagesApi.explore`
- `projectImagesApi.getSidebarAggregations`
- `tagsApi.*` and `tagCategoriesApi.*`
- `sharedImagesApi.getImageJobs`

## Persistence

- Sidebar width: `explorePanelWidth`
- Visibility settings: `explore-visibility-{projectId}`
- Zoom: stored per session via `useZoomLevel`

---

## GIF Recording Guide

### Setup Requirements

1. **Dataset Size**: Load a project with 500+ images for impressive scrolling demos
2. **Variety**: Include images with different sizes, aspect ratios, and annotation counts
3. **Tags**: Create 3-4 tag categories with 5+ tags each (train/val/test, quality levels, object types)
4. **Annotations**: Mix of SAM3 predictions, BYOM results, and manual annotations
5. **Quality Metrics**: Run quality processing to completion before recording

### Recording Tips

| Aspect | Recommendation |
|--------|----------------|
| **Resolution** | 1920x1080 or 1280x720 (crisp, not too large) |
| **Frame Rate** | 30 FPS (smooth but reasonable file size) |
| **Duration** | 5-15 seconds per GIF (focused, not too long) |
| **Mouse** | Visible cursor, deliberate movements |
| **Speed** | Normal speed, slightly slower for complex interactions |
| **Format** | GIF or WebP (WebP preferred for smaller size) |

### Priority Recording Order

Record these first for maximum marketing impact:

1. **Virtualized Gallery** - The "wow" factor of smooth scrolling
2. **Tri-State Tag Filtering** - Unique differentiator
3. **Multi-Select Histogram Filter** - Analytics + filtering combo
4. **Quality Metrics Processing** - Background processing with progress
5. **Confidence Range Slider** - Real-time filtering visual

### Sample Script: Tri-State Tag Filtering

```
1. Start with sidebar visible, all tags idle (gray)
2. Click "train" tag → turns green (include)
3. Gallery filters to show only train images
4. Click "train" again → turns red (exclude)
5. Gallery now shows everything EXCEPT train
6. Click "train" again → turns gray (idle)
7. Toggle AND/OR switch, show different results
8. Duration: ~10 seconds
```

### Sample Script: Multi-Select Histogram Filter

```
1. Open Analytics panel → Dataset Stats → Dimensions tab
2. Hover over histogram bar, show tooltip with count
3. Click one bar → highlights, selection appears
4. Cmd+Click another bar → adds to selection
5. Click "Apply Filter" button
6. Gallery updates to show only matching images
7. Show count change in toolbar
8. Click "Clear" to reset
9. Duration: ~12 seconds
```

### File Naming Convention

```
explore-gallery-{feature-name}.gif
explore-gallery-{feature-name}.webp

Examples:
explore-gallery-virtualized-scroll.gif
explore-gallery-tri-state-tags.gif
explore-gallery-histogram-filter.gif
explore-gallery-quality-metrics.gif
explore-gallery-confidence-slider.gif
```

### Integration in Documentation

After recording, update the placeholder links:

```markdown
<!-- Before -->
| **Virtualized Gallery** | ![Virtualized scrolling][GIF_PLACEHOLDER] | ... |

<!-- After -->
| **Virtualized Gallery** | ![Virtualized scrolling](../../assets/gifs/explore-gallery-virtualized-scroll.gif) | ... |
```

---

## Sources & References

- [CVAT - Computer Vision Annotation Tool](https://www.cvat.ai/)
- [FiftyOne Documentation](https://docs.voxel51.com/user_guide/app.html)
- [Encord Platform Documentation](https://docs.encord.com/)
- [Label Studio - Open Source Data Labeling](https://labelstud.io/)
- [Roboflow Features](https://roboflow.com/features)
- [Best Data Annotation Platforms 2025 - Roboflow Blog](https://blog.roboflow.com/data-annotation-platforms/)
