# Explore Sidebar and Image Gallery (Project Explore)

**Version**: 1.0
**Last Updated**: 2025-12-26
**Status**: Implemented

## Overview

The Project Explore view combines a unified sidebar for filtering/visibility controls with a virtualized image gallery for fast browsing of large image sets. It supports tag and category management, metadata filtering, annotation overlays, and a fullscreen image detail modal.

## Entry Points

- `apps/web/src/components/ProjectExploreTab.tsx` is the main feature container.
- `apps/web/src/components/explore/sidebar/unified/UnifiedExploreSidebar.tsx` renders the unified sidebar (visible only in full view).
- `apps/web/src/components/explore/VirtualizedImageGrid.tsx` renders the virtualized, justified image grid.
- `apps/web/src/components/explore/ImageThumbnail.tsx` renders each thumbnail tile.
- `apps/web/src/components/explore/FullscreenImage.tsx` renders the fullscreen image view with overlays.

## Data Flow and State

- Filters: `useExploreFilters` (`apps/web/src/hooks/useExploreFilters.ts`) maintains tag and metadata filter state, including tri-state tag filters (include/exclude/idle) and match modes (AND/OR).
- Aggregations: `useSidebarAggregations` (`apps/web/src/hooks/useExploreFilters.ts`) requests histogram stats for width/height/file size, scoped to included tags.
- Visibility: `useExploreVisibility` (`apps/web/src/hooks/useExploreVisibility.ts`) controls what metadata/tags are displayed on thumbnails and stores settings in `localStorage` under `explore-visibility-{projectId}`.
- Images: `useInfiniteExploreImages` (`apps/web/src/hooks/useInfiniteExploreImages.ts`) fetches paged images via `projectImagesApi.explore` and flattens results for the grid.
- Full view: `ExploreViewContext` (`apps/web/src/contexts/ExploreViewContext.tsx`) toggles the `fullview=true` URL param to show the unified sidebar.

## Unified Explore Sidebar

### Layout and Sections

- Header: refresh, show-all, and hide-all visibility controls.
- Tags: uncategorized tags list with tri-state filtering and visibility toggles.
- Labels: tag categories with nested tags, category configuration, and inline tag creation.
- Metadata: image ID selector, width/height/file size range filters, and filepath filters.
- Display: annotation overlay toggles (bboxes, polygons, labels) and style controls (stroke width, fill opacity).
- Footer: shows total tag count.

### Tag and Category Controls

- Tri-state filtering: clicking the filter box cycles idle -> include -> exclude (`useExploreFilters.toggleTag`).
- Category filters: category rows show a summary state (include/exclude/idle/mixed) and apply a batch toggle to all tags in that category.
- Visibility: eye icons toggle visibility for tags and categories. This only affects thumbnail display, not filtering.
- Color editing: clicking the left border opens a color picker for tags/categories (`UnifiedSidebarRow` + `ColorPickerPopup`).
- Inline creation:
  - Tags: `TagCreationInline` creates uncategorized or category-bound tags.
  - Categories: `CategoryCreationInline` creates new categories.
- Category configuration: `CategoryConfigPanel` supports rename, recolor, and batch tag creation.
- Actions menu: delete tags or categories (category deletion removes all tags in the category).

### Filter Match Modes

- A Configuration section appears when tags are filtered.
- Include match mode: ANY (OR) vs ALL (AND) for included tags.
- Exclude match mode: ANY (OR) vs ALL (AND) for excluded tags.
- These map to `include_match_mode` and `exclude_match_mode` in `ExploreFilters`.

### Metadata Filters

- Image IDs: `ImageUidSelector` uses a virtualized list of image IDs and thumbnails. It fetches all images only when opened.
- Width/Height/File size: `NumericRangeFilter` provides a histogram, drag-to-select range, dual slider, and manual inputs.
  - File size auto-switches between KB and MB based on the aggregation range.
