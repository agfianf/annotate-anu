# Annotation Workspace

The annotation workspace is the main place to label images, prompt SAM3, and review annotations.
It runs at `/annotation` and supports local or job-backed storage.

---

## Feature Demos

> **Note**: GIF placeholders below - replace `[GIF_PLACEHOLDER]` with actual recordings.

### Core Annotation Tools

| Feature | Demo | What to Record |
|---------|------|----------------|
| **Rectangle Tool** | ![Rectangle annotation][GIF_PLACEHOLDER] | Draw bounding box, resize handles, move annotation, delete. |
| **Polygon Tool** | ![Polygon annotation][GIF_PLACEHOLDER] | Click to add vertices, close polygon, vertex editing, add/remove points. |
| **Point Tool** | ![Point annotation][GIF_PLACEHOLDER] | Click to place keypoints, move points, multi-point annotations. |
| **Selection & Editing** | ![Selection mode][GIF_PLACEHOLDER] | Select annotation, transform handles, keyboard shortcuts (Del, Esc). |

### AI-Powered Annotation

| Feature | Demo | What to Record |
|---------|------|----------------|
| **SAM3 Text Prompt** | ![Text prompt][GIF_PLACEHOLDER] | Type "cat", click Detect, mask appears → convert to polygon/bbox. |
| **SAM3 Bbox Prompt** | ![Bbox prompt][GIF_PLACEHOLDER] | Draw rough bbox, SAM3 refines to precise mask, auto-convert to polygon. |
| **Auto-Detect Mode** | ![Auto detect][GIF_PLACEHOLDER] | Click Auto-Detect, show multiple objects found, select to apply. |
| **BYOM Inference** | ![BYOM inference][GIF_PLACEHOLDER] | Switch model in dropdown, run inference, show different predictions. |
| **Polygon Simplification** | ![Polygon simplify][GIF_PLACEHOLDER] | Toggle simplification on, run SAM3, show reduced point count. |
| **Batch Mode** | ![Batch inference][GIF_PLACEHOLDER] | Select multiple images, run batch SAM3, progress indicator. |

### Workflow Features

| Feature | Demo | What to Record |
|---------|------|----------------|
| **Undo/Redo** | ![Undo redo][GIF_PLACEHOLDER] | Make changes, Cmd+Z to undo, Cmd+Shift+Z to redo, history panel. |
| **Zoom & Pan** | ![Zoom pan][GIF_PLACEHOLDER] | Scroll to zoom, drag to pan, fit-to-screen button, zoom slider. |
| **Gallery Strip** | ![Gallery strip][GIF_PLACEHOLDER] | Navigate images, show annotation indicators, drag to reorder. |
| **Job Mode Sync** | ![Job sync][GIF_PLACEHOLDER] | Show sync status, pending changes count, click Sync Now. |
| **Label Management** | ![Labels][GIF_PLACEHOLDER] | Create label, assign color, apply to annotation, filter by label. |
| **Context Menu** | ![Context menu][GIF_PLACEHOLDER] | Right-click annotation, edit attributes, change label, delete. |

### Export & Collaboration

| Feature | Demo | What to Record |
|---------|------|----------------|
| **COCO Export** | ![COCO export][GIF_PLACEHOLDER] | Click Export, select COCO JSON, download, show file contents. |
| **YOLO Export** | ![YOLO export][GIF_PLACEHOLDER] | Click Export, select YOLO, download zip with txt files. |
| **Keyboard Shortcuts** | ![Shortcuts][GIF_PLACEHOLDER] | Open shortcuts panel, show key mappings, use shortcuts to annotate. |

---

## Competitor Comparison: Annotation Tools

| Feature | AnnotateANU | CVAT | Roboflow | Label Studio |
|---------|-------------|------|----------|--------------|
| **SAM3 Integration** | ✅ Native | ✅ SAM | ✅ SAM | ⚠️ ML backend |
| **Text Prompts** | ✅ | ❌ | ✅ | ❌ |
| **Bbox Prompts** | ✅ | ✅ | ✅ | ❌ |
| **BYOM Support** | ✅ Custom models | ⚠️ Nuclio functions | ❌ | ⚠️ ML backend |
| **Polygon Simplification** | ✅ Configurable | ❌ | ❌ | ❌ |
| **Model Source Tracking** | ✅ Per-annotation | ❌ | ❌ | ❌ |
| **Real-time Sync** | ✅ Job mode | ✅ Auto-save | ✅ | ✅ |
| **Undo/Redo** | ✅ Full history | ✅ | ✅ | ✅ |
| **Keyboard Shortcuts** | ✅ Customizable | ✅ | ✅ | ✅ |
| **Self-Hosted** | ✅ Docker | ✅ | ⚠️ | ✅ |

