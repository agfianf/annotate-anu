# API Summary

This document summarizes the main API surfaces. Use the live OpenAPI docs for full schemas:

- API Core: http://localhost:8001/docs
- SAM3 Inference: http://localhost:8000/docs

## API Core (FastAPI)

Base URL: `http://localhost:8001/api/v1`

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `PATCH /auth/profile`

### Projects

- `GET /projects`
- `POST /projects`
- `GET /projects/{project_id}`
- `PATCH /projects/{project_id}`
- `POST /projects/{project_id}/archive`
- `POST /projects/{project_id}/unarchive`
- `DELETE /projects/{project_id}`

### Members

- `GET /projects/{project_id}/members`
- `GET /projects/{project_id}/available-users`
- `POST /projects/{project_id}/members`
- `DELETE /projects/{project_id}/members/{member_id}`

### Tasks and Jobs

- `GET /projects/{project_id}/tasks`
- `POST /projects/{project_id}/tasks`
- `PATCH /tasks/{task_id}`
- `POST /tasks/{task_id}/assign`
- `POST /tasks/{task_id}/archive`
- `POST /tasks/{task_id}/unarchive`
- `DELETE /tasks/{task_id}`

- `GET /tasks/{task_id}/jobs`
- `POST /jobs/{job_id}/assign`
- `POST /jobs/{job_id}/unassign`
- `POST /jobs/{job_id}/start`
- `POST /jobs/{job_id}/complete`
- `POST /jobs/{job_id}/archive`
- `POST /jobs/{job_id}/unarchive`
- `DELETE /jobs/{job_id}`

### Job Images and Annotation Sync

- `GET /jobs/{job_id}`
- `GET /jobs/{job_id}/images`
- `GET /jobs/{job_id}/images/{image_id}`
- `POST /jobs/{job_id}/annotations/sync`

### Labels and Annotations

- `GET /projects/{project_id}/labels`
- `POST /projects/{project_id}/labels`
- `PATCH /projects/{project_id}/labels/{label_id}`
- `DELETE /projects/{project_id}/labels/{label_id}`

### File Share

- `GET /share` (browse)
- `POST /share/mkdir`
- `POST /share/mkdir-nested`
- `POST /share/upload`
- `GET /share/thumbnail/{path}`
- `POST /share/batch-info`
- `POST /share/resolve-selection`

### Shared Images and Project Pool

- `GET /shared-images`
- `POST /shared-images/register`
- `GET /shared-images/{image_id}`
- `GET /shared-images/{image_id}/jobs`

- `GET /projects/{project_id}/images` (project pool)\n+- `POST /projects/{project_id}/images`\n+- `DELETE /projects/{project_id}/images`\n+- `GET /projects/{project_id}/images/available`\n+- `GET /projects/{project_id}/explore`\n+- `GET /projects/{project_id}/explore/sidebar`

### Tags and Categories

- `GET /projects/{project_id}/tags`
- `GET /projects/{project_id}/tags/uncategorized`
- `POST /projects/{project_id}/tags`
- `PATCH /projects/{project_id}/tags/{tag_id}`
- `DELETE /projects/{project_id}/tags/{tag_id}`

- `GET /projects/{project_id}/tag-categories`
- `GET /projects/{project_id}/tag-categories/with-tags`
- `POST /projects/{project_id}/tag-categories`
- `PATCH /projects/{project_id}/tag-categories/{category_id}`
- `DELETE /projects/{project_id}/tag-categories/{category_id}`

### Attributes (metadata)

- `GET /projects/{project_id}/attributes/schemas`
- `POST /projects/{project_id}/attributes/schemas`
- `PATCH /projects/{project_id}/attributes/schemas/{schema_id}`
- `DELETE /projects/{project_id}/attributes/schemas/{schema_id}`

- `GET /projects/{project_id}/images/{image_id}/attributes`
- `POST /projects/{project_id}/images/{image_id}/attributes`
- `POST /projects/{project_id}/images/attributes/bulk`

### Exports

- `GET /projects/{project_id}/exports`
- `POST /projects/{project_id}/exports`
- `POST /projects/{project_id}/exports/preview`
- `GET /projects/{project_id}/exports/{export_id}`
- `GET /projects/{project_id}/exports/{export_id}/download`

- `GET /projects/{project_id}/exports/classification-options`
- `GET /projects/{project_id}/saved-filters`
- `POST /projects/{project_id}/saved-filters`
- `PATCH /projects/{project_id}/saved-filters/{filter_id}`
- `DELETE /projects/{project_id}/saved-filters/{filter_id}`

### Analytics

- `GET /projects/{project_id}/analytics/dataset-stats`
- `GET /projects/{project_id}/analytics/annotation-coverage`
- `GET /projects/{project_id}/analytics/class-balance`
- `GET /projects/{project_id}/analytics/spatial-heatmap`
- `GET /projects/{project_id}/analytics/image-quality`

### Model Registry + Inference Proxy

- `GET /models`
- `POST /models`
- `PATCH /models/{model_id}`
- `DELETE /models/{model_id}`
- `POST /models/{model_id}/health`

- `POST /inference/text`
- `POST /inference/bbox`
- `POST /inference/auto`

## SAM3 Inference API (FastAPI)

Base URL: `http://localhost:8000/api/v1/sam3`

- `POST /inference/text`
- `POST /inference/bbox`
- `POST /inference/batch`

Requests are `multipart/form-data` with images and prompt fields.
