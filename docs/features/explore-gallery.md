# Explore Gallery and Filters

The Explore view is a virtualized image gallery with filtering, selection, bulk tagging, analytics panels, and an image viewer. Use it to review a project's image pool, tag images, and start exports.

**How to read this document.** "Current behaviour" describes what the code in this repository does today. "Planned" describes work that is proposed but not implemented, and is written in the future tense. Nothing outside the Planned section describes a capability that does not exist. Statements here were checked against the source on 2026-09-12, after an independent review of the gallery work found 18 defects and a fix round closed them; the research log they came from is [`.claude/plans/image-gallery-improvements.md`](../../.claude/plans/image-gallery-improvements.md).

**No gallery performance figures appear in this document, because none have been measured.** No browser or API baseline exists for the Explore view. One server-side write was measured, and it is named where it belongs — the bulk-tag throughput under Selection and bulk actions — but it sizes a request ceiling and is not a gallery benchmark. Do not derive one from it.

> **Changed on 2026-09-12: the Annotated filter now counts more images.** "Annotated" used to mean *has a detection or a segmentation*. It now means *has an annotation of any kind* — a classification tag, a detection, a segmentation, or a keypoint. If you run a classification or pose project, its images will move from Unannotated to Annotated, and the analytics coverage tiles will move with them. Nothing was re-annotated; the filter was asking the wrong question and now asks the right one. See [Annotated and unannotated](#annotated-and-unannotated).

---

## Overview

| Concern | Source |
| --- | --- |
| Container, selection, export wiring, viewer state | `apps/web/src/components/ProjectExploreTab.tsx` |
| Image dialog | `apps/web/src/components/explore/ImageDetailDialog.tsx` |
| Grid and row virtualization | `apps/web/src/components/explore/VirtualizedImageGrid.tsx` |
| Tile | `apps/web/src/components/explore/ImageThumbnail.tsx` |
| Viewer image and overlay bounds | `apps/web/src/components/explore/FullscreenImage.tsx` |
| Toolbar, chips, counts, density | `apps/web/src/components/explore/toolbar/` |
| Sidebar | `apps/web/src/components/explore/sidebar/unified/UnifiedExploreSidebar.tsx` |
| Canonical filter contract (client) | `apps/web/src/lib/explore-filter-contract.ts` |
| Saved views and URL state | `apps/web/src/hooks/useExploreUrlSync.ts` |
| Gallery query | `apps/web/src/hooks/useInfiniteExploreImages.ts` |
| Canonical filter contract (server) | `apps/api-core/src/app/schemas/image_filters.py` |
| Filtered SQL | `apps/api-core/src/app/repositories/project_image.py` |

Entry point: Project → Explore tab.

## Layout

- Top toolbar: search, task/job filters, filter chips, count readout, selection actions, density, export.
- Sidebar: tags and categories, metadata filters, attribute filters, and visibility controls.
- Gallery: justified rows of thumbnails in a virtualized scroller.
- Panels: analytics and insights via `AnalyticsPanelContainer`.

---

# Current behaviour

## Browsing the grid

Images are laid out in justified rows and the rows are virtualized, so only rows near the viewport are mounted. Pages load as you scroll.

The density control has five stops — XS, S, M, L, XL — with target row heights of 80, 120, 200, 300, and 400 CSS px (`toolbar/GridSlider.tsx`). The slider is operable with the keyboard and exposes ARIA value attributes; dragging uses Pointer Events, so it works with touch and pen as well as a mouse.

Each tile picks its thumbnail tier from the size it is actually rendered at. The server offers 256, 512, and 1,024 px tiers; the tile chooses the smallest tier that covers its rendered CSS bounds at the device pixel ratio, capped at 2× (`MAX_EFFECTIVE_DPR` in `ImageThumbnail.tsx`). Thumbnails are fetched as authenticated blobs, not through `srcset` — the request carries a bearer token, which a native responsive-image attribute cannot do.

Pagination feedback is local to the bottom of the grid: the sentinel row reserves the height of one incoming row and shows skeleton placeholders while the next page is in flight, honouring the reduced-motion helpers. Loading another page does not blur or cover the images already on screen.

### Failures and retry

Three failure states are distinct:

- **The first page failed.** The gallery shows an error with a Retry control that refetches the query.
- **A later page failed.** Every loaded row and the current selection are kept. The sentinel row shows a message and a "Retry loading more" button, and the grid stops auto-requesting further pages until you retry, so it does not spin against a failing endpoint.
- **One thumbnail failed.** That tile shows a placeholder and its own retry control, which gives that single image a fresh cache key and a fresh fetch without touching the rest of the gallery. The tile distinguishes a missing image, an expired session, and a transient failure.

## Keyboard and pointer access

When the gallery is in explicit-actions mode — which is how `ProjectExploreTab` mounts it — every tile carries two real controls instead of hover-only halves of the tile:

- A labelled checkbox (`Select {filename}`) toggles selection.
- A labelled button (`Open {filename}`) opens the image dialog.

The grid keeps one roving tab stop. Arrow keys move between images across rows, `Home` and `End` jump to the first and last loaded image, and the tab stop stays on the same image when virtualized rows mount and unmount. Tag controls inside a tile stop propagation, so removing a tag neither selects nor opens the image.

**Target size.** Tile actions and the toolbar's chip dismiss controls are sized to a minimum hit area of 24 × 24 CSS px, which is [WCAG 2.2 SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). They do **not** meet SC 2.5.5 Target Size (Enhanced), which asks for 44 × 44 CSS px. Do not describe these controls as meeting the enhanced criterion.

**Grid semantics.** The gallery container is `role="group"` with an accessible name, **not** `role="grid"`. The full [WAI-ARIA layout grid](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) keyboard and focus contract was deliberately not implemented, and the role must not be changed to `grid` without implementing it.

## The three counts

The toolbar never conflates these, and neither should any UI copy or ticket:

| Name | Meaning |
| --- | --- |
| **loaded** | Images currently materialised in the browser — the pages fetched so far. |
| **matching** | The server's reported total for the current filters. |
| **project total** | Every image in the project pool, ignoring filters. |

The readout renders as `100 loaded · 350 matching` while more images match than have been loaded, and as `350 matching` once every matching image is loaded. A full sentence is available on `title` and `aria-label` in every case. When a genuine project total is supplied the readout adds `· 1,000 in project`.

**Project total is not currently displayed.** `ProjectExploreTab.tsx` has no unfiltered project image count to pass, so the toolbar omits the third count rather than substituting a filtered number for it. The readout degrades honestly; it does not guess. This is worth stating plainly because it was briefly wrong in the other direction: the filtered total was passed as the project total, which made the three-count branch unreachable and put the word "project" on a filtered number everywhere else. `projectTotal` is the only source of "in project" and must never be derived from `matchingCount`, `totalCount`, or `images.length`.

While a filter change is committed but unresolved, the toolbar shows a "Results pending" badge, greys the count readout, and disables the selection actions — so a bulk action can never be applied to a set other than the one on its label. A background refresh that does not change the matching set shows a neutral "Refreshing" badge and leaves the counts standing. The pending signal is derived from a filter-identity change that has not yet resolved, not from "a request is in flight", because next-page fetches are in flight too.

## Filters

### One contract, four consumers

There is a single definition of which images a filter set selects, and the gallery, the export snapshot, the saved-view URL, and the analytics panels all use it.

On the client that is `ImageFilterContract` in `apps/web/src/lib/explore-filter-contract.ts`: membership fields only, with paging (`page`, `page_size`) and display-only fields (`include_annotations`, `include_bboxes`, `include_polygons`) deliberately outside it, because changing them must never change which images match. The field list is typed as an exhaustive map, so a field added to the gallery query fails to compile until it is added to the contract.

On the server that is `ImageFilterParams` in `apps/api-core/src/app/schemas/image_filters.py`, resolved by `ProjectImageRepository.build_filtered_query` and `filtered_image_ids_subquery`. Export and the filtered analytics panels resolve their images through the same builder, which is what makes the gallery, the export preview, and the exported artifact agree.

### Membership filters

These change which images match, and therefore the counts, the analytics panels, and the export scope.

- **Tags and categories** — tri-state per tag (include, exclude, idle), with an AND/OR match mode for the include set and for the exclude set. Exclusion is applied before inclusion. Category-level toggles apply to every tag in the category.
- **Task and job** — task IDs, job ID, and annotated/unannotated. A job ID overrides task IDs. See [Annotated and unannotated](#annotated-and-unannotated) below; this filter changed meaning on 2026-09-12.
- **Search** — matches on filename.
- **File path** — a path pattern and a directory selection from the file tree.
- **Image UIDs** — a list of shared-image IDs, for targeted review. This is also how "export only my selection" is expressed.
- **Dimensions** — width, height, aspect ratio, and file size ranges.
- **Annotation counts** — object count, bbox count, and polygon count ranges, each with its own minimum and maximum.
- **Quality metrics** — quality, sharpness, brightness, contrast, uniqueness ranges, RGB channel ranges, and quality issues. Any quality or RGB or issues constraint implicitly requires the image's quality metrics to have status `completed`.

### Annotated and unannotated

**An image is annotated when it has a row in any of `image_tags`, `detections`, `segmentations`, or `keypoints`.** That is the same set of four tables the backend uses to maintain the `images.is_annotated` column (`AnnotationWriteRepository.TABLES`), and the filter reads those tables directly rather than the cached column, so it is also correct for rows whose column has not been refreshed yet. The predicate is built by iterating that mapping, not by naming tables, so a fifth annotation kind reaches the filter the moment it reaches the column.

**This changed on 2026-09-12 and moves numbers you may have written down.** The canonical filter previously counted only detections and segmentations. That was a defect with a severe consequence — a classification or pose export resolved **zero** images — and fixing it also changes what the gallery shows: a classification project that displayed zero annotated images now shows every tagged image under Annotated, and its Unannotated count falls by the same amount. The analytics coverage panels and any export whose stored filter snapshot carries `is_annotated` move together with the gallery. If someone reports that their annotated count "jumped" on this date, this is why, and the new number is the correct one.

`is_annotated` must keep meaning "any kind". Export snapshots are stored as JSONB and replayed when an export runs, so redefining the field would silently change the membership of exports created long ago. If a per-kind question is ever needed — "which images have a box but no mask" — it has to be a new, additive field that composes with `is_annotated`, never a reinterpretation of it.

One related question is deliberately answered separately. The export preview's "no annotations" warning *is* per-kind: it maps the export's own mode to one annotation kind and counts against that table alone, so a classification export warns about images lacking an image tag and a detection export about images lacking a detection. That is a statement about the export, not about which images the filter selected.

### Chips, removal, and Clear All

Every active constraint renders its own chip, and removing a chip clears only that constraint — removing a Brightness chip leaves Sharpness in place. The job filter has its own chip, including when it was applied from an analytics panel, and RGB constraints applied from a panel are visible as chips rather than staying invisible.

Clear All resets every chip key, the job filter included.

**Removing a range clears it; it does not widen it.** Dismissing a width, height, aspect-ratio or file-size chip sets that constraint to nothing at all, and so does the Reset control on the sidebar's width, height and file-size sliders. Neither resets the range to the field's full-range end stops. The difference is not cosmetic: a widened range is still a range, and a sentinel `width_min` / `width_max` pair travels into the gallery query, the sidebar request, the saved-view URL and the export snapshot exactly like any other constraint, so images outside the sentinel stay excluded from an export the user believes has no size filter on it. If you add a new range filter, give it a clear action rather than a widen-to-bounds action.

One deliberate exception: the file-path pattern and the directory selection render as two chips but share one removal key, so they clear together.

### Ordering

Every paged or ordered image query orders by `(filename ASC, id ASC)`. Filename alone is not unique across directories, so filename-only ordering could repeat or skip images across page boundaries.

### Sidebar facets: what the numbers describe

The rule is decided once and applied everywhere, because a facet that answers a different question from the gallery beside it is worse than no facet.

**Categorical facets count current results.** Tags, attributes, and the size-bucket distribution all count matching images *after* every active filter, including a filter on the facet's own field, so their numbers reconcile with the toolbar's matching count. Every tag the project defines stays in the list even when nothing in the results carries it — it shows zero rather than disappearing, so you can still add it as a filter.

**A numeric range facet is computed with its own constraint removed.** The width, height, and file-size panels report `min_value` / `max_value` that are the slider's *track*, not a count. A track derived from the field's own filter collapses onto the selection: drag width to 800–1200 and the track becomes 800–1200, after which the range can only ever be narrowed and there is no way back short of Clear All. Stripping that one field's own bounds keeps the track at the range of everything else that matches, which is what lets a slider widen again. This is a client-side decision (`useSidebarFacet` in `useExploreFilters.ts` sends the same contract minus two fields); the endpoint takes an arbitrary contract and does not need to know. When the field carries no constraint the stripped contract is identical to the gallery's and the query cache serves both from one entry, so the extra request exists only while that slider is actually constrained.

The filtered set reaches every aggregate as an unexecuted `SELECT`, never as a list of IDs. A search matching 150,000 images must not put 150,000 UUIDs into Python and back out as bound parameters on every keystroke.

## Annotation display options

These are **display filters**. They decide which shapes are painted on an image that already matched the query. They never change which images match, what the counts report, or what an export contains.

- **Per-label visibility and confidence range** — hide a label, or narrow its confidence interval. The same predicate is passed to the gallery thumbnails and to the image viewer, so an image looks the same in both.
- **Annotations with no confidence are always shown.** Manual annotations carry no confidence and must not disappear behind a confidence range.
- **Overlay toggles** — bounding boxes, polygons, labels, and highlight mode.
- Overlay visibility is part of the gallery request. When overlays are off the client asks the server not to send geometry; counts are returned either way, so the count badges keep working. Toggling an overlay never discards loaded pages — see Requests and caching.

### Preview truncation

The gallery endpoint caps the geometry it previews per image — by default 100 bounding boxes and 50 polygons. When a cap is reached the response sets `bboxes_truncated` / `polygons_truncated`.

**These flags mean "the per-image cap was reached". They are not an overflow count**, and no exact overflow count is derivable: the bbox preview mixes detection boxes with the bounding boxes of segmentations. UI copy must say "preview limited to the first 100 boxes" and must never say "showing 100 of 812". `detection_count` and `segmentation_count` are exact regardless.

## Selection and bulk actions

Two selection scopes exist and are labelled differently:

- **Select loaded (N)** selects the images materialised in the browser. When everything loaded is already selected the button becomes Clear selection.
- **Select all N matching** appears only when more images match than are loaded. It selects by filter scope, not by ID list, and individual images can be excluded from it afterwards.

Shift-click extends a selection over a range, resolved through stable image IDs rather than positions.

### The membership rule: resolved at action time

An all-matching selection is **not** a frozen list. The server runs the filter when the request arrives. Images that started matching between the click and the request landing are included; images that stopped matching are not. The UI states this rule, and any new copy must state the same rule rather than implying the set was fixed when the user pressed the button.

The bulk-tag confirmation dialog previews the scope, and the preview resolves the scope a second time when the operation runs. The preview is therefore an estimate, not a reservation, and is labelled as one.

Server limits, both enforced before anything is written:

- A scope resolving to more than **50,000 images** is rejected, and so is a scope that matches nothing.
- A request whose work exceeds **200,000 (image, tag) pairs** is rejected (`MAX_BULK_TAG_PAIRS`). Pairs, not images, are what decide whether a request finishes: 10,000 images × 40 tags is 400,000 writes. The two ceilings are independent and a request over either is refused.

The UI shows the server's message rather than a generic failure, so an operator gets told which ceiling they hit and that narrowing the filters or applying fewer tags at a time is the way through.

The write itself is set-based: the scope is frozen once as a statement, then one DELETE removes displaced links and one `INSERT ... SELECT ... ON CONFLICT` runs per tag. It is not a per-pair loop, and it must not become one again — the loop it replaced ran at 844 (image, tag) pairs per second against this project's Postgres on a 10,100-image test pool, where the set-based write runs at 18,648, which is what makes the 200,000-pair ceiling a request of roughly eleven seconds rather than roughly 49 minutes inside one transaction holding locks on `shared_image_tags` throughout. **That measurement sizes this ceiling and nothing else.** It is not a gallery performance figure and does not imply one exists.

Bulk tag and untag accept either an explicit list of image IDs or a filter scope with exclusions.

## The image dialog

The viewer is a real modal dialog (`explore/ImageDetailDialog.tsx`) implementing the [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) directly:

- `role="dialog"`, `aria-modal`, and a named title.
- It renders through a portal, and the application root is marked `inert` and `aria-hidden` while it is open — which is what actually keeps pointer input and a screen reader's virtual cursor out of the gallery behind it. Portals opened after the dialog, such as the tag picker's dropdown, stay interactive.
- **The focus trap spans the portals the dialog opens.** The tag picker's dropdown renders as a *sibling* of the dialog, not a descendant, so a trap written as `dialog.contains(target)` would let Tab walk straight out of the modal. Tab off the last control of such a panel returns into the dialog, and Shift+Tab off the first control wraps to the last control of the panel rather than of the dialog. Any new portal opened from inside the viewer has to join the same trap.
- **Escape is scoped.** Escape inside the tag picker closes the picker, not the viewer. Escape closes the viewer even after a backdrop click has moved focus to the body, because the handler is not bound to the dialog element. A press-and-release on the backdrop closes the viewer; a drag that starts inside the dialog and ends on the backdrop does not.
- Tab wraps inside the dialog, focus starts on the dialog, and on close focus returns to the control that opened the viewer, falling back to the tile when the original element was unmounted by row virtualization. A caller can override the destination with `restoreFocusTo`.
- Arrow keys are handled on the dialog, not on `window`, and are ignored while focus is in a text field, a select, or any editable control.

All of the above is covered by executed browser regressions; see [Verification status](#verification-status).

Inside it:

- Metadata, tags, and job associations for the image. The jobs request is a TanStack query keyed on the image ID, so a slow response for a previously viewed image cannot land on the current one.
- Previous/Next navigation that continues past the last loaded image: the viewer prefetches near the review boundary and Next stays enabled while another page exists.
- An "Annotate" action when a job is selected.
- A Retry control when the image itself fails to load, inside the focus trap.
- The same per-label visibility and confidence rules the thumbnails use.
- A badge when the loaded geometry is a capped subset, and a badge naming the preview resolution when the source image is larger than the preview.

**Preview resolution.** The viewer loads a thumbnail tier capped at 1,024 px, not original pixels. It labels this rather than pretending otherwise. Enlarging a thumbnail cannot reveal original detail; a true 100 % inspection mode needs a separate authorized original-pixels endpoint.

Returning from the annotation editor does not restore the grid's scroll position. Instead the gallery header offers an explicit "Resume at {filename}" action, driven by a `sessionStorage` entry written when you leave for the annotation editor.

## Export

The export snapshot is the gallery's filter contract — the same object, not a hand-built subset. Search, aspect ratio, quality, sharpness, brightness, contrast, uniqueness, RGB, issues, the annotation-count filters, the file-path pattern, and the include/exclude match modes all survive into the export.

The export wizard offers a scope choice between the images you selected and everything matching the current filters. The selected-images branch carries the selection as `image_uids` on the same contract.

The export preview reports the scope it resolved — the image count, which contract fields are active, and whether the export covers the whole project pool — so the scope is stated before an export is created rather than being a bare number.

The export execution resolves images through the same canonical query as the preview, ordered deterministically, so a manifest of an unchanged project does not reshuffle between exports. Membership is resolved when each request arrives, so a preview and a later run can differ if the project changes in between; the UI says so.

## Analytics panels

Panels are driven by API Core endpoints and are filtered by the same contract as the gallery.

### Enhanced dataset statistics

- **Dimensions** — width/height distribution, aspect ratio histogram, resize recommendations.
- **Tags** — tag distribution with category grouping.
- **Quality** — quality score histogram, status counts (pending / completed / failed), issue breakdown.
- Multi-select filtering: click bars to filter, Cmd/Ctrl+click to add to the selection, then apply.

### Annotation analysis

- **Coverage** — object count histogram and annotation density.
- **BBox / Polygon counts** — separate histograms per image.
- **Spatial** — a 2D heatmap of annotation centre distribution.
- **Classes** — label distribution with balance metrics.

### Individual panels (legacy)

`dataset-stats`, `annotation-coverage`, `class-balance`, `spatial-heatmap`, `image-quality`.

### Panel behaviour

- Histogram bins use Sturges' rule.
- Aggregations are computed in SQL over the filtered set rather than by materialising image IDs in Python, so they stay exact above the sizes at which the old handlers truncated.
- A zero-match filter reports zero. It is distinguishable from "no filter applied", which was previously not the case — an empty result used to fall back to the project total.
- Where a panel samples rather than counting, it reports its sample size instead of presenting the result as exact.
- Quality processing runs as a background job with progress tracking.
- Quality averages reach the response model under the field names it declares. They were briefly dropped in transit by a label/field mismatch, which rendered every average empty for every project without erroring anywhere; `test_analytics_panels.py` now asserts values rather than status, and `test_no_panel_silently_drops_a_repository_key` generalises that check over every dict-to-model hand-off in the router.

The sidebar aggregation endpoint (`/explore/sidebar`) is a separate path from the analytics panels, but it is on the same canonical contract as of 2026-09-12: it binds the whole `ImageFilterParams` contract, counts in SQL, and carries the filtered set as a subquery rather than as a materialised ID list. Its facet semantics are described under [Sidebar facets](#sidebar-facets-what-the-numbers-describe).

## Saved views and URL state

The Explore view serialises to the URL as a versioned `view` parameter: base64url-encoded JSON, schema version 1, validated with Zod on read.

- Filters and sort live in the view's filter half; density and overlay toggles live in a separate display half, so a display preference never changes dataset membership.
- A view written by a newer version of the gallery, or a hand-edited or truncated one, resolves to "no view" plus a message the UI shows as a dismissible banner. The gallery stays unfiltered rather than throwing.
- The older base64 `filter` parameter used by export history links still decodes, and is replaced by a `view` parameter on the next write.
- URL writes use `replace`, so changing a filter does not flood the history stack. Back and Forward between two different views re-apply the view.
- A share action produces the absolute URL for the current view.
- `sort` is accepted and round-tripped but not sent to the server: the explore endpoint has no sort parameter yet.

## Requests and caching

- The gallery and analytics requests carry TanStack Query's abort signal through to Axios, so a superseded filter's request is cancelled rather than racing the current one.
- Shared thumbnail fetching is **reference counted**: several mounted tiles can share one request, and a tile unmounting does not abort a request another mounted tile still needs.
- Blob results are held in an LRU cache (300 entries / 256 MiB) that is cleared when the authentication token changes, so one session cannot serve another session's images.
- Overlay geometry flags are deliberately **not** part of the gallery query key. They are a display preference, and putting them in the key meant that toggling the overlay changed the key and discarded every loaded page — twenty pages of scrolling lost to a display toggle. The flags are read at fetch time instead: turning geometry on triggers an explicit refetch so the loaded pages gain the geometry they lack, and turning it off keeps what is already downloaded while later pages are fetched without it. The only thing given up is shedding geometry that has already been transferred, which was never the saving worth having.
- The sidebar aggregation query key is the serialised filter contract, so flipping a tag from include to exclude no longer reuses the previous cache entry.

## Persistence

| What | Where |
| --- | --- |
| Sidebar width | `localStorage` — `explorePanelWidth` |
| Visibility settings | `localStorage` — `explore-visibility-{projectId}` |
| Per-label annotation display filters | `localStorage` — `annotation-filters-{projectId}` |
| "Resume at" image | `sessionStorage` — `explore-resume-{projectId}` |
| Current view (filters, sort, display) | The URL's `view` parameter |

## Key API calls

- `projectImagesApi.explore`
- `projectImagesApi.getSidebarAggregations`
- `projectImagesApi.bulkTag` / `bulkUntag`, and the scoped `bulkTagScope` / `bulkUntagScope` / `bulkTagPreviewScope`
- `tagsApi.*` and `tagCategoriesApi.*`
- `sharedImagesApi.getImageJobs`
- The exports preview and create endpoints

---

# Verification status

This section exists so that "the document says so" is never mistaken for "someone checked". It is the whole of what was executed, as of 2026-09-12.

**Executed and passing.** `pytest src/tests` in `apps/api-core` — **188 passed**, up from 27 at the branch point — covering the canonical filter contract, gallery/export/analytics/sidebar parity, deterministic ordering, the annotated predicate across all four annotation kinds, the export preview's counts and warning, zero-match handling, facet scoping, and the set-based bulk-tag write and its ceilings. The suite also passes with SQLAlchemy warnings promoted to errors (`-W "error::sqlalchemy.exc.SAWarning"`), which is how a self cross-join in the export preview was found. `node tests/browser-regressions.mjs` in `apps/web` — **12/12**, up from 5/5 — covering, for this feature, the image dialog's modal semantics and inertness, arrow keys versus editable controls, Escape after a backdrop click and backdrop click versus drag, focus across a portal the dialog opens and that portal's own Escape, focus restoration to the opening control and its `restoreFocusTo` override, the viewer's job-response race, and authenticated-image cache isolation across sessions. `tsc -b --force` — **0 errors**. `npm run build` — passes. `npm run lint` — 485 problems, against 503 at the branch point; this is a pre-existing backlog, not a clean gate.

**Not executed.** No performance baseline of any kind for this gallery. No screen reader. No real touch input, 200 % zoom, or narrow-viewport layout check. No live resize while the viewer is open. No controlled-failure run of the three error states. No browser check of grid keyboard navigation, chip removal, the count readout, the sidebar sliders, the saved-view error banner, Back/Forward, scroll behaviour, or thumbnail tier selection. The reference-counted image-fetch check exists but cannot currently be run. Everything in this document outside the paragraph above was verified by reading the source.

---

# Known limits

Real constraints a maintainer will otherwise be bitten by:

- The gallery container is `role="group"`, not `role="grid"`. The APG layout-grid contract is not implemented.
- Touch targets meet WCAG 2.2 SC 2.5.8 (24 × 24 CSS px), not SC 2.5.5 Enhanced (44 × 44).
- Annotation preview truncation flags mean the per-image cap was reached. They are not an overflow count.
- The project total is not displayed, because no unfiltered project image count is available to the gallery container.
- Removing a numeric range clears it rather than widening it to sentinel bounds. Any new range filter must follow that rule; a widened range still narrows the gallery, the export and the saved-view link.
- The viewer shows a preview capped at 1,024 px. There is no original-pixels inspection mode.
- Grid scroll position is not restored when returning from the annotation editor; the "Resume at" action stands in for it.
- `sort` round-trips through a saved view but is not sent, because the explore endpoint has no sort parameter and the toolbar has no sort selector.
- No performance baseline exists. Overscan, cache budgets, page retention, and the rendering stack have not been profiled, and no benchmark numbers exist for this gallery.
- Pagination is offset-based. Ordering is now deterministic, but insert/delete/rename during browsing, and first-page versus deep-page query plans, have not been tested or measured.
- Browser coverage is narrow. Twelve regressions run in a real browser (see [Verification status](#verification-status)) and they cover the image dialog and the authenticated-image cache only. The grid's keyboard navigation, the filter chips and count readout, the sidebar facets and their sliders, the saved-view error banner, Back/Forward, the pagination footer, the thumbnail tier selection, and the viewer's overlay-bounds observer are verified by reading the source, not by driving a browser.
- No screen reader, real touch input, 200 % zoom, narrow-viewport layout, or live resize while the viewer is open has been exercised. Every accessibility statement in this document that is not listed under Verification status was verified by reading the source.
- The project total is still not displayed. It was briefly displayed as a *filtered* total, which was worse; the readout now omits the third count rather than substituting one.

---

# Planned

Nothing in this section exists yet.

- **Cursor pagination, count caching, and bounded query pages.** All three are deferred pending measurement. Bounded pages in particular would require backward loading and scroll/focus anchoring before they could replace the current flattened list.
- **Performance baselines.** Browser and API baselines for first usable gallery, filter response, frame times, transfer sizes, memory, and repeated-scroll cache behaviour, recorded with hardware, browser, network, dataset size, and cache state, before any further tuning.
- **A low-confidence image-membership filter.** "Images containing a low-confidence prediction" would be a server-supported membership filter, separate from the display filters described above, and would have to flow through analytics, saved views, and exports together.
- **A 100 % inspection mode**, backed by a separate authorized original-pixels endpoint.
- **A sort selector**, which would make the `sort` field already carried in saved views meaningful.
- **Discovery workflows** — named review presets, duplicate comparison built on the existing perceptual hashes, and similarity search. These are unvalidated product opportunities, not committed work.

---

# Comparisons with other tools

The earlier version of this document carried a twelve-row feature matrix across CVAT, FiftyOne, Encord, Label Studio, and Roboflow, plus a "Competitors Lack" table. **That material has been removed.** It was published without recorded evidence: no product edition, no date checked, no workflow, and no link to a page that supports the specific claim. Several rows were also refuted by the vendors' own documentation.

This repository does not establish a ranking of CVAT, Encord, Label Studio, or Roboflow. Do not reintroduce one without, per comparison, the product edition, the date checked, the exact workflow, and a link to the official page that shows it.

One correction is worth recording, because the removed matrix asserted the opposite:

| Claim | Evidence |
| --- | --- |
| The FiftyOne App provides filtering and sorting from its own UI, not only through Python. | [FiftyOne App user guide](https://docs.voxel51.com/user_guide/app.html), fetched 2026-09-12. Its "Using the sidebar" section is marked available in Open Source and Enterprise and contains "Filtering sample fields" and "Sorting in the grid"; the page states the App "provides UI elements in both grid view and expanded sample view that you can use to filter your dataset". |

That is the whole of what was verified. In particular, interactive tagging, saved views, and similarity search in the FiftyOne App were **not** confirmed on that page when it was fetched on 2026-09-12 — the anchors `#saving-views` and `#image-similarity` cited in earlier research were not present — so no claim is made about them in either direction.

---

# Demo recordings

**There are no demo recordings.** The previous version of this document contained a table of `[GIF_PLACEHOLDER]` links, which rendered as broken images, and a recording guide for material that was never produced. Both have been removed rather than left as dead links.

If recordings are made later, put them under `docs/assets/gifs/` named `explore-gallery-{feature}.gif` (or `.webp`) and link them from the relevant section above — next to the behaviour they show, not in a separate marketing table. Record only interactions that exist; the Known limits section lists what a recording must not imply.

---

## Sources

Pages fetched and checked on 2026-09-12:

- [FiftyOne App user guide](https://docs.voxel51.com/user_guide/app.html)

Standards referenced:

- [WCAG 2.2 Understanding SC 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [WAI-ARIA APG: Dialog (Modal) pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [WAI-ARIA APG: Grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) — referenced as the contract this gallery deliberately does **not** implement.