---

## Entry Points

- Local mode: `/annotation`
- Job mode: `/annotation?jobId=<job_id>`
- Optional: `&imageId=<image_id>` to jump to a specific image

Local mode stores data in IndexedDB. Job mode loads images from API Core and syncs changes.

## Layout

- Left sidebar: tools, AI prompt panels, zoom controls, history, shortcuts.
- Center: canvas, image header, gallery strip.
- Right sidebar: annotations list, filters, bulk actions, appearance controls.

## Tools and Prompts

Manual tools:
- Select
- Rectangle
- Polygon
- Point

AI prompt panels:
- Text prompt
- Bounding box prompt (auto-switches to rectangle tool)
- Auto-detect

Use the model selector in the header to choose SAM3 or a registered BYOM model.

### Polygon Simplification

When using SAM3 or BYOM models, you can enable **polygon simplification** to reduce the number of points in generated polygons:
- Toggle the simplification option in the prompt panel.
- Configure point reduction settings to balance detail vs. performance.
- Simplified polygons are easier to edit and export.

### Model Source Tracking

All AI-generated annotations automatically track their source:
- The model that created the annotation is stored for filtering and analysis.
- Manual annotations are marked with `confidence: null` to distinguish from AI predictions.
- Model source is visible in the annotation list and can be filtered in Explore view.

## Job Mode Sync

When `jobId` is present, the header shows sync status and a sync interval selector.
Use the Sync Now button to push pending changes immediately.

Sync endpoint: `POST /api/v1/jobs/{jobId}/annotations/sync`.

## Labels and Export

- Manage Labels is available in local mode. Job mode uses project-level labels.
- Export downloads COCO JSON or YOLO files for the current workspace.

### Label Attributes

Labels support custom attributes for additional metadata:
- Define attribute schemas at the project level (text, number, select).
- Edit attributes via the annotation context menu.
- Attributes are included in exports for downstream processing.

## Appearance Controls

The right sidebar includes appearance settings:
- **Dual-threshold sliders**: Configure tiny detection thresholds for filtering small annotations.
- **Annotation opacity**: Adjust transparency of annotation overlays.
- **Label display**: Toggle confidence scores and model source on labels.

## Shortcuts

Open the shortcuts panel from the keyboard icon in the left sidebar.

---

## GIF Recording Guide

### Priority Recording Order

Record these first for maximum marketing impact:

| Priority | Feature | Duration | Key Moments |
|----------|---------|----------|-------------|
| 1 | SAM3 Text Prompt | 8-10s | Type prompt → loading → mask appears → accept |
| 2 | SAM3 Bbox Prompt | 8-10s | Draw rough box → SAM refines → perfect polygon |
| 3 | Polygon Simplification | 10s | Toggle on → run SAM → show point count reduction |
| 4 | BYOM Model Switch | 8s | Dropdown → select custom model → run → different result |
| 5 | Undo/Redo History | 6s | Make changes → undo chain → redo |

### Sample Script: SAM3 Text Prompt

```
1. Open image with a cat visible
2. Click "Text Prompt" panel in left sidebar
3. Type "cat" in the input field
4. Click "Detect" button
5. Show loading spinner (1-2 seconds)
6. Mask overlay appears on the cat
7. Click "Accept" → converts to polygon
8. Duration: ~10 seconds
```

### Sample Script: SAM3 Bbox Prompt

```
1. Open image with an object
2. Click "Bbox Prompt" panel
3. Draw a rough bounding box around object
4. SAM3 processes (brief loading)
5. Precise mask appears within the bbox
6. Auto-converts to editable polygon
7. Show vertex editing briefly
8. Duration: ~10 seconds
```

### File Naming Convention

```
annotation-{feature-name}.gif
annotation-{feature-name}.webp

Examples:
annotation-sam3-text-prompt.gif
annotation-sam3-bbox-prompt.gif
annotation-polygon-simplify.gif
annotation-byom-inference.gif
annotation-undo-redo.gif
```
