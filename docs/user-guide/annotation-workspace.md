# Annotation Workspace

The annotation workspace is the main place to label images, prompt SAM3, and review annotations.
It runs at `/annotation` and supports local or job-backed storage.

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

## Job Mode Sync

When `jobId` is present, the header shows sync status and a sync interval selector.
Use the Sync Now button to push pending changes immediately.

Sync endpoint: `POST /api/v1/jobs/{jobId}/annotations/sync`.

## Labels and Export

- Manage Labels is available in local mode. Job mode uses project-level labels.
- Export downloads COCO JSON or YOLO files for the current workspace.

## Shortcuts

Open the shortcuts panel from the keyboard icon in the left sidebar.
