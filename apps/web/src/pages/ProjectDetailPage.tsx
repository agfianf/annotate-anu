/**
 * Project Detail Page
 * Shows project overview with README editor and navigation to tasks
 */

import {
    ArrowLeft,
    BookOpen,
    Edit3,
    FolderKanban,
    ListTodo,
    Loader2,
    Save,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useParams } from 'react-router-dom';
import ProjectReadmeEditor, { type ProjectReadmeEditorHandle } from '../components/ProjectReadmeEditor';
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
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedReadme, setEditedReadme] = useState('');
  const editorRef = useRef<ProjectReadmeEditorHandle>(null);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard/projects"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FolderKanban className="w-7 h-7 text-emerald-600" />
              {project.name}
            </h1>
            {project.description && (
              <p className="text-gray-500 mt-1">{project.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Navigation to Tasks */}
          <Link
            to={`/dashboard/projects/${projectId}/tasks`}
            className="px-4 py-2 bg-white border border-gray-200 hover:border-emerald-300 text-gray-700 hover:text-emerald-700 font-medium rounded-xl transition-all flex items-center gap-2 shadow-sm"
          >
            <ListTodo className="w-5 h-5" />
            View Tasks
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

      {/* README Section */}
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
            ) : (
              <button
                onClick={handleStartEdit}
                className="px-3 py-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 font-medium rounded-lg transition-all flex items-center gap-1.5"
              >
                <Edit3 className="w-4 h-4" />
                Edit
              </button>
            )}
          </div>
        </div>

        <div className="p-6">
          {!hasReadme && !isEditing ? (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No README yet</h3>
              <p className="text-gray-500 mb-6">
                Add project documentation to help annotators understand the guidelines
              </p>
              <button
                onClick={handleInitializeReadme}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all inline-flex items-center gap-2"
              >
                <Edit3 className="w-5 h-5" />
                Create README
              </button>
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

      {/* Labels Section */}
      {project.labels.length > 0 && (
        <div className="glass-strong rounded-2xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <h2 className="text-lg font-semibold text-gray-900">Project Labels</h2>
          </div>
          <div className="p-6">
            <div className="flex flex-wrap gap-3">
              {project.labels.map((label) => (
                <div
                  key={label.id}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2"
                  style={{
                    backgroundColor: `${label.color}20`,
                    color: label.color,
                    border: `1px solid ${label.color}40`,
                  }}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  {label.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
