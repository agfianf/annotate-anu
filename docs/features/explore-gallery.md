# Explore Gallery and Filters

The Explore view provides a fast, virtualized gallery with rich filtering and analytics.
Use it to review large datasets, tag images, and start exports.

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

## Visibility Controls

- Toggle tag visibility per tag or category.
- Toggle annotation overlays (bboxes, polygons, labels).
- Visibility preferences persist per project in localStorage.

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
