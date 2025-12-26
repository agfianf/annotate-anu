/**
 * ProjectConfigurationTab Component
 * Shows project configuration including labels and settings with proper color picker
 */

import { Crown, Edit2, Eye, Loader2, Palette, Plus, Save, Settings, Shield, Trash2, UserPlus, Users, Wrench, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import type { Label, ProjectDetail, ProjectMember } from '../lib/api-client';
import { labelsApi, membersApi, projectsApi } from '../lib/api-client';
import { DEFAULT_LABEL_COLOR, PRESET_COLORS } from '../lib/colors';
import GlassDropdown from './ui/GlassDropdown';

interface ProjectConfigurationTabProps {
  project: ProjectDetail;
  onUpdate?: () => void;
}

export default function ProjectConfigurationTab({ project, onUpdate }: ProjectConfigurationTabProps) {
  // Permission checks based on user role
  const canEdit = project.user_role === 'owner' || project.user_role === 'maintainer';

  const [isAddingLabel, setIsAddingLabel] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(DEFAULT_LABEL_COLOR);
  const [editLabelName, setEditLabelName] = useState('');
  const [editLabelColor, setEditLabelColor] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showEditColorPicker, setShowEditColorPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const editColorButtonRef = useRef<HTMLButtonElement>(null);

  // Description state
  const [description, setDescription] = useState(project.description || '');
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  // Annotation types state
  const [annotationTypes, setAnnotationTypes] = useState<string[]>(project.annotation_types || ['classification', 'detection', 'segmentation']);
  const [isSavingAnnotationTypes, setIsSavingAnnotationTypes] = useState(false);

  const handleToggleAnnotationType = (type: string) => {
    setAnnotationTypes((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type]
    );
  };

  const handleSaveAnnotationTypes = async () => {
    if (annotationTypes.length === 0) {
      toast.error('At least one annotation type must be enabled');
      return;
    }

    setIsSavingAnnotationTypes(true);
    try {
      await projectsApi.update(String(project.id), {
        annotation_types: annotationTypes,
      });
      toast.success('Annotation types updated');
      onUpdate?.();
    } catch (err) {
      console.error('Failed to update annotation types:', err);
      toast.error('Failed to update annotation types');
    } finally {
      setIsSavingAnnotationTypes(false);
    }
  };

  const handleUpdateDescription = async () => {
    setIsSavingDescription(true);
    try {
      await projectsApi.update(String(project.id), {
        description: description.trim(),
      });
      toast.success('Project description updated');
      onUpdate?.();
    } catch (err) {
      console.error('Failed to update description:', err);
      toast.error('Failed to update description');
    } finally {
      setIsSavingDescription(false);
    }
  };

  const handleAddLabel = async () => {
    if (!newLabelName.trim()) {
      toast.error('Label name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await labelsApi.create(project.id, {
        name: newLabelName.trim(),
        color: newLabelColor,
      });
      toast.success(`Label "${newLabelName}" created`);
      setNewLabelName('');
      setNewLabelColor(DEFAULT_LABEL_COLOR);
      setIsAddingLabel(false);
      onUpdate?.();
    } catch (err) {
      console.error('Failed to create label:', err);
      toast.error('Failed to create label');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (label: Label) => {
    setEditingLabelId(label.id);
    setEditLabelName(label.name);
    setEditLabelColor(label.color);
  };

  const handleSaveEdit = async (labelId: string) => {
    if (!editLabelName.trim()) {
      toast.error('Label name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await labelsApi.update(project.id, labelId, {
        name: editLabelName.trim(),
        color: editLabelColor,
      });
      toast.success('Label updated');
      setEditingLabelId(null);
      onUpdate?.();
    } catch (err) {
      console.error('Failed to update label:', err);
      toast.error('Failed to update label');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLabel = async (label: Label) => {
    if (!confirm(`Are you sure you want to delete label "${label.name}"?`)) {
      return;
    }

    try {
      await labelsApi.delete(project.id, label.id);
      toast.success(`Label "${label.name}" deleted`);
      onUpdate?.();
    } catch (err) {
      console.error('Failed to delete label:', err);
      toast.error('Failed to delete label');
    }
  };

  // Inline color picker component using portal to escape overflow:hidden containers
  const ColorPicker = ({
    selectedColor,
    onColorChange,
    isOpen,
    onClose,
    anchorRef,
  }: {
    selectedColor: string;
    onColorChange: (color: string) => void;
    isOpen: boolean;
    onClose: () => void;
    anchorRef: React.RefObject<HTMLButtonElement | null>;
  }) => {
    const [position, setPosition] = useState({ top: 0, left: 0 });

    // Update position when anchor changes
    useEffect(() => {
      if (isOpen && anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        setPosition({
          top: rect.bottom + 8,
          left: rect.left,
        });
      }
    }, [isOpen, anchorRef]);

    // Close on click outside
    useEffect(() => {
      if (!isOpen) return;

      const handleClickOutside = (e: MouseEvent) => {
        if (!anchorRef.current?.contains(e.target as Node)) {
          // Check if click is inside the portal picker
          const picker = document.getElementById('color-picker-portal');
          if (picker && !picker.contains(e.target as Node)) {
            onClose();
          }
        }
      };

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }, [isOpen, onClose, anchorRef]);

    if (!isOpen) return null;

    return createPortal(
      <div
        id="color-picker-portal"
        className="fixed z-[9999] glass-strong rounded-lg shadow-2xl p-3 border border-gray-200"
        style={{ width: '220px', top: position.top, left: position.left }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-gray-700">Pick Color</h4>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Preset Colors Grid */}
        <div className="grid grid-cols-5 gap-1.5 mb-2">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                onColorChange(color);
                onClose();
              }}
              className={`w-8 h-8 rounded transition-all ${
                selectedColor === color
                  ? 'ring-2 ring-emerald-500 ring-offset-1 scale-110'
                  : 'hover:scale-105'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>

        {/* Custom Color Section */}
        <div className="pt-2 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <div className="relative w-7 h-7 flex-shrink-0 aspect-square rounded border border-gray-300 overflow-hidden">
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => onColorChange(e.target.value)}
                className="absolute inset-0 w-[200%] h-[200%] -top-2 -left-2 cursor-pointer border-none"
              />
            </div>
            <input
              type="text"
              value={selectedColor}
              onChange={(e) => {
                const value = e.target.value;
                if (value.match(/^#[0-9A-Fa-f]{0,6}$/)) {
                  onColorChange(value);
                }
              }}
              placeholder="#268BEB"
              className="flex-1 h-7 px-2 text-xs font-mono border border-gray-300 rounded focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Current Color Display */}
        <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between">
          <span className="text-xs text-gray-500">Current:</span>
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded border border-gray-300"
              style={{ backgroundColor: selectedColor }}
            />
            <span className="text-xs font-mono text-gray-900">{selectedColor}</span>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div className="space-y-6">
      {/* Labels Section */}
      <div className="glass-strong rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">Labels</h2>
            <span className="text-sm text-gray-400">({project.labels.length})</span>
          </div>
          {canEdit && (
            <button
              onClick={() => setIsAddingLabel(true)}
              className="px-3 py-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 font-medium rounded-lg transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add Label
            </button>
          )}
        </div>

        <div className="p-6">
          {/* Add Label Form */}
          {isAddingLabel && (
            <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <h3 className="font-medium text-gray-800 mb-3">Create New Label</h3>
              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  placeholder="Label name"
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddLabel()}
                />
                
                {/* Color Picker Button */}
                <div className="relative">
                  <button
                    ref={colorButtonRef}
                    type="button"
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:border-emerald-300 transition-all"
                  >
                    <div
                      className="w-6 h-6 rounded border border-gray-300"
                      style={{ backgroundColor: newLabelColor }}
                    />
                    <span className="text-xs font-mono text-gray-600">{newLabelColor}</span>
                  </button>
                  <ColorPicker
                    selectedColor={newLabelColor}
                    onColorChange={setNewLabelColor}
                    isOpen={showColorPicker}
                    onClose={() => setShowColorPicker(false)}
                    anchorRef={colorButtonRef}
                  />
                </div>

                <button
                  onClick={handleAddLabel}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg transition-all"
                >
                  {isSubmitting ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => {
                    setIsAddingLabel(false);
                    setShowColorPicker(false);
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium rounded-lg transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Labels List */}
          {project.labels.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Palette className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p>No labels defined yet</p>
              <p className="text-sm">Add labels to categorize your annotations</p>
            </div>
          ) : (
            <div className="space-y-2">
              {project.labels.map((label) => (
                <div
                  key={label.id}
                  className="p-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-all"
                >
                  {editingLabelId === label.id ? (
                    // Edit Mode
                    <div className="flex gap-3 items-center">
                      <input
                        type="text"
                        value={editLabelName}
                        onChange={(e) => setEditLabelName(e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(label.id)}
                      />
                      
                      {/* Edit Color Picker Button */}
                      <div className="relative">
                        <button
                          ref={editColorButtonRef}
                          type="button"
                          onClick={() => setShowEditColorPicker(!showEditColorPicker)}
                          className="flex items-center gap-2 px-2 py-1.5 border border-gray-200 rounded-lg hover:border-emerald-300 transition-all"
                        >
                          <div
                            className="w-5 h-5 rounded border border-gray-300"
                            style={{ backgroundColor: editLabelColor }}
                          />
                        </button>
                        <ColorPicker
                          selectedColor={editLabelColor}
                          onColorChange={setEditLabelColor}
                          isOpen={showEditColorPicker}
                          onClose={() => setShowEditColorPicker(false)}
                          anchorRef={editColorButtonRef}
                        />
                      </div>

                      <button
                        onClick={() => handleSaveEdit(label.id)}
                        disabled={isSubmitting}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-all"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingLabelId(null);
                          setShowEditColorPicker(false);
                        }}
                        className="px-3 py-1.5 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-lg transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    // Display Mode
                    <div className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-6 h-6 rounded border border-gray-300"
                          style={{ backgroundColor: label.color }}
                        />
                        <span className="font-medium text-gray-800">{label.name}</span>
                        <span className="text-xs font-mono text-gray-400">{label.color}</span>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleStartEdit(label)}
                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                            title="Edit label"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteLabel(label)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                            title="Delete label"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Members Section */}
      <ProjectMembersSection projectId={Number(project.id)} canEdit={canEdit} />

      {/* Project Settings Section */}
      <div className="glass-strong rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">Project Settings</h2>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Project Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project Description
            </label>
            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEdit}
                placeholder="Enter project description..."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:text-gray-500 transition-all resize-none"
              />
              {canEdit && description !== (project.description || '') && (
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={handleUpdateDescription}
                    disabled={isSavingDescription}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5"
                  >
                    {isSavingDescription ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save Description
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="h-px bg-gray-100" />
          {/* Annotation Types */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enabled Annotation Types
            </label>
            <div className="flex flex-wrap gap-2">
              {['classification', 'detection', 'segmentation'].map((type) => (
                <label
                  key={type}
                  className={`flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg transition-all ${
                    canEdit ? 'cursor-pointer hover:bg-gray-100' : 'cursor-not-allowed opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={annotationTypes.includes(type)}
                    onChange={() => handleToggleAnnotationType(type)}
                    disabled={!canEdit}
                    className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 disabled:opacity-50"
                  />
                  <span className="text-sm text-gray-700 capitalize">{type}</span>
                </label>
              ))}
            </div>
            {canEdit && JSON.stringify(annotationTypes.sort()) !== JSON.stringify((project.annotation_types || []).sort()) && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={handleSaveAnnotationTypes}
                  disabled={isSavingAnnotationTypes}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5"
                >
                  {isSavingAnnotationTypes ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save Annotation Types
                </button>
              </div>
            )}
          </div>

          {/* Model Prediction Settings (Placeholder) */}
          <div className="pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Model Prediction
            </label>
            <div className={`flex items-center gap-3 p-3 bg-gray-50 rounded-lg ${!canEdit && 'opacity-60'}`}>
              <input
                type="checkbox"
                defaultChecked={false}
                disabled={!canEdit}
                className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 disabled:opacity-50"
              />
              <div>
                <span className="text-sm text-gray-700">Enable auto-prediction on upload</span>
                <p className="text-xs text-gray-400">Automatically run model predictions when images are uploaded</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Project Members Section Component
 * Handles member listing, adding, and removing
 */

function ProjectMembersSection({ projectId, canEdit }: { projectId: number; canEdit: boolean }) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<{ id: string; email: string; username: string; full_name: string | null }[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('annotator');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadMembers();
  }, [projectId]);

  const loadMembers = async () => {
    try {
      const data = await membersApi.list(String(projectId));
      setMembers(data);
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAvailableUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const users = await membersApi.listAvailable(String(projectId));
      setAvailableUsers(users);
    } catch (err) {
      console.error('Failed to load available users:', err);
      toast.error('Failed to load users');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleOpenAddForm = () => {
    setShowAddForm(true);
    setSelectedUserId('');
    setNewMemberRole('annotator');
    loadAvailableUsers();
  };

  const handleAddMember = async () => {
    if (!selectedUserId) {
      toast.error('Please select a user');
      return;
    }

    setIsAdding(true);
    try {
      await membersApi.add(String(projectId), {
        user_id: selectedUserId,
        role: newMemberRole,
      });
      toast.success('Member added successfully');
      setShowAddForm(false);
      setSelectedUserId('');
      loadMembers();
    } catch (err) {
      console.error('Failed to add member:', err);
      toast.error('Failed to add member');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from the project?`)) return;
    
    try {
      await membersApi.remove(String(projectId), memberId);
      toast.success('Member removed');
      loadMembers();
    } catch (err) {
      console.error('Failed to remove member:', err);
      toast.error('Failed to remove member');
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="w-4 h-4 text-amber-500" />;
      case 'maintainer': return <Wrench className="w-4 h-4 text-purple-500" />;
      case 'annotator': return <Shield className="w-4 h-4 text-blue-500" />;
      case 'viewer': return <Eye className="w-4 h-4 text-gray-400" />;
      default: return null;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-amber-100 text-amber-700';
      case 'maintainer': return 'bg-purple-100 text-purple-700';
      case 'annotator': return 'bg-blue-100 text-blue-700';
      case 'viewer': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getMemberName = (member: ProjectMember) => {
    if (member.user) {
      return member.user.full_name || member.user.username || member.user.email;
    }
    return `User ${member.user_id.slice(0, 8)}`;
  };

  const getMemberInitials = (member: ProjectMember) => {
    const name = getMemberName(member);
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="glass-strong rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
          </div>
        </div>
        <div className="p-6 flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-strong rounded-2xl shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
          <span className="text-sm text-gray-400">({members.length})</span>
        </div>
        {canEdit && (
          <button
            onClick={handleOpenAddForm}
            className="px-3 py-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 font-medium rounded-lg transition-all flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            Add Member
          </button>
        )}
      </div>

      <div className="p-6">
        {/* Add Member Form */}
        {showAddForm && (
          <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <h3 className="font-medium text-gray-800 mb-3">Add Team Member</h3>
            <div className="flex gap-3 items-center flex-wrap">
              {/* User Selection Dropdown */}
              <div className="flex-1 min-w-[250px]">
                <GlassDropdown
                  options={availableUsers.map((user) => ({
                    value: user.id,
                    label: user.full_name || user.username,
                    sublabel: user.email,
                  }))}
                  value={selectedUserId}
                  onChange={setSelectedUserId}
                  placeholder="Select a user..."
                  isLoading={isLoadingUsers}
                  emptyMessage="No available users to add"
                />
              </div>

              {/* Role Selection */}
              <div className="w-[140px]">
                <GlassDropdown
                  options={[
                    { value: 'viewer', label: 'Viewer' },
                    { value: 'annotator', label: 'Annotator' },
                    { value: 'maintainer', label: 'Maintainer' },
                  ]}
                  value={newMemberRole}
                  onChange={setNewMemberRole}
                  placeholder="Select role"
                />
              </div>

              <button
                onClick={handleAddMember}
                disabled={isAdding || !selectedUserId}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg transition-all flex items-center gap-2"
              >
                {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
                Add
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium rounded-lg transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Members List */}
        {members.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p>No team members yet</p>
            <p className="text-sm">Add members to collaborate on this project</p>
          </div>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="p-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-medium">
                      {getMemberInitials(member)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{getMemberName(member)}</p>
                      {member.user?.email && (
                        <p className="text-xs text-gray-500">{member.user.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {getRoleIcon(member.role)}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getRoleBadge(member.role)}`}>
                        {member.role}
                      </span>
                    </div>
                    {canEdit && member.role !== 'owner' && (
                      <button
                        onClick={() => handleRemoveMember(member.id, getMemberName(member))}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100"
                        title="Remove member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
