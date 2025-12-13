// File system types
export type FileType = 'file' | 'directory'

export interface FileItem {
  name: string
  path: string
  type: FileType
  size?: number
  mimeType?: string
  modifiedAt?: string
  childrenCount?: number
}

export interface DirectoryListResponse {
  path: string
  items: FileItem[]
  totalCount: number
  hasMore: boolean
}

// Tree node with UI state
export interface TreeNode extends FileItem {
  isExpanded: boolean
  isLoading: boolean
  children?: TreeNode[]
  depth: number
}

// Selection types
export type SelectionState = 'none' | 'partial' | 'full'

export interface FileSelection {
  selectedPaths: Set<string>
  indeterminatePaths: Set<string>
}

// Upload types
export interface UploadFile {
  id: string
  file: File
  relativePath: string
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

export interface UploadFailure {
  filename: string
  reason: string
}

export interface UploadResponse {
  uploaded: string[]
  failed: UploadFailure[]
  totalUploaded: number
  totalFailed: number
}

// Image info
export interface ImageInfo {
  path: string
  width: number
  height: number
  size: number
  mimeType: string
  thumbnailUrl: string
}

// Component props
export interface FileExplorerProps {
  onSelect?: (paths: string[]) => void
  selectionMode?: 'single' | 'multiple'
  showUpload?: boolean
  initialPath?: string
  className?: string
}

export interface FileTreeNodeProps {
  item: FileItem
  depth: number
  selectionMode: 'single' | 'multiple'
  isExpanded: boolean
  onToggleExpand: (path: string) => void
  onNavigate: (path: string) => void
  onMouseEnterFolder?: (path: string) => () => void
}
