# Export Workflow

This document describes exports created from Project > Explore.

## Export Types

### Project Exports (API Core)

- Created from the Explore view with the Export Wizard.
- Processed by the API Core worker.
- Versioned and shown in Export History.
- Supports diffing across versions.

### Quick Export (annotation app)

- Runs in the browser from the annotation workspace.
- Outputs COCO JSON or YOLO TXT/ZIP for the current session.
- Not versioned and not stored in export history.

## Export Modes and Formats

Project exports support:

- Modes: `classification`, `detection`, `segmentation`
- Formats: `coco_json`, `manifest_csv`, `image_folder`

Classification exports build a CSV manifest. Detection and segmentation build COCO JSON.

## Wizard Flow

1. Select export mode.
2. Configure mode-specific options.
3. Optional: snapshot filters from Explore.
4. Preview counts.
5. Create export and monitor status.

## Versioning and Metadata

- Exports store a point-in-time `filter_snapshot` and resolved metadata.
- COCO JSON includes `info.export_config` with export details.
- Version numbers increment per export mode.

## Export History and Diff

- History lists versions per export mode.
- Timeline view compares consecutive versions.
- Diff shows tag, label, and summary deltas (image counts, annotation counts, splits).

## Processing Stages

- API Core persists export config and queues a Celery task.
- Worker generates artifacts in `/data/exports` and updates status.
- UI polls for completion and offers download when ready.

## Diagram

Diagram source: `docs/architecture/export-workflow.mmd`.
