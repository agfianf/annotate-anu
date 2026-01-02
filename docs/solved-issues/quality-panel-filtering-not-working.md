# Quality Panel Filtering Not Working

**Date Solved:** 2026-01-02
**Affected Component:** Quality Tab in Dataset Statistics Panel (Explore Tab)

## Problem Description

When clicking on quality histogram bars (Sharpness, Brightness, Contrast, etc.) and clicking "Apply Filter", the system only showed a toast notification but:
1. Images were not being filtered in the gallery
2. Active filter pills were not appearing in the filter bar
3. The SelectionActionBar buttons were hard to click (z-index issue)

## Root Cause Analysis

### Issue 1: Filter State Not Propagated to API

The filtering architecture has two key parts:

1. **`sidebarFilters` state** (from `useExploreFilters` hook) - stores all filter values
2. **`filters` useMemo** (in `ProjectExploreTab.tsx`) - builds the API query object

**The Problem:** When `handlePanelFilterUpdate` was called, it correctly updated `sidebarFilters` with quality filter values:

```typescript
// This was working - updating state
if (panelFilters.sharpness_min !== undefined) {
  setFilters(prev => ({
    ...prev,
    sharpness_min: panelFilters.sharpness_min,
    sharpness_max: panelFilters.sharpness_max,
  }));
}
```

**BUT** the `filters` useMemo that sends data to the API was not reading these values:

```typescript
// This was the problem - quality filters were missing!
const filters: ExploreFilters = useMemo(() => ({
  search: debouncedSearch,
  tag_ids: includedTagIds,
  width_min: sidebarFilters.widthRange?.min,
  // ... other filters
  // MISSING: quality_min, sharpness_min, brightness_min, etc.
}), [sidebarFilters, ...]);
```

### Issue 2: TypeScript Interface Missing Quality Properties

The `ExploreFiltersState` interface in `useExploreFilters.ts` didn't include quality filter properties:

```typescript
// Before - missing quality filters
export interface ExploreFiltersState {
  tagFilters: Record<string, 'include' | 'exclude'>;
  widthRange?: { min: number; max: number };
  // ... no quality filters defined
}
```

This meant TypeScript didn't warn about the missing properties in the useMemo.

### Issue 3: Active Filter Pills Not Shown

The Active Filters bar in `ProjectExploreTab.tsx` only had pills for dimensions, tags, etc. - no UI for quality filters.

## Solution

### Step 1: Add Quality Properties to ExploreFiltersState

**File:** `apps/web/src/hooks/useExploreFilters.ts`

```typescript
export interface ExploreFiltersState {
  // ... existing properties

  // Quality metric filters (NEW)
  quality_min?: number;
  quality_max?: number;
  sharpness_min?: number;
  sharpness_max?: number;
  brightness_min?: number;
  brightness_max?: number;
  contrast_min?: number;
  contrast_max?: number;
  uniqueness_min?: number;
  uniqueness_max?: number;
  red_min?: number;
  red_max?: number;
  green_min?: number;
  green_max?: number;
  blue_min?: number;
  blue_max?: number;
  issues?: string[];
}
```

### Step 2: Include Quality Filters in API Query

**File:** `apps/web/src/components/ProjectExploreTab.tsx`

```typescript
const filters: ExploreFilters = useMemo(() => ({
  // ... existing filters

  // Quality metric filters (NEW)
  quality_min: sidebarFilters.quality_min,
  quality_max: sidebarFilters.quality_max,
  sharpness_min: sidebarFilters.sharpness_min,
  sharpness_max: sidebarFilters.sharpness_max,
  brightness_min: sidebarFilters.brightness_min,
  brightness_max: sidebarFilters.brightness_max,
  contrast_min: sidebarFilters.contrast_min,
  contrast_max: sidebarFilters.contrast_max,
  uniqueness_min: sidebarFilters.uniqueness_min,
  uniqueness_max: sidebarFilters.uniqueness_max,
  red_min: sidebarFilters.red_min,
  red_max: sidebarFilters.red_max,
  green_min: sidebarFilters.green_min,
  green_max: sidebarFilters.green_max,
  blue_min: sidebarFilters.blue_min,
  blue_max: sidebarFilters.blue_max,
  issues: sidebarFilters.issues?.length ? sidebarFilters.issues : undefined,
}), [sidebarFilters, ...]);
```

### Step 3: Add Quality Filter Pills to UI

**File:** `apps/web/src/components/ProjectExploreTab.tsx`

Added filter pills for each quality metric that show the active range and allow clearing:

