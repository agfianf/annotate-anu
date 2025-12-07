/**
 * Create Task Wizard
 * Multi-step wizard for creating tasks with images and job chunking
 */

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  File,
  FolderKanban,
  Image as ImageIcon,
  Loader2,
  Settings,
  Shuffle,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import type { JobPreview, MockImage, TaskCreateWithImages } from '../lib/api-client';
import { tasksApi } from '../lib/api-client';
import AssigneeDropdown from './AssigneeDropdown';

interface CreateTaskWizardProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onSuccess: () => void;
}

type WizardStep = 'basic' | 'images' | 'config' | 'review';

const STEPS: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
  { id: 'basic', label: 'Basic Info', icon: <FolderKanban className="w-4 h-4" /> },
  { id: 'images', label: 'Images', icon: <ImageIcon className="w-4 h-4" /> },
  { id: 'config', label: 'Configure', icon: <Settings className="w-4 h-4" /> },
  { id: 'review', label: 'Review', icon: <Check className="w-4 h-4" /> },
];

export default function CreateTaskWizard({ projectId, projectName, onClose, onSuccess }: CreateTaskWizardProps) {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<WizardStep>('basic');
  const [isCreating, setIsCreating] = useState(false);
  
  // Step 1: Basic Info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  
  // Step 2: Images (mocked for now)
  const [images, setImages] = useState<MockImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  // Step 3: Configuration
  const [chunkSize, setChunkSize] = useState(25);
  const [distributionOrder, setDistributionOrder] = useState<'sequential' | 'random'>('sequential');

  // Calculate job preview
  const jobPreview = useMemo<JobPreview[]>(() => {
    if (images.length === 0) return [];
    const totalImages = images.length;
    const jobCount = Math.ceil(totalImages / chunkSize);
    const jobs: JobPreview[] = [];
    for (let i = 0; i < jobCount; i++) {
      const startIdx = i * chunkSize;
      const endIdx = Math.min((i + 1) * chunkSize, totalImages);
      jobs.push({
        sequence_number: i,
        image_count: endIdx - startIdx,
      });
    }
    return jobs;
  }, [images.length, chunkSize]);

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 'basic':
        return name.trim().length > 0;
      case 'images':
        return images.length > 0;
      case 'config':
        return chunkSize >= 1 && chunkSize <= 500;
      case 'review':
        return true;
      default:
        return false;
    }
  }, [currentStep, name, images.length, chunkSize]);

  const goNext = () => {
    const currentIdx = currentStepIndex;
    if (currentIdx < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIdx + 1].id);
    }
  };

  const goBack = () => {
    const currentIdx = currentStepIndex;
    if (currentIdx > 0) {
      setCurrentStep(STEPS[currentIdx - 1].id);
    }
  };

  // Handle file selection (mock - just extract filenames)
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const newImages: MockImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Check if it's an image
      if (!file.type.startsWith('image/') && !['jpg', 'jpeg', 'png', 'webp'].some(ext => file.name.toLowerCase().endsWith(ext))) {
        continue;
      }
      newImages.push({
        filename: file.name,
        file_size_bytes: file.size,
      });
    }
    if (newImages.length > 0) {
      setImages(prev => [...prev, ...newImages]);
      toast.success(`Added ${newImages.length} image(s)`);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllImages = () => {
    setImages([]);
  };

  // Create task
  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const payload: TaskCreateWithImages = {
        name,
        description: description || undefined,
        assignee_id: assigneeId || undefined,
        chunk_size: chunkSize,
        distribution_order: distributionOrder,
        images,
      };
      
      const result = await tasksApi.createWithImages(projectId, payload);
      toast.success(`Task created with ${result.jobs.length} job(s)!`);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      toast.error(axiosError.response?.data?.detail || 'Failed to create task');
    } finally {
      setIsCreating(false);
    }
  };

  // Generate sample images for demo
  const generateSampleImages = () => {
    const samples: MockImage[] = [];
    for (let i = 1; i <= 100; i++) {
      samples.push({
        filename: `image_${String(i).padStart(4, '0')}.jpg`,
        width: 1920,
        height: 1080,
        file_size_bytes: Math.floor(Math.random() * 5000000) + 500000,
      });
    }
    setImages(samples);
    toast.success('Added 100 sample images');
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="glass-strong rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col overflow-hidden bg-white">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Create New Task</h2>
            <p className="text-sm text-gray-500">Project: {projectName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicators */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center">
            {STEPS.map((step, idx) => (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => idx <= currentStepIndex && setCurrentStep(step.id)}
                  disabled={idx > currentStepIndex}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                    step.id === currentStep
                      ? 'bg-emerald-100 text-emerald-700 font-medium'
                      : idx < currentStepIndex
                      ? 'text-emerald-600 hover:bg-emerald-50 cursor-pointer'
                      : 'text-gray-400'
                  }`}
                >
                  {step.icon}
                  <span className="text-sm">{step.label}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-gray-300 mx-1" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Basic Info */}
          {currentStep === 'basic' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Task Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Street Scene Annotation Batch 1"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description of this annotation task..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Default Assignee
                </label>
                <AssigneeDropdown
                  projectId={projectId}
                  value={assigneeId}
                  onChange={setAssigneeId}
                  placeholder="Select assignee for all jobs (optional)"
                />
                <p className="text-xs text-gray-500 mt-1">
                  All jobs created will be assigned to this person
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Images */}
          {currentStep === 'images' && (
            <div className="space-y-4">
              {/* Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-gray-300 hover:border-emerald-400 hover:bg-gray-50'
                }`}
              >
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 mb-2">
                  Drag & drop images here, or{' '}
                  <label className="text-emerald-600 hover:text-emerald-700 cursor-pointer font-medium">
                    browse
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleFileSelect(e.target.files)}
                      className="hidden"
                    />
                  </label>
                </p>
                <p className="text-sm text-gray-400">Supports JPG, PNG, WEBP</p>
              </div>

              {/* Demo Button */}
              <div className="flex justify-center">
                <button
                  onClick={generateSampleImages}
                  className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
                >
                  <File className="w-4 h-4" />
                  Generate 100 sample images (demo)
                </button>
              </div>

              {/* Image List */}
              {images.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {images.length} image(s) selected
                    </span>
                    <button
                      onClick={clearAllImages}
                      className="text-sm text-red-500 hover:text-red-600 font-medium flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear all
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto grid grid-cols-4 md:grid-cols-6 gap-2 p-3">
                    {images.slice(0, 50).map((img, idx) => (
                      <div
                        key={idx}
                        className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-emerald-300 transition-all"
                      >
                        <img
                          src="/sample.webp"
                          alt={img.filename}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                          <button
                            onClick={() => removeImage(idx)}
                            className="p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                          <p className="text-[9px] text-white truncate">{img.filename}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {images.length > 50 && (
                    <div className="px-4 py-2 text-sm text-gray-500 text-center border-t border-gray-100">
                      ... and {images.length - 50} more images
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Configuration */}
          {currentStep === 'config' && (
            <div className="space-y-6">
              {/* Chunk Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Images per Job
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(Math.max(1, Math.min(500, parseInt(e.target.value) || 25)))}
                    min={1}
                    max={500}
                    className="w-32 px-4 py-3 rounded-xl border border-gray-200 bg-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  />
                  <span className="text-sm text-gray-500">
                    (1-500 images per job)
                  </span>
                </div>
              </div>

              {/* Distribution Order */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image Distribution
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDistributionOrder('sequential')}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      distributionOrder === 'sequential'
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-emerald-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ArrowRight className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium text-gray-900">Sequential</span>
                    </div>
                    <p className="text-sm text-gray-500">
                      Images 1-{chunkSize} → Job 1, {chunkSize + 1}-{chunkSize * 2} → Job 2, etc.
                    </p>
                  </button>
                  <button
                    onClick={() => setDistributionOrder('random')}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      distributionOrder === 'random'
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-emerald-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Shuffle className="w-4 h-4 text-blue-600" />
                      <span className="font-medium text-gray-900">Random</span>
                    </div>
                    <p className="text-sm text-gray-500">
                      Shuffle images before distributing to jobs
                    </p>
                  </button>
                </div>
              </div>

              {/* Job Preview */}
              {jobPreview.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Job Preview</h4>
                  <div className="flex flex-wrap gap-2">
                    {jobPreview.map((job) => (
                      <div
                        key={job.sequence_number}
                        className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm"
                      >
                        <span className="text-gray-500">Job {job.sequence_number + 1}:</span>{' '}
                        <span className="font-medium text-gray-700">{job.image_count} images</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-emerald-600 font-medium mt-3">
                    {jobPreview.length} job(s) will be created
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === 'review' && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Task Name</span>
                  <span className="font-medium text-gray-900">{name}</span>
                </div>
                {description && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Description</span>
                    <span className="text-gray-700 text-right max-w-xs truncate">{description}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Images</span>
                  <span className="font-medium text-gray-900">{images.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Chunk Size</span>
                  <span className="font-medium text-gray-900">{chunkSize} images/job</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Distribution</span>
                  <span className="font-medium text-gray-900 capitalize">{distributionOrder}</span>
                </div>
                <div className="border-t border-gray-200 pt-3 flex justify-between">
                  <span className="text-gray-600 font-medium">Jobs to Create</span>
                  <span className="font-bold text-emerald-600">{jobPreview.length}</span>
                </div>
              </div>
              
              <p className="text-sm text-gray-500 text-center">
                Ready to create? Click <strong>Create Task</strong> to proceed.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={currentStepIndex === 0 ? onClose : goBack}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium rounded-xl transition-all flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {currentStepIndex === 0 ? 'Cancel' : 'Back'}
          </button>
          
          {currentStep === 'review' ? (
            <button
              onClick={handleCreate}
              disabled={isCreating || !canProceed()}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/25"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Create Task
            </button>
          ) : (
            <button
              onClick={goNext}
              disabled={!canProceed()}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-medium rounded-xl transition-all flex items-center gap-2"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
