/**
 * Export types for Team Mode versioned export feature.
 */

// ============================================================================
// Enums
// ============================================================================
export type ExportMode = 'classification' | 'detection' | 'segmentation';
export type ExportOutputFormat = 'coco_json' | 'manifest_csv' | 'image_folder';
export type TaskSplit = 'train' | 'val' | 'test';
export type VersionMode = 'latest' | 'job_version' | 'timestamp';
export type ClassificationMappingMode = 'categorized' | 'free_form';
export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed';

// ============================================================================
// Configuration Types
// ============================================================================
export interface ClassificationMappingConfig {
  mode: ClassificationMappingMode;
  category_id?: string;
  class_mapping?: Record<string, string[]>; // class_name -> tag_ids
}

export interface ModeOptions {
  include_bbox_from_segmentation?: boolean;
  include_bbox_alongside_segmentation?: boolean;
  convert_bbox_to_segmentation?: boolean;
  label_filter?: string[];
}

export interface FilterSnapshot {
  tag_ids?: string[];
  excluded_tag_ids?: string[];
  include_match_mode?: 'AND' | 'OR';
  exclude_match_mode?: 'AND' | 'OR';
  task_ids?: number[];
  job_id?: number;
  is_annotated?: boolean;
  filepath_paths?: string[];
  image_uids?: string[];
  width_min?: number;
  width_max?: number;
  height_min?: number;
  height_max?: number;
  file_size_min?: number;
  file_size_max?: number;
}

// ============================================================================
// Saved Filter Types
// ============================================================================
export interface SavedFilterCreate {
  name: string;
  description?: string;
  filter_config: FilterSnapshot;
}

export interface SavedFilterUpdate {
  name?: string;
  description?: string;
  filter_config?: FilterSnapshot;
}

export interface SavedFilter {
  id: string;
  project_id: number;
  name: string;
  description?: string;
  filter_config: FilterSnapshot;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Export Types
// ============================================================================
export interface ExportCreate {
  export_mode: ExportMode;
  output_format: ExportOutputFormat;
  include_images: boolean;
  filter_snapshot: FilterSnapshot;
  saved_filter_id?: string;
  classification_config?: ClassificationMappingConfig;
  mode_options?: ModeOptions;
  version_mode: VersionMode;
  version_value?: string;
  name?: string; // Optional - auto-generated if not provided
  message?: string;
}

export interface ExportSummary {
  image_count: number;
  annotation_count: number;
  class_counts: Record<string, number>;
  split_counts: Record<string, number>;
}

export interface Export {
  id: string;
  project_id: number;
  name?: string;
  version_number?: number;
  export_mode: ExportMode;
  output_format: ExportOutputFormat;
  include_images: boolean;
  filter_snapshot: FilterSnapshot;
  saved_filter_id?: string;
  classification_config?: ClassificationMappingConfig;
  mode_options?: ModeOptions;
  version_mode: VersionMode;
  version_value?: string;
  status: ExportStatus;
  artifact_path?: string;
  artifact_size_bytes?: number;
  message?: string;
  error_message?: string;
  summary?: ExportSummary;
  created_by?: string;
  created_at: string;
  completed_at?: string;
}

export interface ExportListResponse {
  exports: Export[];
  total: number;
  page: number;
  page_size: number;
}

// ============================================================================
// Export Preview Types
// ============================================================================
export interface ExportPreview {
  image_count: number;
  annotation_counts: Record<string, number>;
  class_counts: Record<string, number>;
  split_counts: Record<string, number>;
  warnings: string[];
}

// ============================================================================
// Classification Options Types
// ============================================================================
export interface TagForExport {
  id: string;
  name: string;
  color: string;
  category_id?: string;
}

export interface TagCategoryForExport {
  id: string;
  name: string;
  display_name?: string;
  color: string;
  tags: TagForExport[];
}

export interface LabelForExport {
  id: string;
  name: string;
  color: string;
}

export interface ClassificationOptionsResponse {
  categories: TagCategoryForExport[];
  labels: LabelForExport[];
}

// ============================================================================
// Wizard State Types
// ============================================================================
export interface ExportWizardState {
  step: number;
  exportMode: ExportMode | null;
  outputFormat: ExportOutputFormat;
  includeImages: boolean;
  filterSnapshot: FilterSnapshot;
  savedFilterId?: string;
  classificationConfig?: ClassificationMappingConfig;
  modeOptions: ModeOptions;
  versionMode: VersionMode;
  versionValue?: string;
  message: string;
}

export const initialExportWizardState: ExportWizardState = {
  step: 1,
  exportMode: null,
  outputFormat: 'coco_json',
  includeImages: false,
  filterSnapshot: {},
  modeOptions: {},
  versionMode: 'latest',
  message: '',
};
