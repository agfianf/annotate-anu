# Data Management & Task Creation Feature

**Version**: 1.0
**Last Updated**: 2025-12-13
**Status**: Implemented

## Table of Contents

1. [Overview](#overview)
2. [Feature Architecture](#feature-architecture)
3. [User Flow](#user-flow)
4. [Backend Workflow](#backend-workflow)
5. [Data Models](#data-models)
6. [API Endpoints](#api-endpoints)
7. [Frontend Components](#frontend-components)
8. [Code Examples](#code-examples)
9. [Sequence Diagrams](#sequence-diagrams)

---

## Overview

The Data Management feature provides a centralized system for managing images across projects and tasks. It enables users to:

- **Register images** from the file share directory (`/data/share`) into a central registry
- **Tag images** with user-defined labels for organization
- **Create project image pools** to organize images by project
- **Create tasks** by selecting images from file share or uploading new ones
- **Explore images** with advanced filtering (tags, tasks, jobs, annotation status)

### Key Concepts

- **Shared Image Registry**: Central database of all images with metadata
- **Project Pool**: Many-to-many relationship between projects and shared images
- **Tags**: Global, user-defined labels for categorizing images
- **Task Creation Modes**: Select from file share OR upload new images
- **Many-to-Many Ownership**: Same image can be used in multiple tasks/projects

---

## Feature Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
├─────────────────────────────────────────────────────────────┤
│ • CreateTaskWizard (Task creation UI)                       │
│ • FileExplorer (File share browser)                         │
│ • ProjectExploreTab (Image gallery & filters)               │
│ • data-management-client.ts (API client)                    │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP API
┌─────────────────────────────────────────────────────────────┐
│                API Core (FastAPI)                            │
├─────────────────────────────────────────────────────────────┤
│ Routers:                                                     │
│ • shared_images.py (Registry operations)                    │
│ • tags.py (Tag CRUD)                                        │
│ • project_images.py (Project pool & explore)                │
│ • tasks.py (Task creation with file paths)                  │
│                                                              │
│ Repositories:                                                │
│ • SharedImageRepository                                      │
│ • TagRepository                                              │
│ • ProjectImageRepository                                     │
│ • TaskRepository, JobRepository, ImageRepository            │
│                                                              │
│ Services:                                                    │
│ • FileSystemService (File validation & metadata)            │
│ • ThumbnailService (Image info extraction)                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                       │
├─────────────────────────────────────────────────────────────┤
│ • shared_images (Central registry)                          │
│ • tags (Global tags)                                        │
│ • shared_image_tags (Image-tag junction)                    │
│ • project_images (Project pool junction)                    │
│ • projects, tasks, jobs, images (Existing tables)           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                File Share (/data/share)                      │
├─────────────────────────────────────────────────────────────┤
│ • Mounted volume with user images                           │
│ • Referenced by relative paths in database                  │
└─────────────────────────────────────────────────────────────┘
```

---

## User Flow

### Task Creation Flow (Frontend)

```
1. Navigate to Project → Click "Create Task"
   ↓
2. CreateTaskWizard opens (Step 1: Basic Info)
   - Enter task name
   - Enter description (optional)
   - Select assignee (optional)
   ↓
3. Step 2: Images - Choose mode
   ┌────────────────────────────────┬────────────────────────────────┐
   │  Select from File Share        │  Upload New Images             │
   ├────────────────────────────────┼────────────────────────────────┤
   │ • FileExplorer component shown │ • Drag-and-drop zone shown     │
   │ • Browse /data/share directory │ • Select files from computer   │
   │ • Multi-select files/folders   │ • Preview selected files       │
   │ • Click "Select" button        │ • Files uploaded later         │
   │ • Paths resolved to file list  │                                │
   └────────────────────────────────┴────────────────────────────────┘
   ↓
4. Step 3: Configure Job Chunking
   - Set chunk size (images per job)
   - Choose distribution order (sequential/random)
   - Preview job breakdown
   ↓
5. Step 4: Review & Create
   - Review all settings
   - Click "Create Task"
   ↓
6. Backend Processing
   - If file share mode: Register images, create task
   - If upload mode: Create task with mock data (legacy)
   ↓
7. Success
   - Task created with jobs
   - Images linked to shared registry
   - Redirect to task detail page
```

### Explore Tab Flow

```
1. Navigate to Project → Click "Explore" tab
   ↓
2. ProjectExploreTab displays
   ┌────────────────────────────────────────────────────────┐
   │ Filters (Left Sidebar):                                │
   │ • Search bar (filename search)                         │
   │ • Tag filter (multi-select chips)                      │
   │ • Task filter (dropdown)                               │
   │ • Job filter (dropdown, filtered by task)              │
   │ • Annotation status (annotated/unannotated)            │
   └────────────────────────────────────────────────────────┘
   ↓
3. Image Gallery (Main Area)
   • Grid of thumbnails with metadata
   • Multi-select checkboxes
   • Click image → ImageDetailModal
   ↓
4. Bulk Actions (When images selected)
   • Add Tags button → Bulk tag multiple images
   • Remove Tags button → Bulk untag
   ↓
5. Tag Management
   • Create new tags (name, description, color)
   • Edit existing tags
   • Delete unused tags
```

---

## Backend Workflow

### Task Creation with File Paths

This is the complete backend workflow when a user creates a task from file share.

#### Endpoint
`POST /api/v1/projects/{project_id}/tasks/create-with-file-paths`

#### Step-by-Step Process

```python
# 1. VALIDATE REQUEST
payload = TaskCreateWithFilePaths(
    name="My Task",
    description="Optional description",
    assignee_id="uuid-or-null",
    chunk_size=50,
    distribution_order="sequential",  # or "random"
    file_paths=[
        "datasets/cats/img1.jpg",
        "datasets/cats/img2.jpg",
        "datasets/dogs/",  # Can be a directory
    ]
)

# 2. REGISTER SHARED IMAGES
# For each file_path in payload.file_paths:
for file_path in payload.file_paths:

    # 2a. Check if already registered
    existing = await SharedImageRepository.get_by_file_path(conn, file_path)
    if existing:
        shared_images_list.append(existing)
        continue

    # 2b. Validate file exists on filesystem
    absolute_path = FileSystemService.get_absolute_path(file_path)
    if not absolute_path.exists():
        failed_paths.append(file_path)
        continue

    # 2c. Extract image metadata
    image_info = await ThumbnailService.get_image_info(file_path)
    # Returns: {width, height, size, mime_type}

    # 2d. Create shared_images record
    shared_image = await SharedImageRepository.create(conn, {
        "file_path": file_path,
        "filename": absolute_path.name,
        "width": image_info["width"],
        "height": image_info["height"],
        "file_size_bytes": image_info["size"],
        "mime_type": image_info["mime_type"],
        "registered_by": current_user.id
    })
    shared_images_list.append(shared_image)

# 3. ADD IMAGES TO PROJECT POOL
for shared_image in shared_images_list:
    await ProjectImageRepository.add_to_pool(
        conn,
        project_id=project_id,
        shared_image_id=shared_image["id"],
        user_id=current_user.id
    )
    # Note: add_to_pool is idempotent (ignores duplicates)

# 4. SHUFFLE FOR RANDOM DISTRIBUTION (if requested)
if payload.distribution_order == "random":
    random.shuffle(shared_images_list)

# 5. CREATE TASK
task = await TaskRepository.create(conn, project_id, {
    "name": payload.name,
    "description": payload.description,
    "assignee_id": payload.assignee_id,
    "total_images": len(shared_images_list)
})

# 6. CALCULATE JOB BREAKDOWN
chunk_size = payload.chunk_size
total_images = len(shared_images_list)
job_count = math.ceil(total_images / chunk_size)

# 7. CREATE JOBS WITH IMAGES
created_jobs = []
for job_index in range(job_count):
    start_idx = job_index * chunk_size
    end_idx = min((job_index + 1) * chunk_size, total_images)

    # 7a. Create job record
    job = await JobRepository.create(conn, task["id"], {
        "sequence_number": job_index,
        "assignee_id": payload.assignee_id,
        "total_images": end_idx - start_idx
    })

    # 7b. Create image records for this job
    job_images = shared_images_list[start_idx:end_idx]
    for seq_num, shared_img in enumerate(job_images):
        await ImageRepository.create(conn, job["id"], {
            "filename": shared_img["filename"],
            "s3_key": shared_img["file_path"],  # File path used as key
            "s3_bucket": "file-share",  # Marker for file share storage
            "width": shared_img["width"] or 1920,
            "height": shared_img["height"] or 1080,
            "file_size_bytes": shared_img["file_size_bytes"],
            "mime_type": shared_img["mime_type"],
            "checksum_sha256": shared_img["checksum_sha256"],
            "sequence_number": seq_num,
            "shared_image_id": shared_img["id"]  # LINK TO SHARED REGISTRY
        })

    created_jobs.append(job)

# 8. RETURN RESPONSE
return JsonResponse(
    data=TaskWithJobsResponse(
        task=TaskResponse(**task),
        jobs=[JobResponse(**j) for j in created_jobs],
        total_images=total_images,
        duplicate_count=len(failed_paths),
        duplicate_filenames=failed_paths
    ),
    message=f"Task created with {job_count} job(s) and {total_images} image(s)",
    status_code=201
)
```

### Image Registration Workflow

When an image is registered in the system:

```python
# INPUT
file_path = "datasets/wildlife/lion.jpg"

# PROCESS
1. Check if already exists
   SELECT * FROM shared_images WHERE file_path = $1

2. Validate file on filesystem
   absolute_path = SHARE_ROOT / file_path
   if not absolute_path.exists():
       raise FileNotFoundError

3. Extract metadata using PIL/Pillow
   image = Image.open(absolute_path)
   width, height = image.size
   mime_type = Image.MIME[image.format]
   file_size = absolute_path.stat().st_size

4. Calculate checksum (optional, for deduplication)
   checksum = hashlib.sha256(file_path.encode()).hexdigest()

5. Insert into database
   INSERT INTO shared_images (
       id, file_path, filename, width, height,
       file_size_bytes, mime_type, registered_by
   ) VALUES (...)

# OUTPUT
{
    "id": "uuid-here",
    "file_path": "datasets/wildlife/lion.jpg",
    "filename": "lion.jpg",
    "width": 1920,
    "height": 1080,
    "file_size_bytes": 245678,
    "mime_type": "image/jpeg",
    "registered_by": "user-uuid",
    "created_at": "2025-12-13T10:30:00Z",
    "tags": []
}
```

### Project Pool Management

Images must be added to a project pool before being used in tasks:

```python
# ADD TO POOL
await ProjectImageRepository.add_to_pool(
    connection,
    project_id=12,
    shared_image_id="image-uuid",
    user_id="user-uuid"
)

# SQL (with conflict handling)
INSERT INTO project_images (project_id, shared_image_id, added_by)
VALUES ($1, $2, $3)
ON CONFLICT (project_id, shared_image_id) DO NOTHING

# QUERY POOL WITH FILTERS
result = await ProjectImageRepository.explore(
    connection,
    project_id=12,
    filters={
        "search": "cat",
        "tag_ids": ["tag-uuid-1", "tag-uuid-2"],
        "task_id": 5,
        "job_id": None,
        "is_annotated": False
    },
    page=1,
    page_size=50
)

# SQL (simplified view)
SELECT DISTINCT si.*
FROM shared_images si
JOIN project_images pi ON pi.shared_image_id = si.id
LEFT JOIN images img ON img.shared_image_id = si.id
LEFT JOIN jobs j ON img.job_id = j.id
LEFT JOIN shared_image_tags sit ON sit.shared_image_id = si.id
WHERE pi.project_id = $1
  AND (si.filename ILIKE '%' || $2 || '%')  -- search
  AND sit.tag_id = ANY($3)                   -- tags
  AND j.task_id = $4                         -- task filter
  AND img.is_annotated = $5                  -- annotation status
ORDER BY si.created_at DESC
LIMIT 50 OFFSET 0
```

---

## Data Models

### Shared Images Table

**Purpose**: Central registry of all images in the system

```sql
CREATE TABLE shared_images (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path           VARCHAR(1024) NOT NULL UNIQUE,  -- Relative from /data/share
    filename            VARCHAR(512) NOT NULL,
    width               INTEGER,
    height              INTEGER,
    file_size_bytes     BIGINT,
    mime_type           VARCHAR(100),
    checksum_sha256     VARCHAR(64),
    metadata            JSONB DEFAULT '{}',  -- Extensible metadata
    registered_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shared_images_file_path ON shared_images(file_path);
CREATE INDEX idx_shared_images_registered_by ON shared_images(registered_by);
```

**Example Record**:
```json
{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "file_path": "datasets/cats/fluffy.jpg",
    "filename": "fluffy.jpg",
    "width": 1920,
    "height": 1080,
    "file_size_bytes": 345678,
    "mime_type": "image/jpeg",
    "checksum_sha256": "abc123...",
    "metadata": {
        "exif": {},
        "custom_field": "value"
    },
    "registered_by": "user-uuid",
    "created_at": "2025-12-13T10:00:00Z",
    "updated_at": "2025-12-13T10:00:00Z"
}
```

### Tags Table

**Purpose**: Global tags for categorizing images

```sql
CREATE TABLE tags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    description     VARCHAR(500),
    color           VARCHAR(7) DEFAULT '#6B7280',  -- Hex color
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tags_name ON tags(name);
```

**Example Records**:
```json
[
    {
        "id": "tag-1",
        "name": "cat",
        "description": "Images containing cats",
        "color": "#10B981",
        "created_by": "user-uuid",
        "created_at": "2025-12-13T09:00:00Z"
    },
    {
        "id": "tag-2",
        "name": "outdoor",
        "description": "Outdoor scenes",
        "color": "#3B82F6",
        "created_by": "user-uuid",
        "created_at": "2025-12-13T09:05:00Z"
    }
]
```

### Shared Image Tags (Junction Table)

**Purpose**: Many-to-many relationship between images and tags

```sql
CREATE TABLE shared_image_tags (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shared_image_id     UUID NOT NULL REFERENCES shared_images(id) ON DELETE CASCADE,
    tag_id              UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(shared_image_id, tag_id)
);

CREATE INDEX idx_shared_image_tags_image ON shared_image_tags(shared_image_id);
CREATE INDEX idx_shared_image_tags_tag ON shared_image_tags(tag_id);
```

### Project Images (Project Pool)

**Purpose**: Many-to-many relationship between projects and shared images

```sql
CREATE TABLE project_images (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    shared_image_id     UUID NOT NULL REFERENCES shared_images(id) ON DELETE CASCADE,
    added_by            UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, shared_image_id)
);

CREATE INDEX idx_project_images_project ON project_images(project_id);
CREATE INDEX idx_project_images_image ON project_images(shared_image_id);
```

### Images Table (Enhanced)

**Purpose**: Job-specific image instances with link to shared registry

```sql
-- Existing table with new column added
ALTER TABLE images
ADD COLUMN shared_image_id UUID REFERENCES shared_images(id) ON DELETE SET NULL;

CREATE INDEX idx_images_shared_image_id ON images(shared_image_id);
```

**Why both `images` and `shared_images`?**
- `shared_images`: Global registry, one record per unique image
- `images`: Job-specific instances, may have duplicates across jobs
- `images.shared_image_id`: Links instance to registry for deduplication and tracking

---

## API Endpoints

### Shared Images API

#### List Shared Images
```http
GET /api/v1/shared-images?page=1&page_size=50&search=cat&tag_ids=uuid1,uuid2
```

**Response**:
```json
{
    "data": [
        {
            "id": "uuid",
            "file_path": "datasets/cats/img1.jpg",
            "filename": "img1.jpg",
            "width": 1920,
            "height": 1080,
            "file_size_bytes": 234567,
            "mime_type": "image/jpeg",
            "thumbnail_url": "/api/v1/share/thumbnail?path=...",
            "tags": [
                {"id": "tag-uuid", "name": "cat", "color": "#10B981"}
            ],
            "created_at": "2025-12-13T10:00:00Z"
        }
    ],
    "meta": {
        "total": 100,
        "page": 1,
        "page_size": 50
    },
    "message": "Found 100 image(s)",
    "status_code": 200
}
```

#### Register File Paths
```http
POST /api/v1/shared-images/register
Content-Type: application/json

{
    "file_paths": [
        "datasets/cats/img1.jpg",
        "datasets/dogs/",
        "datasets/birds/eagle.png"
    ]
}
```

**Response**:
```json
{
    "data": {
        "registered": [
            {"id": "uuid-1", "file_path": "datasets/cats/img1.jpg", ...},
            {"id": "uuid-2", "file_path": "datasets/birds/eagle.png", ...}
        ],
        "already_existed": ["datasets/cats/img1.jpg"],
        "failed": ["datasets/dogs/missing.jpg"],
        "total_registered": 2,
        "total_already_existed": 1,
        "total_failed": 1
    },
    "message": "Registered 2 new image(s)",
    "status_code": 200
}
```

#### Add Tags to Image
```http
POST /api/v1/shared-images/{image_id}/tags
Content-Type: application/json

{
    "tag_ids": ["tag-uuid-1", "tag-uuid-2"]
}
```

#### Bulk Tag Images
```http
POST /api/v1/shared-images/bulk-tag
Content-Type: application/json

{
    "shared_image_ids": ["img-uuid-1", "img-uuid-2"],
    "tag_ids": ["tag-uuid-1"]
}
```

**Response**:
```json
{
    "data": {
        "tags_added": 2,
        "images_affected": 2
    },
    "message": "Tags added successfully",
    "status_code": 200
}
```

### Tags API

#### Create Tag
```http
POST /api/v1/tags
Content-Type: application/json

{
    "name": "outdoor",
    "description": "Outdoor scenes",
    "color": "#3B82F6"
}
```

#### List Tags
```http
GET /api/v1/tags?search=cat&include_usage_count=true
```

**Response**:
```json
{
    "data": [
        {
            "id": "uuid",
            "name": "cat",
            "description": "Images with cats",
            "color": "#10B981",
            "usage_count": 45,
            "created_at": "2025-12-13T09:00:00Z"
        }
    ],
    "message": "Found 1 tag(s)",
    "status_code": 200
}
```

### Project Images API

#### Add Images to Project Pool
```http
POST /api/v1/projects/{project_id}/images
Content-Type: application/json

{
    "shared_image_ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

#### Explore Project Images
```http
GET /api/v1/projects/{project_id}/explore?
    page=1&
    page_size=50&
    search=cat&
    tag_ids=uuid1,uuid2&
    task_id=5&
    is_annotated=false
```

**Response**:
```json
{
    "data": {
        "images": [...],
        "total": 100,
        "page": 1,
        "page_size": 50,
        "filters_applied": {
            "search": "cat",
            "tag_ids": ["uuid1", "uuid2"],
            "task_id": 5,
            "is_annotated": false
        }
    },
    "message": "Found 100 image(s)",
    "status_code": 200
}
```

### Tasks API

#### Create Task with File Paths
```http
POST /api/v1/projects/{project_id}/tasks/create-with-file-paths
Content-Type: application/json

{
    "name": "Cat Detection Task",
    "description": "Annotate cats in images",
    "assignee_id": "user-uuid-or-null",
    "chunk_size": 50,
    "distribution_order": "random",
    "file_paths": [
        "datasets/cats/img1.jpg",
        "datasets/cats/img2.jpg",
        "datasets/cats/folder1/"
    ]
}
```

**Response**:
```json
{
    "data": {
        "task": {
            "id": 10,
            "name": "Cat Detection Task",
            "total_images": 150
        },
        "jobs": [
            {"id": 1, "sequence_number": 0, "total_images": 50},
            {"id": 2, "sequence_number": 1, "total_images": 50},
            {"id": 3, "sequence_number": 2, "total_images": 50}
        ],
        "total_images": 150,
        "duplicate_count": 0,
        "duplicate_filenames": []
    },
    "message": "Task created with 3 job(s) and 150 image(s)",
    "status_code": 201
}
```

---

## Frontend Components

### CreateTaskWizard

**Location**: `apps/web/src/components/CreateTaskWizard.tsx`

**Purpose**: Multi-step wizard for creating tasks

**Key State**:
```typescript
const [imageSourceMode, setImageSourceMode] = useState<'select' | 'upload'>('select')
const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([])
const [uploadedImages, setUploadedImages] = useState<MockImage[]>([])
const [chunkSize, setChunkSize] = useState(50)
const [distributionOrder, setDistributionOrder] = useState<'sequential' | 'random'>('sequential')
```

**Steps**:
1. **Basic Info**: Name, description, assignee
2. **Images**: File share selection OR upload
3. **Configure**: Chunk size, distribution order
4. **Review**: Summary and create

**Mode Toggle**:
```typescript
{/* Image Source Mode Toggle */}
<div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
  <button
    onClick={() => setImageSourceMode('select')}
    className={imageSourceMode === 'select' ? 'active' : ''}
  >
    Select from File Share
  </button>
  <button
    onClick={() => setImageSourceMode('upload')}
    className={imageSourceMode === 'upload' ? 'active' : ''}
  >
    Upload New Images
  </button>
</div>

{/* Conditional Rendering */}
{imageSourceMode === 'select' && (
  <FileExplorer
    onSelect={handleFileExplorerSelect}
    allowMultiSelect
    showFiles
  />
)}

{imageSourceMode === 'upload' && (
  <DropZone onFilesSelected={handleFileSelect} />
)}
```

**File Selection Handler**:
```typescript
const handleFileExplorerSelect = async (paths: string[]) => {
  if (paths.length === 0) {
    toast.error('No files selected')
    return
  }

  setIsResolvingPaths(true)
  try {
    // Resolve folders to individual file paths
    const resolvedPaths = await resolveMutation.mutateAsync({
      paths,
      recursive: true
    })

    if (resolvedPaths.length === 0) {
      toast.error('No image files found in selection')
      return
    }

    setSelectedFilePaths(resolvedPaths)
    toast.success(`Selected ${resolvedPaths.length} image(s)`)
  } catch (err) {
    toast.error('Failed to resolve selection')
  } finally {
    setIsResolvingPaths(false)
  }
}
```

**Task Creation**:
```typescript
const handleCreate = async () => {
  try {
    if (imageSourceMode === 'select') {
      // Use new file paths API
      const result = await taskFilePathsApi.createWithFilePaths(projectId, {
        name: taskName,
        description: taskDescription,
        assignee_id: assigneeId,
        chunk_size: chunkSize,
        distribution_order: distributionOrder,
        file_paths: selectedFilePaths
      })

      toast.success(`Task created with ${result.total_images} images`)
      onSuccess()
    } else {
      // Use legacy upload API
      const result = await tasksApi.createWithImages(projectId, {
        name: taskName,
        description: taskDescription,
        assignee_id: assigneeId,
        chunk_size: chunkSize,
        distribution_order: distributionOrder,
        images: uploadedImages
      })

      toast.success('Task created')
      onSuccess()
    }
  } catch (err) {
    toast.error('Failed to create task')
  }
}
```

### ProjectExploreTab

**Location**: `apps/web/src/components/ProjectExploreTab.tsx`

**Purpose**: Image gallery with advanced filtering and bulk operations

**Key Features**:
- **Tag Filter**: Multi-select tag chips
- **Task/Job Filter**: Cascading dropdowns
- **Search**: Filename search
- **Gallery**: Grid of thumbnails with selection
- **Bulk Actions**: Tag multiple images at once

**State Management**:
```typescript
const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
const [selectedTags, setSelectedTags] = useState<string[]>([])
const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
const [selectedJobId, setSelectedJobId] = useState<number | null>(null)
const [searchQuery, setSearchQuery] = useState('')
const [page, setPage] = useState(1)
```

**Data Fetching**:
```typescript
const { data: exploreData, isLoading } = useQuery({
  queryKey: ['project-explore', projectId, filters, page],
  queryFn: () => projectImagesApi.explore(projectId, {
    search: searchQuery,
    tag_ids: selectedTags,
    task_id: selectedTaskId,
    job_id: selectedJobId,
    is_annotated: annotatedFilter,
    page,
    page_size: 50
  })
})
```

**Bulk Tagging**:
```typescript
const handleBulkTag = async (tagIds: string[]) => {
  try {
    await sharedImagesApi.bulkTag(
      Array.from(selectedImages),
      tagIds
    )
    toast.success('Tags added to selected images')
    setSelectedImages(new Set())
    refetch()
  } catch (err) {
    toast.error('Failed to add tags')
  }
}
```

### FileExplorer

**Location**: `apps/web/src/features/file-explorer/components/FileExplorer.tsx`

**Purpose**: Browse and select files from `/data/share` directory

**Key Features**:
- Tree view with lazy loading
- Multi-select with checkboxes
- Folder expansion/collapse
- Breadcrumb navigation
- Selection state management

**Integration**:
```typescript
// In CreateTaskWizard
import { FileExplorer, useFileSelectionStore } from '../features/file-explorer'

const { selectedPaths, clearSelection } = useFileSelectionStore()

<FileExplorer
  onSelect={(paths) => handleFileExplorerSelect(paths)}
  allowMultiSelect={true}
  showFiles={true}
  fileFilter={(item) => {
    // Only show image files
    if (item.type === 'directory') return true
    return /\.(jpg|jpeg|png|webp|gif)$/i.test(item.name)
  }}
/>
```

---

## Code Examples

### Frontend: Creating a Task with File Share

```typescript
import { taskFilePathsApi } from '@/lib/data-management-client'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'

function MyComponent({ projectId }: { projectId: string }) {
  const createTaskMutation = useMutation({
    mutationFn: (data: TaskCreateWithFilePaths) =>
      taskFilePathsApi.createWithFilePaths(projectId, data),
    onSuccess: (result) => {
      toast.success(`Task created with ${result.total_images} images`)
    },
    onError: () => {
      toast.error('Failed to create task')
    }
  })

  const handleSubmit = () => {
    createTaskMutation.mutate({
      name: 'My Task',
      description: 'Task description',
      assignee_id: null,
      chunk_size: 50,
      distribution_order: 'random',
      file_paths: [
        'datasets/cats/img1.jpg',
        'datasets/cats/img2.jpg',
        'datasets/dogs/'  // Will be expanded to all images in folder
      ]
    })
  }

  return (
    <button onClick={handleSubmit}>
      Create Task
    </button>
  )
}
```

### Frontend: Exploring with Filters

```typescript
import { projectImagesApi } from '@/lib/data-management-client'
import { useQuery } from '@tanstack/react-query'

function ExploreView({ projectId }: { projectId: string }) {
  const [filters, setFilters] = useState({
    search: '',
    tag_ids: [],
    task_id: null,
    is_annotated: false
  })

  const { data, isLoading } = useQuery({
    queryKey: ['explore', projectId, filters],
    queryFn: () => projectImagesApi.explore(projectId, {
      ...filters,
      page: 1,
      page_size: 50
    })
  })

  if (isLoading) return <div>Loading...</div>

  return (
    <div>
      {/* Filters */}
      <input
        value={filters.search}
        onChange={(e) => setFilters({...filters, search: e.target.value})}
        placeholder="Search images..."
      />

      {/* Gallery */}
      <div className="grid grid-cols-4 gap-4">
        {data?.images.map(image => (
          <div key={image.id}>
            <img src={image.thumbnail_url} alt={image.filename} />
            <p>{image.filename}</p>
            <div>
              {image.tags.map(tag => (
                <span key={tag.id} style={{color: tag.color}}>
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Backend: Repository Example

```python
# apps/api-core/src/app/repositories/shared_image.py

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncConnection
from app.models.data_management import shared_images, shared_image_tags
from app.models.tag import tags

class SharedImageRepository:
    """Repository for shared_images table operations."""

    @staticmethod
    async def get_by_file_path(
        connection: AsyncConnection,
        file_path: str
    ) -> dict | None:
        """Get shared image by file path."""
        stmt = select(shared_images).where(
            shared_images.c.file_path == file_path
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def create(
        connection: AsyncConnection,
        data: dict
    ) -> dict:
        """Create a new shared image record."""
        stmt = shared_images.insert().values(**data).returning(shared_images)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping)

    @staticmethod
    async def list_with_tags(
        connection: AsyncConnection,
        tag_ids: list[str] | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0
    ) -> list[dict]:
        """List shared images with optional tag filtering."""

        # Base query with tag join
        stmt = (
            select(
                shared_images,
                # Aggregate tags as JSON array
                func.coalesce(
                    func.json_agg(
                        func.json_build_object(
                            'id', tags.c.id,
                            'name', tags.c.name,
                            'color', tags.c.color
                        )
                    ).filter(tags.c.id.isnot(None)),
                    '[]'
                ).label('tags')
            )
            .outerjoin(
                shared_image_tags,
                shared_images.c.id == shared_image_tags.c.shared_image_id
            )
            .outerjoin(
                tags,
                shared_image_tags.c.tag_id == tags.c.id
            )
            .group_by(shared_images.c.id)
        )

        # Apply filters
        if search:
            stmt = stmt.where(
                shared_images.c.filename.ilike(f'%{search}%')
            )

        if tag_ids:
            # Images must have ALL specified tags
            stmt = stmt.where(
                shared_images.c.id.in_(
                    select(shared_image_tags.c.shared_image_id)
                    .where(shared_image_tags.c.tag_id.in_(tag_ids))
                    .group_by(shared_image_tags.c.shared_image_id)
                    .having(func.count() == len(tag_ids))
                )
            )

        # Pagination
        stmt = stmt.limit(limit).offset(offset)

        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]
```

### Backend: Service Example

```python
# apps/api-core/src/app/services/filesystem.py

from pathlib import Path
from app.config import settings

class FileSystemService:
    """Service for filesystem operations."""

    def __init__(self):
        self.share_root = Path(settings.SHARE_ROOT)

    def get_absolute_path(self, relative_path: str) -> Path:
        """Convert relative path to absolute path."""
        abs_path = self.share_root / relative_path

        # Security: Prevent path traversal
        if not abs_path.resolve().is_relative_to(self.share_root.resolve()):
            raise ValueError("Path traversal detected")

        return abs_path

    async def resolve_selection(
        self,
        paths: list[str],
        recursive: bool = True
    ) -> list[str]:
        """Resolve selection (expand folders to file list)."""
        resolved = []

        for path in paths:
            abs_path = self.get_absolute_path(path)

            if abs_path.is_file():
                # Check if it's an image
                if self._is_image_file(abs_path):
                    resolved.append(path)

            elif abs_path.is_dir():
                # Expand directory
                if recursive:
                    for file_path in abs_path.rglob('*'):
                        if file_path.is_file() and self._is_image_file(file_path):
                            rel_path = file_path.relative_to(self.share_root)
                            resolved.append(str(rel_path))
                else:
                    for file_path in abs_path.iterdir():
                        if file_path.is_file() and self._is_image_file(file_path):
                            rel_path = file_path.relative_to(self.share_root)
                            resolved.append(str(rel_path))

        return resolved

    @staticmethod
    def _is_image_file(path: Path) -> bool:
        """Check if file is an image."""
        image_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'}
        return path.suffix.lower() in image_extensions
```

---

## Sequence Diagrams

### Task Creation Flow

```
User                CreateTaskWizard    ShareAPI            API Core                    Database
 │                        │               │                    │                           │
 │  1. Open Wizard        │               │                    │                           │
 ├───────────────────────>│               │                    │                           │
 │                        │               │                    │                           │
 │  2. Select "File Share"│               │                    │                           │
 │  mode                  │               │                    │                           │
 ├───────────────────────>│               │                    │                           │
 │                        │               │                    │                           │
 │                        │  3. Show FileExplorer              │                           │
 │                        ├──────────────>│                    │                           │
 │                        │               │                    │                           │
 │  4. Select files/folders                │                   │                           │
 ├──────────────────────────────────────>│                    │                           │
 │                        │               │                    │                           │
 │                        │  5. POST /resolve-selection        │                           │
 │                        ├──────────────────────────────────>│                           │
 │                        │               │                    │  6. Expand folders       │
 │                        │               │                    │  to file list            │
 │                        │               │                    │───────────────────────>│
 │                        │               │                    │                           │
 │                        │  7. Return file paths              │                           │
 │                        │<──────────────────────────────────│                           │
 │                        │               │                    │                           │
 │  8. Show resolved count│               │                    │                           │
 │<───────────────────────│               │                    │                           │
 │                        │               │                    │                           │
 │  9. Configure & Submit │               │                    │                           │
 ├───────────────────────>│               │                    │                           │
 │                        │               │                    │                           │
 │                        │  10. POST /tasks/create-with-file-paths                       │
 │                        ├──────────────────────────────────────────────────────────────>│
 │                        │               │                    │                           │
 │                        │               │                    │  11. Register images     │
 │                        │               │                    │  (if not exists)         │
 │                        │               │                    ├─────────────────────────>│
 │                        │               │                    │<─────────────────────────│
 │                        │               │                    │                           │
 │                        │               │                    │  12. Add to project pool │
 │                        │               │                    ├─────────────────────────>│
 │                        │               │                    │<─────────────────────────│
 │                        │               │                    │                           │
 │                        │               │                    │  13. Create task         │
 │                        │               │                    ├─────────────────────────>│
 │                        │               │                    │<─────────────────────────│
 │                        │               │                    │                           │
 │                        │               │                    │  14. Create jobs         │
 │                        │               │                    ├─────────────────────────>│
 │                        │               │                    │<─────────────────────────│
 │                        │               │                    │                           │
 │                        │               │                    │  15. Create images       │
 │                        │               │                    │  (link to shared_images) │
 │                        │               │                    ├─────────────────────────>│
 │                        │               │                    │<─────────────────────────│
 │                        │               │                    │                           │
 │                        │  16. Return task with jobs         │                           │
 │                        │<──────────────────────────────────────────────────────────────│
 │                        │               │                    │                           │
 │  17. Show success      │               │                    │                           │
 │<───────────────────────│               │                    │                           │
```

### Image Explore & Tag Flow

```
User            ProjectExploreTab    API Core            Database
 │                    │                 │                   │
 │  1. Open Explore   │                 │                   │
 ├───────────────────>│                 │                   │
 │                    │                 │                   │
 │                    │  2. GET /projects/{id}/explore      │
 │                    ├─────────────────────────────────────>│
 │                    │                 │                   │
 │                    │                 │  3. Query with    │
 │                    │                 │  joins (images,   │
 │                    │                 │  tags, tasks)     │
 │                    │                 ├──────────────────>│
 │                    │                 │<──────────────────│
 │                    │                 │                   │
 │                    │  4. Return images with tags         │
 │                    │<────────────────────────────────────│
 │                    │                 │                   │
 │  5. Show gallery   │                 │                   │
 │<───────────────────│                 │                   │
 │                    │                 │                   │
 │  6. Apply filters  │                 │                   │
 │  (tags, task, etc) │                 │                   │
 ├───────────────────>│                 │                   │
 │                    │                 │                   │
 │                    │  7. GET /explore with filters       │
 │                    ├─────────────────────────────────────>│
 │                    │                 │                   │
 │                    │  8. Filtered results                │
 │                    │<────────────────────────────────────│
 │                    │                 │                   │
 │  9. Update gallery │                 │                   │
 │<───────────────────│                 │                   │
 │                    │                 │                   │
 │  10. Select images │                 │                   │
 │  (multi-select)    │                 │                   │
 ├───────────────────>│                 │                   │
 │                    │                 │                   │
 │  11. Click "Add Tags"                │                   │
 ├───────────────────>│                 │                   │
 │                    │                 │                   │
 │                    │  12. POST /shared-images/bulk-tag   │
 │                    ├─────────────────────────────────────>│
 │                    │                 │                   │
 │                    │                 │  13. Insert tags  │
 │                    │                 ├──────────────────>│
 │                    │                 │<──────────────────│
 │                    │                 │                   │
 │                    │  14. Success                        │
 │                    │<────────────────────────────────────│
 │                    │                 │                   │
 │  15. Refetch data  │                 │                   │
 │  to show new tags  │                 │                   │
 │<───────────────────│                 │                   │
```

---

## Database Schema Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          SHARED_IMAGES                               │
│  (Central registry of all images)                                    │
├─────────────────────────────────────────────────────────────────────┤
│ • id: UUID (PK)                                                      │
│ • file_path: VARCHAR(1024) UNIQUE                                   │
│ • filename: VARCHAR(512)                                             │
│ • width, height: INTEGER                                             │
│ • file_size_bytes: BIGINT                                            │
│ • mime_type: VARCHAR(100)                                            │
│ • checksum_sha256: VARCHAR(64)                                       │
│ • metadata: JSONB                                                    │
│ • registered_by: UUID → users.id                                     │
│ • created_at, updated_at: TIMESTAMPTZ                                │
└─────────────────────────────────────────────────────────────────────┘
               │                                │
               │                                │
               ▼                                ▼
┌──────────────────────────┐    ┌──────────────────────────────────┐
│ SHARED_IMAGE_TAGS        │    │    PROJECT_IMAGES                │
│ (Image-Tag junction)     │    │    (Project pool)                │
├──────────────────────────┤    ├──────────────────────────────────┤
│ • id: UUID (PK)          │    │ • id: UUID (PK)                  │
│ • shared_image_id: UUID  │    │ • project_id: INT → projects.id  │
│ • tag_id: UUID           │    │ • shared_image_id: UUID          │
│ • created_by: UUID       │    │ • added_by: UUID → users.id      │
│ • created_at: TIMESTAMPTZ│    │ • created_at: TIMESTAMPTZ        │
│ UNIQUE(image_id, tag_id) │    │ UNIQUE(project_id, image_id)     │
└──────────────────────────┘    └──────────────────────────────────┘
       │                                     │
       │                                     │
       ▼                                     ▼
┌──────────────────────────┐    ┌──────────────────────────────────┐
│        TAGS              │    │       PROJECTS                    │
│  (Global tags)           │    │  (Existing table)                │
├──────────────────────────┤    ├──────────────────────────────────┤
│ • id: UUID (PK)          │    │ • id: INTEGER (PK)               │
│ • name: VARCHAR(100)     │    │ • name: VARCHAR                  │
│ • description: VARCHAR   │    │ • slug: VARCHAR                  │
│ • color: VARCHAR(7)      │    │ • ...                            │
│ • created_by: UUID       │    └──────────────────────────────────┘
│ • created_at: TIMESTAMPTZ│                │
└──────────────────────────┘                │
                                            ▼
                                ┌──────────────────────────────────┐
                                │         TASKS                     │
                                │    (Existing table)               │
                                ├──────────────────────────────────┤
                                │ • id: INTEGER (PK)               │
                                │ • project_id: INT → projects.id  │
                                │ • name: VARCHAR                  │
                                │ • total_images: INTEGER          │
                                │ • ...                            │
                                └──────────────────────────────────┘
                                            │
                                            ▼
                                ┌──────────────────────────────────┐
                                │          JOBS                     │
                                │    (Existing table)               │
                                ├──────────────────────────────────┤
                                │ • id: INTEGER (PK)               │
                                │ • task_id: INT → tasks.id        │
                                │ • sequence_number: INTEGER       │
                                │ • total_images: INTEGER          │
                                │ • ...                            │
                                └──────────────────────────────────┘
                                            │
                                            ▼
                                ┌──────────────────────────────────┐
                                │         IMAGES                    │
                                │    (Enhanced existing table)      │
                                ├──────────────────────────────────┤
                                │ • id: INTEGER (PK)               │
                                │ • job_id: INT → jobs.id          │
                                │ • filename: VARCHAR              │
                                │ • s3_key: VARCHAR                │
                                │ • shared_image_id: UUID ────────┐│
                                │   → shared_images.id            ││
                                │ • sequence_number: INTEGER      ││
                                │ • is_annotated: BOOLEAN         ││
                                │ • ...                           ││
                                └─────────────────────────────────┘│
                                                                   │
                                  ┌────────────────────────────────┘
                                  │
                                  │ (Links job instance to shared registry)
                                  └────────────────────────────────┐
                                                                   │
                                  Back to SHARED_IMAGES ───────────┘
```

---

## Summary

### Key Takeaways

1. **Centralized Registry**: All images are registered in `shared_images` table with metadata
2. **Many-to-Many**: Images can be shared across multiple projects and tasks
3. **Project Pool**: Images must be added to project pool before use in tasks
4. **Two Creation Modes**: Select from file share (new) OR upload (legacy)
5. **Advanced Filtering**: Explore tab supports tags, tasks, jobs, and annotation status
6. **File Share Storage**: Images stay in `/data/share`, referenced by relative paths
7. **Tagging System**: Global tags for organization, bulk operations supported

### File Locations

**Backend**:
- Models: `apps/api-core/src/app/models/data_management.py`
- Routers: `apps/api-core/src/app/routers/{shared_images,tags,project_images}.py`
- Repositories: `apps/api-core/src/app/repositories/{shared_image,tag,project_image}.py`
- Schemas: `apps/api-core/src/app/schemas/data_management.py`
- Migration: `apps/api-core/src/migrations/versions/20251213_1500-a1b2c3d4e5f7_add_data_management_tables.py`

**Frontend**:
- CreateTaskWizard: `apps/web/src/components/CreateTaskWizard.tsx`
- ProjectExploreTab: `apps/web/src/components/ProjectExploreTab.tsx`
- FileExplorer: `apps/web/src/features/file-explorer/components/FileExplorer.tsx`
- API Client: `apps/web/src/lib/data-management-client.ts`

### Testing Checklist

- [ ] Create task with file share selection
- [ ] Create task with folder selection (auto-expand)
- [ ] Create task with upload mode
- [ ] View images in Explore tab
- [ ] Filter by tags
- [ ] Filter by task/job
- [ ] Search by filename
- [ ] Create new tags
- [ ] Bulk tag multiple images
- [ ] View image details modal
- [ ] Verify shared_image_id links work
- [ ] Verify duplicate detection
- [ ] Test pagination

---

**Document Maintainers**: Engineering Team
**Related Docs**:
- [Database Schema](./database-schema.dbml)
- [API Specifications](./api-specs/)
- [File Share Feature](../apps/api-core/src/app/routers/share.py)