- File paths: `FilepathFilter` extracts unique directories from image paths and provides a virtualized, searchable multi-select.

### Persistence and Defaults

- Sidebar width is stored in `localStorage` as `exploreSidebarWidth` and can be resized (min 240px, max 480px).
- Visibility settings are stored per project (`explore-visibility-{projectId}`).
- Show-all resets tag/category visibility and makes all metadata fields visible.
- Hide-all hides all tags, categories, and metadata fields.

## Explore Image Gallery

### Grid and Performance

- Uses `@tanstack/react-virtual` for row virtualization and `useJustifiedRows` for a justified layout based on container width.
- The container width is measured with `ResizeObserver` to recompute layout on resize.
- Infinite scroll fetches the next page when the grid approaches the end.

### Thumbnails and Interactions

- `ImageThumbnail` renders each image tile and uses `useAuthenticatedImage` for signed/authorized image fetches.
- Click zones:
  - Top 50% toggles selection.
  - Bottom 50% opens the fullscreen modal.
- Selection is shown via a checkbox and a floating bulk-action bar (add/remove tags, clear selection).
- Tag rendering:
  - Default state shows first two tags as labeled chips, remaining tags as dots.
  - Hover state shows all tags with optional remove buttons.
  - Category colors can blend with tag colors using a left-to-right gradient.
- Annotation overlays use `AnnotationOverlay` when `annotation_summary` is present.
- Annotation count badge is displayed in the top-right corner.
- Metadata badges are shown based on visibility settings and color choices.

## Fullscreen Image Modal

- Triggered from the image grid (bottom click zone).
- `FullscreenImage` loads a full-size thumbnail, calculates object-contain bounds, and draws annotation overlays within the rendered image bounds.
- Side panel details:
  - File path, dimensions, size, and MIME type.
  - Tags grouped by category, add/remove tag controls.
  - Jobs and tasks associated with the image (from `sharedImagesApi.getImageJobs`).
  - Annotation summary counts.
- Navigation:
  - Previous/next buttons.
  - Left/right arrow keys.
  - ESC closes the modal.
- Annotate action navigates to `/app?jobId=...&imageId=...` when a job is selected.

## API Usage

- Tag management: `tagsApi.listUncategorized`, `tagsApi.create`, `tagsApi.update`, `tagsApi.delete`.
- Category management: `tagCategoriesApi.listWithTags`, `tagCategoriesApi.create`, `tagCategoriesApi.update`, `tagCategoriesApi.delete`.
- Explore images: `projectImagesApi.explore` with `ExploreFilters` (search, tags, match modes, tasks, jobs, annotation status, metadata ranges, paths, image IDs).
- Metadata aggregations: `projectImagesApi.getSidebarAggregations`.
- Tagging actions: `projectImagesApi.bulkTag`, `projectImagesApi.bulkUntag`, `projectImagesApi.removeTag`.
- Image jobs: `sharedImagesApi.getImageJobs`.

## Key Files

- `apps/web/src/components/ProjectExploreTab.tsx`
- `apps/web/src/components/explore/sidebar/unified/UnifiedExploreSidebar.tsx`
- `apps/web/src/components/explore/sidebar/unified/UnifiedSidebarRow.tsx`
- `apps/web/src/components/explore/sidebar/unified/CategoryConfigPanel.tsx`
- `apps/web/src/components/explore/sidebar/ImageUidSelector.tsx`
- `apps/web/src/components/explore/sidebar/NumericRangeFilter.tsx`
- `apps/web/src/components/explore/sidebar/FilepathFilter.tsx`
- `apps/web/src/components/explore/VirtualizedImageGrid.tsx`
- `apps/web/src/components/explore/ImageThumbnail.tsx`
- `apps/web/src/components/explore/FullscreenImage.tsx`
- `apps/web/src/hooks/useExploreFilters.ts`
- `apps/web/src/hooks/useExploreVisibility.ts`
- `apps/web/src/hooks/useInfiniteExploreImages.ts`
