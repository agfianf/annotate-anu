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

The Explore view includes dataset analytics panels driven by API Core endpoints:

- Tag distribution
- Annotation coverage
- Class balance
- Spatial heatmap
- Image quality

## Key API Calls

- `projectImagesApi.explore`
- `projectImagesApi.getSidebarAggregations`
- `tagsApi.*` and `tagCategoriesApi.*`
- `sharedImagesApi.getImageJobs`

## Persistence

- Sidebar width: `explorePanelWidth`
- Visibility settings: `explore-visibility-{projectId}`
- Zoom: stored per session via `useZoomLevel`
