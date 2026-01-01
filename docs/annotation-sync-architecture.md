# Annotation Sync (Team Mode)

This document explains how annotations sync between the web UI and API Core when a user
opens a job in the annotation app.

## Overview

In job mode, the UI stores edits locally and periodically syncs changes to API Core.
The sync pipeline batches create/update/delete operations per image.

Solo mode does not sync to the backend and uses IndexedDB only.

## IDs and Mapping

- `frontendId`: created in the UI when an annotation is made.
- `backendId`: UUID created by the API Core when persisted.
- Mapping: the UI tracks `frontendId -> backendId` to send updates.

The backend stores `frontendId` in the annotation attributes for reconciliation.

## Sync Flow

1. User edits an annotation.
2. `useAutoSave` records a pending change with image dimensions.
3. Every interval (default 5s), the client batches changes by image.
4. UI calls `POST /api/v1/jobs/{jobId}/annotations/sync`.
5. API Core applies changes and returns updated IDs.
6. UI refreshes annotations and updates the ID map.

## Auto-Save Behavior

- Pending changes are tracked in memory and summarized per image.
- The UI surfaces dirty indicators and sync status.
- Offline mode pauses sync; changes flush on reconnect.

## Consistency Rules

- Updates require a `backendId` (from the map or the annotation payload).
- The UI keeps a ref-backed map to avoid stale state during rapid edits.
- Duplicate frontend IDs are deduped on load.

## Key Files

- `apps/web/src/hooks/useJobStorage.ts`
- `apps/web/src/hooks/useAutoSave.ts`
- `apps/api-core/src/app/routers/jobs.py`

## API Endpoint

- `POST /api/v1/jobs/{jobId}/annotations/sync`

Payload groups changes by image and separates detections and segmentations.
