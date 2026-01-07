# Data Management and Task Creation

This document covers file sharing, the shared image registry, tags, and task creation.

## Overview

AnnotateANU manages datasets with a shared image registry and a per-project image pool.
Images live on disk under the file share root and are registered into the database.
Projects select from that registry to create tasks and jobs.

Key concepts:

- File share: server-side directory mounted at `/data/share`.
- Shared images: registry records with metadata and tags.
- Project pool: per-project selection of shared images.
- Tasks and jobs: task creation chunks images into jobs for assignment.

## UI Entry Points

- File share browser: `apps/web/src/pages/FileSharePage.tsx`
- Task creation wizard: `apps/web/src/components/CreateTaskWizard.tsx`
- Project explore gallery: `apps/web/src/components/ProjectExploreTab.tsx`

## Workflow

1. Upload or browse images in the file share.
2. Register file paths as shared images (API Core).
3. Add registered images to a project pool.
4. Create a task from file paths (wizard).
5. API Core creates jobs and links job images to shared images.

## Task Creation Modes

The wizard supports two image sources:

- File share selection (preferred): resolves file paths and registers images.
- Upload mode (legacy): creates tasks with mock metadata for future storage backends.

## Data Model (high level)

- `shared_images`: file_path, filename, width, height, size, checksum
- `tags` and `tag_categories`: project-scoped tagging
- `shared_image_tags`: tag assignments
- `project_images`: project pool association
- `tasks`, `jobs`, `images`: job image records linked to shared images

## API Endpoints

File share:

- `GET /api/v1/share` (list directory)
- `POST /api/v1/share/upload` (upload files)
- `POST /api/v1/share/resolve-selection` (expand folders into file list)

Shared images and project pool:

- `POST /api/v1/shared-images/register`
- `GET /api/v1/shared-images`
- `POST /api/v1/projects/{project_id}/images`
- `DELETE /api/v1/projects/{project_id}/images`
- `GET /api/v1/projects/{project_id}/images/available`
- `GET /api/v1/projects/{project_id}/explore`
- `GET /api/v1/projects/{project_id}/explore/sidebar`

Task creation:

- `POST /api/v1/projects/{project_id}/tasks/preview`
- `POST /api/v1/projects/{project_id}/tasks/create-with-file-paths`
- `POST /api/v1/projects/{project_id}/tasks/create-with-images` (legacy upload mode)

Tags and attributes:

- `GET /api/v1/projects/{project_id}/tag-categories/with-tags`
- `POST /api/v1/projects/{project_id}/tags`
- `POST /api/v1/projects/{project_id}/images/{image_id}/tags`
- `DELETE /api/v1/projects/{project_id}/images/{image_id}/tags/{tag_id}`
- `POST /api/v1/projects/{project_id}/images/bulk-tag`
- `DELETE /api/v1/projects/{project_id}/images/bulk-tag`
- `POST /api/v1/projects/{project_id}/attributes/schemas`

## Tagging Constraints

### One-Tag-Per-Label Rule

When tagging images within a category that has the **one-tag-per-label** constraint enabled:
- Only one tag from that category can be assigned to an image at a time.
- Assigning a new tag automatically removes the previous tag from the same category.
- Useful for mutually exclusive classifications (e.g., train/val/test splits, quality ratings).

Configure this constraint when creating tag categories via the API or UI.

## Notes

- File paths must exist under the share root configured in API Core.
- The registry is idempotent. Re-registering a path returns the existing record.
- Project pools are also idempotent; adding a shared image twice is safe.