```tsx
{(sidebarFilters.sharpness_min !== undefined || sidebarFilters.sharpness_max !== undefined) && (
  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-50 text-cyan-700 rounded-full text-xs">
    <span>Sharpness: {sidebarFilters.sharpness_min?.toFixed(2)} - {sidebarFilters.sharpness_max?.toFixed(2)}</span>
    <button onClick={() => setFilters(prev => ({ ...prev, sharpness_min: undefined, sharpness_max: undefined }))}>
      <X className="w-3 h-3" />
    </button>
  </div>
)}
```

### Step 4: Fix SelectionActionBar Z-Index

**File:** `apps/web/src/components/analytics/shared/PanelComponents.tsx`

Removed `relative z-10` from ChartSection that was creating a stacking context trapping the SelectionActionBar.

## Data Flow Diagram

```
User clicks histogram bar
        ↓
useChartMultiSelect updates selectedIndices
        ↓
User clicks "Apply Filter" button
        ↓
handleSharpnessApply() extracts min/max from selected data
        ↓
onFilterUpdate({ sharpness_min: 0.2, sharpness_max: 0.4 })
        ↓
handlePanelFilterUpdate() in ProjectExploreTab
        ↓
setFilters(prev => ({ ...prev, sharpness_min, sharpness_max }))
        ↓
sidebarFilters state updates
        ↓
filters useMemo recalculates (NOW includes quality filters)
        ↓
useInfiniteExploreImages re-fetches with new filters
        ↓
Backend filters images by sharpness range
        ↓
Gallery displays filtered images
```

## Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/hooks/useExploreFilters.ts` | Added quality filter properties to interface |
| `apps/web/src/components/ProjectExploreTab.tsx` | Added quality filters to useMemo + filter pills UI |
| `apps/web/src/components/analytics/shared/PanelComponents.tsx` | Fixed z-index stacking context |

## Additional Issues Fixed

### Issue 4: Flagged Images Filter Not Working

**Root Cause:** The `handlePanelFilterUpdate` handler was setting `image_uids` on the state, but the `ExploreFiltersState` interface uses `imageId`:

```typescript
// Before - wrong property name
if (panelFilters.image_uids !== undefined) {
  setFilters(prev => ({
    ...prev,
    image_uids: panelFilters.image_uids,  // Wrong! State uses `imageId`
  }));
}

// After - correct property name
if (panelFilters.image_uids !== undefined) {
  setFilters(prev => ({
    ...prev,
    imageId: panelFilters.image_uids,  // Correct! Maps API param to state property
  }));
}
```

**File:** `apps/web/src/components/ProjectExploreTab.tsx:1161-1165`

### Issue 5: Tooltip Clipped by Image Gallery Container

**Root Cause:** The tooltip was rendered inside ChartSection, so it was being clipped by parent containers with `overflow: hidden` or `overflow: auto`.

**Solution:** Used React Portal to render the tooltip at `document.body` level, escaping all parent stacking contexts and overflow rules.

```typescript
// Before - tooltip inside component
{showTooltip && (
  <div className="absolute ... z-[100]">
    {tooltip}
  </div>
)}

// After - tooltip via portal
{showTooltip && createPortal(
  <div
    className="fixed ..."
    style={{ zIndex: 99999, top: tooltipPosition.top, left: tooltipPosition.left }}
  >
    {tooltip}
  </div>,
  document.body
)}
```

**File:** `apps/web/src/components/analytics/shared/PanelComponents.tsx:278-291`

## Files Modified (Complete List)

| File | Changes |
|------|---------|
| `apps/web/src/hooks/useExploreFilters.ts` | Added quality filter properties to interface |
| `apps/web/src/components/ProjectExploreTab.tsx` | Added quality filters to useMemo + filter pills UI + fixed `image_uids` → `imageId` mapping |
| `apps/web/src/components/analytics/shared/PanelComponents.tsx` | Fixed z-index stacking context + tooltip portal |

## Lessons Learned

1. **Always check the full data flow**: The filter handlers were working, but the final API query construction was missing the new filter types.

2. **TypeScript interfaces should match state shape**: When adding new filter types, update both the state interface AND all places that read from that state.

3. **Z-index stacking contexts**: Adding `position: relative` with `z-index` creates a new stacking context. Child elements' z-index is then relative to that context, not the document.

4. **Property name consistency**: The API uses `image_uids` but the state uses `imageId`. Always verify property names match between handler input, state interface, and useMemo output.

5. **Use portals for floating UI**: Tooltips, modals, and dropdowns that need to escape parent overflow/z-index constraints should use React Portals to render at `document.body`.
