/**
 * Project Detail Page
 * Shows project overview with tabs for README, Configuration, History, and Explore
 */

import {
    ArrowLeft,
    BookOpen,
    Edit3,
    FolderKanban,
    Loader2,
    Save,
    X
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import ProjectConfigurationTab from '../components/ProjectConfigurationTab';
import ProjectExploreTab from '../components/ProjectExploreTab';
import ProjectHistoryTab from '../components/ProjectHistoryTab';
import ProjectReadmeEditor, { type ProjectReadmeEditorHandle } from '../components/ProjectReadmeEditor';
import ProjectTabs, { type ProjectTabId } from '../components/ProjectTabs';
import ProjectTasksTab from '../components/ProjectTasksTab';
import type { ProjectDetail } from '../lib/api-client';
import { projectsApi } from '../lib/api-client';

const DEFAULT_README = `# Project Overview

Welcome to this annotation project! This README provides important information for annotators.

## Annotation Guidelines

Describe the annotation guidelines here:

- **Object types**: What objects should be annotated?
- **Bounding boxes**: When to use bounding boxes
- **Polygons**: When to use polygon segmentation

## Label Definitions

| Label | Description | When to Use |
|-------|-------------|-------------|
| Example | Description | Guidelines |

## Additional Notes

Add any additional information that annotators should know.
`;

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedReadme, setEditedReadme] = useState('');
  const editorRef = useRef<ProjectReadmeEditorHandle>(null);

  // Get active tab from URL or default to 'readme'
  const activeTab = (searchParams.get('tab') as ProjectTabId) || 'readme';
  
  const handleTabChange = (tab: ProjectTabId) => {
    setSearchParams({ tab });
    // Cancel editing when switching tabs
    if (isEditing && tab !== 'readme') {
      setIsEditing(false);
      setEditedReadme(project?.readme || '');
    }
  };

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    if (!projectId) return;

    try {
      const data = await projectsApi.get(projectId);
      setProject(data);
      setEditedReadme(data.readme || '');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      toast.error(axiosError.response?.data?.detail || 'Failed to load project');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartEdit = () => {
    setEditedReadme(project?.readme || '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditedReadme(project?.readme || '');
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!projectId || !project) return;

    setIsSaving(true);
    try {
      // Get the current markdown from the editor ref
      const currentMarkdown = editorRef.current?.getMarkdown() || editedReadme;
      
      await projectsApi.update(projectId, { readme: currentMarkdown });
      setProject({ ...project, readme: currentMarkdown });
      setIsEditing(false);
      toast.success('README saved successfully');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      toast.error(axiosError.response?.data?.detail || 'Failed to save README');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInitializeReadme = () => {
    setEditedReadme(DEFAULT_README);
    setIsEditing(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="glass-strong rounded-2xl p-12 text-center">
        <FolderKanban className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Project not found</h3>
        <Link
          to="/dashboard/projects"
          className="text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Link>
      </div>
    );
  }

  const hasReadme = project.readme && project.readme.trim().length > 0;

  // Permission checks based on user role
  const canEdit = project.user_role === 'owner' || project.user_role === 'maintainer';

  // Render README tab content
  const renderReadmeTab = () => (
    <div className="glass-strong rounded-2xl shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">Project README</h2>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleCancelEdit}
                className="px-3 py-1.5 text-gray-600 hover:text-gray-800 font-medium rounded-lg transition-all flex items-center gap-1.5"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg transition-all flex items-center gap-1.5"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </button>
            </>
          ) : canEdit ? (
            <button
              onClick={handleStartEdit}
              className="px-3 py-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 font-medium rounded-lg transition-all flex items-center gap-1.5"
            >
              <Edit3 className="w-4 h-4" />
              Edit
            </button>
          ) : null}
        </div>
      </div>

      <div className="p-6">
        {!hasReadme && !isEditing ? (
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No README yet</h3>
            <p className="text-gray-500 mb-6">
              {canEdit 
                ? 'Add project documentation to help annotators understand the guidelines'
                : 'Project documentation has not been added yet'
              }
            </p>
            {canEdit && (
              <button
                onClick={handleInitializeReadme}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all inline-flex items-center gap-2"
              >
                <Edit3 className="w-5 h-5" />
                Create README
              </button>
            )}
          </div>
        ) : (
          <ProjectReadmeEditor
            ref={editorRef}
            markdown={isEditing ? editedReadme : (project.readme || '')}
            onChange={setEditedReadme}
            isEditing={isEditing}
          />
        )}
      </div>
    </div>
  );

  // Render tab content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'readme':
        return renderReadmeTab();
      case 'tasks':
        return <ProjectTasksTab projectId={projectId!} projectName={project.name} userRole={project.user_role} />;
      case 'configuration':
        return <ProjectConfigurationTab project={project} onUpdate={loadProject} />;
      case 'history':
        return <ProjectHistoryTab projectId={projectId!} />;
      case 'explore':
        return <ProjectExploreTab projectId={projectId!} />;
      default:
        return renderReadmeTab();
    }
  };

  // Check if current tab needs full height (explore tab)
  const needsFullHeight = activeTab === 'explore';

  return (
    <div className={needsFullHeight ? "flex flex-col h-[calc(100vh-4rem)]" : "space-y-6"}>
      {/* Header */}
      <div className={needsFullHeight ? "flex-shrink-0" : ""}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard/projects"
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-emerald-600" />
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span className="text-gray-400 font-normal text-sm">#{project.id}</span>
                <span>{project.name}</span>
              </h1>
              {project.description && (
                <span className="text-gray-500 text-sm ml-2">{project.description}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${needsFullHeight ? "flex-shrink-0 mt-3" : ""}`}>
        <div className="glass rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-gray-900">{project.task_count}</div>
          <div className="text-sm text-gray-500">Tasks</div>
        </div>
        <div className="glass rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-gray-900">{project.member_count}</div>
          <div className="text-sm text-gray-500">Members</div>
        </div>
        <div className="glass rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-gray-900">{project.labels.length}</div>
          <div className="text-sm text-gray-500">Labels</div>
        </div>
        <div className="glass rounded-xl p-4 border border-gray-100">
          <div className="text-sm text-gray-500">Created</div>
          <div className="text-sm font-medium text-gray-700">
            {new Date(project.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className={needsFullHeight ? "flex-shrink-0 mt-3" : ""}>
        <ProjectTabs activeTab={activeTab} onTabChange={handleTabChange} />
      </div>

      {/* Tab Content */}
      <div className={needsFullHeight ? "flex-1 min-h-0 mt-3" : ""}>
        {renderTabContent()}
      </div>
    </div>
  );
}
