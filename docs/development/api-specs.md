# API Summary

This document summarizes the main API surfaces. Use the live OpenAPI docs for full schemas:

- API Core: http://localhost:8001/docs
- SAM3 Inference: http://localhost:8000/docs

## API Core (FastAPI)

Base URL: `http://localhost:8001/api/v1`

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `PATCH /auth/me`
- `GET /auth/first-user-check`

### Admin

- `GET /admin/users`
- `PATCH /admin/users/{user_id}/role`
- `PATCH /admin/users/{user_id}/active`
- `DELETE /admin/users/{user_id}`

### Projects, Labels, Members, Activity

- `GET /projects`
- `POST /projects`
- `GET /projects/{project_id}`
- `PATCH /projects/{project_id}`
- `POST /projects/{project_id}/archive`
- `POST /projects/{project_id}/unarchive`
- `DELETE /projects/{project_id}`

- `GET /projects/{project_id}/labels`
- `POST /projects/{project_id}/labels`
- `PATCH /projects/{project_id}/labels/{label_id}`
- `DELETE /projects/{project_id}/labels/{label_id}`

- `GET /projects/{project_id}/members`
- `GET /projects/{project_id}/available-users`
- `POST /projects/{project_id}/members`
- `PATCH /projects/{project_id}/members/{member_id}`
- `DELETE /projects/{project_id}/members/{member_id}`

- `GET /projects/{project_id}/activity`
- `POST /projects/{project_id}/activity`

### Tasks and Jobs

- `GET /projects/{project_id}/tasks`
- `POST /projects/{project_id}/tasks`
- `GET /tasks/{task_id}`
- `PATCH /tasks/{task_id}`
- `POST /tasks/{task_id}/assign`
- `POST /tasks/{task_id}/archive`
- `POST /tasks/{task_id}/unarchive`
- `DELETE /tasks/{task_id}`

- `POST /projects/{project_id}/tasks/preview`
- `POST /projects/{project_id}/tasks/create-with-file-paths`
- `POST /projects/{project_id}/tasks/create-with-images`

- `GET /tasks/{task_id}/jobs`
- `POST /tasks/{task_id}/jobs`
- `POST /tasks/{task_id}/jobs/bulk`
- `GET /jobs/{job_id}`
- `PATCH /jobs/{job_id}`
- `POST /jobs/{job_id}/assign`
- `POST /jobs/{job_id}/unassign`
- `POST /jobs/{job_id}/start`
- `POST /jobs/{job_id}/complete`
- `POST /jobs/{job_id}/approve`
- `POST /jobs/{job_id}/archive`
- `POST /jobs/{job_id}/unarchive`
- `DELETE /jobs/{job_id}`
- `POST /jobs/{job_id}/annotations/sync`

### Job Images and Annotations

- `GET /jobs/{job_id}/images`
- `POST /jobs/{job_id}/images`
- `POST /jobs/{job_id}/images/bulk`
- `GET /images/{image_id}`
- `PATCH /images/{image_id}`
- `DELETE /images/{image_id}`
- `GET /jobs/{job_id}/images/{image_id}/thumbnail`
- `GET /jobs/{job_id}/images/{image_id}/file`

- `GET /images/{image_id}/annotations`
- `POST /images/{image_id}/annotations/tags`
- `POST /images/{image_id}/annotations/tags/bulk`
- `POST /images/{image_id}/annotations/detections`
- `POST /images/{image_id}/annotations/detections/bulk`
- `POST /images/{image_id}/annotations/segmentations`
- `POST /images/{image_id}/annotations/segmentations/bulk`
- `POST /images/{image_id}/annotations/keypoints`

### File Share and Shared Images

- `GET /share` (browse)
- `POST /share/mkdir`
- `POST /share/mkdir-nested`
- `POST /share/upload`
- `GET /share/thumbnail/{path}`
- `POST /share/batch-info`
- `POST /share/resolve-selection`

- `GET /shared-images`
- `POST /shared-images/register`
- `GET /shared-images/{image_id}`
- `GET /shared-images/{image_id}/jobs`

### Project Pool and Explore

- `GET /projects/{project_id}/images`
- `POST /projects/{project_id}/images`
- `DELETE /projects/{project_id}/images`
- `GET /projects/{project_id}/images/available`
- `GET /projects/{project_id}/explore`
- `GET /projects/{project_id}/explore/sidebar`
- `POST /projects/{project_id}/images/bulk-tag`
- `DELETE /projects/{project_id}/images/bulk-tag`

### Tags, Categories, Attributes

- `GET /projects/{project_id}/tags`
- `GET /projects/{project_id}/tags/{tag_id}`
- `POST /projects/{project_id}/tags`
- `PATCH /projects/{project_id}/tags/{tag_id}`
- `DELETE /projects/{project_id}/tags/{tag_id}`

- `GET /projects/{project_id}/tag-categories`
- `GET /projects/{project_id}/tag-categories/with-tags`
- `POST /projects/{project_id}/tag-categories`
- `PATCH /projects/{project_id}/tag-categories/{category_id}`
- `DELETE /projects/{project_id}/tag-categories/{category_id}`

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
- `DELETE /projects/{project_id}/exports/{export_id}`

- `GET /projects/{project_id}/exports/classification-options`
- `GET /projects/{project_id}/saved-filters`
- `POST /projects/{project_id}/saved-filters`
- `GET /projects/{project_id}/saved-filters/{filter_id}`
- `PATCH /projects/{project_id}/saved-filters/{filter_id}`
- `DELETE /projects/{project_id}/saved-filters/{filter_id}`

### Analytics

#### Dataset Statistics
- `GET /projects/{project_id}/analytics/dataset-stats` - Tag distribution, dimension/aspect ratio histograms, file size stats
- `GET /projects/{project_id}/analytics/enhanced-dataset-stats` - Consolidated stats with quality metrics (preferred)
- `GET /projects/{project_id}/analytics/dimension-insights` - Dimension analysis and resize recommendations

#### Annotation Analysis
- `GET /projects/{project_id}/analytics/annotation-coverage` - Object count per image, density histogram
- `GET /projects/{project_id}/analytics/annotation-analysis` - Consolidated annotation stats with spatial heatmap
- `GET /projects/{project_id}/analytics/class-balance` - Label distribution and balance metrics
- `GET /projects/{project_id}/analytics/spatial-heatmap` - 2D grid density of annotation centers

#### Image Quality
- `GET /projects/{project_id}/analytics/image-quality` - Quality metrics summary and issue breakdown
- `POST /projects/{project_id}/analytics/sync-quality` - Sync quality records with project images
- `POST /projects/{project_id}/analytics/compute-quality` - Compute metrics for pending images (legacy)
- `POST /projects/{project_id}/analytics/start-quality-job` - Start background quality job
- `GET /projects/{project_id}/analytics/quality-progress` - Poll job progress (2-second interval)
- `POST /projects/{project_id}/analytics/cancel-quality-job` - Cancel running quality job

### Model Registry + Inference Proxy

- `GET /models`
- `POST /models`
- `PATCH /models/{model_id}`
- `DELETE /models/{model_id}`
- `POST /models/{model_id}/health`

- `POST /inference/text` - Supports `point_reduction` and `simplify_polygons` params
- `POST /inference/bbox` - Supports `point_reduction` and `simplify_polygons` params
- `POST /inference/auto`

## SAM3 Inference API (FastAPI)

Base URL: `http://localhost:8000/api/v1/sam3`

- `POST /inference/text` - Text prompt segmentation
- `POST /inference/bbox` - Bounding box prompt segmentation
- `POST /inference/batch` - Batch processing

Requests are `multipart/form-data` with images and prompt fields.

### Polygon Simplification Parameters

All inference endpoints support polygon simplification:
- `point_reduction` (float, 0.0-1.0): Percentage of points to retain
- `simplify_polygons` (boolean): Enable/disable simplification

Example:
```bash
curl -X POST http://localhost:8000/api/v1/sam3/inference/text \
  -F "image=@image.jpg" \
  -F "prompt=cat" \
  -F "point_reduction=0.5" \
  -F "simplify_polygons=true"
```
