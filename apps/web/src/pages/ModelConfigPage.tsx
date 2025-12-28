/**
 * Model Configuration Page for managing BYOM models
 */

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Plus, Trash2, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useModelRegistry } from '../hooks/useModelRegistry'
import { byomClient } from '../lib/byom-client'
import type { ModelRegistrationRequest, ModelCapabilities, ResponseMapping, OutputType } from '../types/byom'
import { InfoTooltip } from '../components/ui/InfoTooltip'
import { TagInput } from '../components/ui/TagInput'

export default function ModelConfigPage() {
  const navigate = useNavigate()
  const { registeredModels, refreshModels, loading } = useModelRegistry()
  const [showForm, setShowForm] = useState(false)
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [formData, setFormData] = useState<ModelRegistrationRequest>({
    name: '',
    endpoint_url: '',
    auth_token: '',
    description: '',
    capabilities: {
      supports_text_prompt: false,
      supports_bbox_prompt: false,
      supports_auto_detect: false,
      supports_class_filter: false,
      output_types: ['bbox'],
      classes: undefined,
    },
    endpoint_config: {
      inference_path: '/inference',
      response_mapping: {
        boxes_field: 'boxes',
        scores_field: 'scores',
        masks_field: 'masks',
        labels_field: 'labels',
        num_objects_field: undefined,
      },
    },
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      // Clean up payload before sending
      const payload: ModelRegistrationRequest = {
        name: formData.name,
        endpoint_url: formData.endpoint_url,
        auth_token: formData.auth_token || undefined,
        description: formData.description || undefined,
        capabilities: formData.capabilities,
        endpoint_config: formData.endpoint_config,
      }

      await byomClient.registerModel(payload)
      toast.success(`Model "${formData.name}" registered successfully!`)

      // Reset form to initial state
      setShowForm(false)
      setFormData({
        name: '',
        endpoint_url: '',
        auth_token: '',
        description: '',
        capabilities: {
          supports_text_prompt: false,
          supports_bbox_prompt: false,
          supports_auto_detect: false,
          supports_class_filter: false,
          output_types: ['bbox'],
          classes: undefined,
        },
        endpoint_config: {
          inference_path: '/inference',
          response_mapping: {
            boxes_field: 'boxes',
            scores_field: 'scores',
            masks_field: 'masks',
            labels_field: 'labels',
            num_objects_field: undefined,
          },
        },
      })

      await refreshModels()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to register model'
      toast.error(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
      return
    }

    try {
      await byomClient.deleteModel(id)
      toast.success(`Model "${name}" deleted`)
      await refreshModels()
    } catch (error) {
      toast.error('Failed to delete model')
    }
  }

  const handleHealthCheck = async (id: string, name: string) => {
    try {
      const result = await byomClient.checkHealth(id)
      if (result.is_healthy) {
        toast.success(`${name} is healthy (${result.response_time_ms?.toFixed(0)}ms)`)
      } else {
        toast.error(`${name} is unhealthy: ${result.status_message}`)
      }
      await refreshModels()
    } catch (error) {
      toast.error('Health check failed')
    }
  }

  // Handler for capability checkboxes
  const handleCapabilityToggle = (field: keyof Omit<ModelCapabilities, 'output_types' | 'classes'>) => {
    setFormData(prev => ({
      ...prev,
      capabilities: {
        ...prev.capabilities!,
        [field]: !prev.capabilities?.[field],
      },
    }))
  }

  // Handler for output types (multi-select or checkboxes)
  const handleOutputTypeToggle = (type: OutputType) => {
    setFormData(prev => {
      const currentTypes = prev.capabilities?.output_types || []
      const newTypes = currentTypes.includes(type)
        ? currentTypes.filter(t => t !== type)
        : [...currentTypes, type]
      return {
        ...prev,
        capabilities: {
          ...prev.capabilities!,
          output_types: newTypes,
        },
      }
    })
  }

  // Handler for classes input (tag array)
  const handleClassesChange = (classes: string[]) => {
    setFormData(prev => ({
      ...prev,
      capabilities: {
        ...prev.capabilities!,
        classes: classes.length > 0 ? classes : undefined,
      },
    }))
  }

  // Handler for inference path
  const handleInferencePathChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      endpoint_config: {
        ...prev.endpoint_config!,
        inference_path: value,
      },
    }))
  }

  // Handler for response mapping fields
  const handleResponseMappingChange = (field: keyof ResponseMapping, value: string) => {
    setFormData(prev => ({
      ...prev,
      endpoint_config: {
        ...prev.endpoint_config!,
        response_mapping: {
          ...prev.endpoint_config?.response_mapping,
          [field]: value || undefined,
        } as ResponseMapping,
      },
    }))
  }

  // Complete presets for all form fields (capabilities + endpoint + response mapping)
  const applyCompletePreset = (preset: 'yolov8' | 'yolov11' | 'sam3' | 'ultralytics' | 'custom') => {
    const presets = {
      yolov8: {
        capabilities: {
          supports_text_prompt: false,
          supports_bbox_prompt: false,
          supports_auto_detect: true,
          supports_class_filter: true,
          output_types: ['bbox'] as OutputType[],
          classes: undefined,
        },
        endpoint_config: {
          inference_path: '/predict',
          response_mapping: {
            boxes_field: 'predictions.boxes',
            scores_field: 'predictions.confidence',
            masks_field: undefined,
            labels_field: 'predictions.class_names',
            num_objects_field: undefined,
          },
        },
      },
      yolov11: {
        capabilities: {
          supports_text_prompt: false,
          supports_bbox_prompt: false,
          supports_auto_detect: true,
          supports_class_filter: true,
          output_types: ['bbox', 'polygon'] as OutputType[],
          classes: undefined,
        },
        endpoint_config: {
          inference_path: '/v1/detect',
          response_mapping: {
            boxes_field: 'detections.boxes',
            scores_field: 'detections.scores',
            masks_field: 'detections.masks',
            labels_field: 'detections.labels',
            num_objects_field: undefined,
          },
        },
      },
      sam3: {
        capabilities: {
          supports_text_prompt: true,
          supports_bbox_prompt: true,
          supports_auto_detect: false,
          supports_class_filter: false,
          output_types: ['polygon', 'mask'] as OutputType[],
          classes: undefined,
        },
        endpoint_config: {
          inference_path: '/inference',
          response_mapping: {
            boxes_field: 'boxes',
            scores_field: 'scores',
            masks_field: 'masks',
            labels_field: 'labels',
            num_objects_field: undefined,
          },
        },
      },
      ultralytics: {
        capabilities: {
          supports_text_prompt: false,
          supports_bbox_prompt: false,
          supports_auto_detect: true,
          supports_class_filter: true,
          output_types: ['bbox', 'polygon', 'mask'] as OutputType[],
          classes: undefined,
        },
        endpoint_config: {
          inference_path: '/inference',
          response_mapping: {
            boxes_field: 'results.boxes.xyxy',
            scores_field: 'results.boxes.conf',
            masks_field: 'results.masks.data',
            labels_field: 'results.names',
            num_objects_field: undefined,
          },
        },
      },
      custom: {
        capabilities: {
          supports_text_prompt: false,
          supports_bbox_prompt: false,
          supports_auto_detect: true,
          supports_class_filter: true,
          output_types: ['bbox', 'polygon'] as OutputType[],
          classes: undefined,
        },
        endpoint_config: {
          inference_path: '/detect',
          response_mapping: {
            boxes_field: 'detections.bboxes',
            scores_field: 'detections.scores',
            masks_field: 'detections.masks',
            labels_field: 'detections.classes',
            num_objects_field: 'detections.count',
          },
        },
      },
    }

    const selectedPreset = presets[preset]
    setFormData(prev => ({
      ...prev,
      capabilities: selectedPreset.capabilities,
      endpoint_config: selectedPreset.endpoint_config,
    }))

    setActivePreset(preset)
    toast.success(`✅ ${preset.toUpperCase()} preset applied - all fields configured!`, {
      duration: 3000,
      style: {
        background: '#10b981',
        color: 'white',
        fontWeight: 'bold',
      },
    })
  }

  // Reset all fields to defaults
  const resetAllFields = () => {
    setFormData({
      name: formData.name, // Keep name and URL
      endpoint_url: formData.endpoint_url,
      auth_token: formData.auth_token,
      description: formData.description,
      capabilities: {
        supports_text_prompt: false,
        supports_bbox_prompt: false,
        supports_auto_detect: false,
        supports_class_filter: false,
        output_types: ['bbox'],
        classes: undefined,
      },
      endpoint_config: {
        inference_path: '/inference',
        response_mapping: {
          boxes_field: 'boxes',
          scores_field: 'scores',
          masks_field: 'masks',
          labels_field: 'labels',
          num_objects_field: undefined,
        },
      },
    })
    setActivePreset(null)
    toast.success('🔄 All fields reset to defaults', {
      duration: 2500,
      style: {
        background: '#6b7280',
        color: 'white',
        fontWeight: 'bold',
      },
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/annotation')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Model Configuration</h1>
              <p className="text-gray-600 mt-1">Manage your BYOM (Bring Your Own Model) registry</p>
            </div>
          </div>

          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700
                       text-white rounded-lg transition-colors font-medium shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Register Model
          </button>
        </div>

        {/* Registration Form */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Register New Model</h2>

            {/* PRESET SELECTOR - TOP OF FORM */}
            <div className="mb-6 p-4 bg-gradient-to-r from-emerald-50 to-blue-50 border-2 border-emerald-200 rounded-xl shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1">🚀 Quick Start - Model Presets</h3>
                  <p className="text-xs text-gray-600">
                    Select your model type to auto-configure all settings (capabilities, endpoints, response mapping)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetAllFields}
                  className="text-xs px-3 py-1.5 bg-white border border-gray-300 text-gray-700
                             hover:bg-gray-50 rounded-lg transition-colors font-medium"
                >
                  Reset All
                </button>
              </div>

              <div className="grid grid-cols-5 gap-3">
                <button
                  type="button"
                  onClick={() => applyCompletePreset('yolov8')}
                  className={`p-3 bg-white border-2 rounded-lg hover:shadow-md transition-all group relative
                    ${activePreset === 'yolov8'
                      ? 'border-emerald-600 bg-emerald-50 shadow-lg ring-2 ring-emerald-400'
                      : 'border-emerald-300 hover:border-emerald-500'}`}
                >
                  {activePreset === 'yolov8' && (
                    <div className="absolute -top-2 -right-2 bg-emerald-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                      ✓
                    </div>
                  )}
                  <div className="text-center">
                    <div className="text-2xl mb-1">🎯</div>
                    <div className="text-xs font-bold text-gray-900">YOLOv8</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">Detection</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => applyCompletePreset('yolov11')}
                  className={`p-3 bg-white border-2 rounded-lg hover:shadow-md transition-all group relative
                    ${activePreset === 'yolov11'
                      ? 'border-emerald-600 bg-emerald-50 shadow-lg ring-2 ring-emerald-400'
                      : 'border-emerald-300 hover:border-emerald-500'}`}
                >
                  {activePreset === 'yolov11' && (
                    <div className="absolute -top-2 -right-2 bg-emerald-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                      ✓
                    </div>
                  )}
                  <div className="text-center">
                    <div className="text-2xl mb-1">⚡</div>
                    <div className="text-xs font-bold text-gray-900">YOLOv11</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">Detection + Seg</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => applyCompletePreset('sam3')}
                  className={`p-3 bg-white border-2 rounded-lg hover:shadow-md transition-all group relative
                    ${activePreset === 'sam3'
                      ? 'border-blue-600 bg-blue-50 shadow-lg ring-2 ring-blue-400'
                      : 'border-blue-300 hover:border-blue-500'}`}
                >
                  {activePreset === 'sam3' && (
                    <div className="absolute -top-2 -right-2 bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                      ✓
                    </div>
                  )}
                  <div className="text-center">
                    <div className="text-2xl mb-1">✂️</div>
                    <div className="text-xs font-bold text-gray-900">SAM3</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">Segmentation</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => applyCompletePreset('ultralytics')}
                  className={`p-3 bg-white border-2 rounded-lg hover:shadow-md transition-all group relative
                    ${activePreset === 'ultralytics'
                      ? 'border-purple-600 bg-purple-50 shadow-lg ring-2 ring-purple-400'
                      : 'border-purple-300 hover:border-purple-500'}`}
                >
                  {activePreset === 'ultralytics' && (
                    <div className="absolute -top-2 -right-2 bg-purple-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                      ✓
                    </div>
                  )}
                  <div className="text-center">
                    <div className="text-2xl mb-1">🔮</div>
                    <div className="text-xs font-bold text-gray-900">Ultralytics</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">Full Suite</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => applyCompletePreset('custom')}
                  className={`p-3 bg-white border-2 rounded-lg hover:shadow-md transition-all group relative
                    ${activePreset === 'custom'
                      ? 'border-gray-600 bg-gray-50 shadow-lg ring-2 ring-gray-400'
                      : 'border-gray-300 hover:border-gray-500'}`}
                >
                  {activePreset === 'custom' && (
                    <div className="absolute -top-2 -right-2 bg-gray-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                      ✓
                    </div>
                  )}
                  <div className="text-center">
                    <div className="text-2xl mb-1">⚙️</div>
                    <div className="text-xs font-bold text-gray-900">Custom</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">Generic API</div>
                  </div>
                </button>
              </div>

              <div className="mt-3 p-2 bg-white/70 rounded-lg">
                <p className="text-xs text-gray-700">
                  <span className="font-semibold">What gets configured:</span> Capabilities (text/bbox prompts, auto-detect),
                  Endpoint path, Response field mappings. You can customize any field after selecting a preset.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* SECTION 1: Basic Information */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Basic Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      Model Name *
                      <InfoTooltip content="Unique display name for the model (max 100 characters)" />
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg
                                 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="e.g., YOLOv8 Traffic Detection"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      Endpoint URL *
                      <InfoTooltip
                        content="Base URL of the external model API. The inference path will be appended to this URL to form the complete inference endpoint."
                        example="https://api.example.com"
                        note="Make sure the URL is accessible and doesn't include the path (e.g., /inference)"
                      />
                    </label>
                    <input
                      type="url"
                      required
                      value={formData.endpoint_url}
                      onChange={(e) => setFormData({ ...formData, endpoint_url: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg
                                 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="https://your-model-api.com"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      Bearer Token (Optional)
                      <InfoTooltip
                        content="Bearer token for authentication. Will be sent in the Authorization header when making requests to your model API."
                        example="Authorization: Bearer your_token_here"
                        note="Leave empty if your API doesn't require authentication"
                      />
                    </label>
                    <input
                      type="password"
                      value={formData.auth_token}
                      onChange={(e) => setFormData({ ...formData, auth_token: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg
                                 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="Bearer token for authentication"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      Description (Optional)
                      <InfoTooltip content="Optional description of the model (max 500 characters). Helpful for identifying the model's purpose or training details." />
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg
                                 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="Describe your model..."
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: Model Capabilities */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Model Capabilities</h3>
                  <InfoTooltip content="Define what your model can do. These capabilities determine which inference modes are available in the annotation interface." />
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Supported Features
                    </label>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.capabilities?.supports_text_prompt || false}
                          onChange={() => handleCapabilityToggle('supports_text_prompt')}
                          className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900">Text Prompt Support</span>
                          <p className="text-xs text-gray-600 mt-0.5">Model accepts text descriptions (e.g., &quot;cat&quot;, &quot;person&quot;)</p>
                        </div>
                        <InfoTooltip
                          content="Whether your model supports text prompt segmentation. Enable if your model can segment objects based on natural language descriptions."
                          example='Input: "cat" → Output: segmentation mask of all cats in image'
                          note="Similar to SAM (Segment Anything Model) text prompting capabilities"
                        />
                      </label>

                      <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.capabilities?.supports_bbox_prompt || false}
                          onChange={() => handleCapabilityToggle('supports_bbox_prompt')}
                          className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900">Bounding Box Prompt Support</span>
                          <p className="text-xs text-gray-600 mt-0.5">Model accepts bounding boxes as prompts for segmentation</p>
                        </div>
                        <InfoTooltip content="Whether model supports bounding box prompt segmentation. Enable if your model can refine segmentation masks based on user-drawn bounding boxes." />
                      </label>

                      <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.capabilities?.supports_auto_detect || false}
                          onChange={() => handleCapabilityToggle('supports_auto_detect')}
                          className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900">Auto Detection</span>
                          <p className="text-xs text-gray-600 mt-0.5">Model automatically detects all objects without prompts</p>
                        </div>
                        <InfoTooltip
                          content="Whether your model supports automatic object detection without any user prompts or input. The model processes the entire image and returns all detected objects."
                          example="Input: Image → Output: All detected cars, people, etc. with bounding boxes"
                          note="Most YOLO and standard detection models (Faster R-CNN, RetinaNet) have this capability"
                        />
                      </label>

                      <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.capabilities?.supports_class_filter || false}
                          onChange={() => handleCapabilityToggle('supports_class_filter')}
                          className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900">Class Filtering Support</span>
                          <p className="text-xs text-gray-600 mt-0.5">Model can filter detections by class names</p>
                        </div>
                        <InfoTooltip content="Whether model supports filtering by class names. Enable if your model can return only specific object classes when requested." />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                      Output Types
                      <InfoTooltip content="Output types supported by your model: bbox (bounding boxes), polygon (segmentation polygons), mask (pixel masks)" />
                    </label>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.capabilities?.output_types?.includes('bbox') || false}
                          onChange={() => handleOutputTypeToggle('bbox')}
                          className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0"
                        />
                        <span className="text-sm font-medium text-gray-700">Bounding Box</span>
                      </label>
                      <label className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.capabilities?.output_types?.includes('polygon') || false}
                          onChange={() => handleOutputTypeToggle('polygon')}
                          className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0"
                        />
                        <span className="text-sm font-medium text-gray-700">Polygon</span>
                      </label>
                      <label className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.capabilities?.output_types?.includes('mask') || false}
                          onChange={() => handleOutputTypeToggle('mask')}
                          className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0"
                        />
                        <span className="text-sm font-medium text-gray-700">Mask</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      Detectable Classes (Optional)
                      <InfoTooltip content="List of class names the model can detect. Type a class name and press comma or Enter to add. Click X to remove. Leave empty if your model doesn't have predefined classes." />
                    </label>
                    <TagInput
                      value={formData.capabilities?.classes || []}
                      onChange={handleClassesChange}
                      placeholder="Type class name and press comma or Enter (e.g., car, person, truck)"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Press <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">comma</kbd> or{' '}
                      <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">Enter</kbd> to add tags
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Endpoint Configuration */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Endpoint Configuration</h3>
                  <InfoTooltip content="Customize how requests are made to external model APIs. Configure the inference endpoint path for non-standard API structures." />
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      Inference Path
                      <InfoTooltip
                        content="Path to inference endpoint that will be appended to your base endpoint URL."
                        example="https://api.example.com + /v1/detect = https://api.example.com/v1/detect"
                        note="Use /inference for standard APIs, or customize for services like /v1/predict, /detect, etc."
                      />
                    </label>
                    <input
                      type="text"
                      value={formData.endpoint_config?.inference_path || ''}
                      onChange={(e) => handleInferencePathChange(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg
                                 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="/inference"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Default: <code className="px-1 py-0.5 bg-gray-100 rounded">/inference</code>
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 4: Response Mapping */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">Response Mapping</h3>
                    <InfoTooltip
                      content="Response Mapping tells the system how to read your model's API response. Different models structure their responses differently - some use 'boxes', others use 'predictions.boxes' or 'detections.bboxes'."
                      example={`Your API returns:\n{\n  "predictions": {\n    "boxes": [[x1,y1,x2,y2]],\n    "confidence": [0.95]\n  }\n}\n\nYou would map:\nboxes_field: "predictions.boxes"\nscores_field: "predictions.confidence"`}
                      note="Use the presets below if you're using a common API format like YOLO or Ultralytics. You can always customize the fields manually."
                    />
                  </div>
                </div>

                <p className="text-xs text-gray-600 mb-3">
                  Configure how your model&apos;s response fields map to the standard format. Supports JSON path notation for nested fields.
                </p>
                <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      Bounding Boxes Field
                      <InfoTooltip
                        content="JSON path to bounding boxes in your API response. Use dot notation for nested fields."
                        example='predictions.boxes → {predictions: {boxes: [[x1,y1,x2,y2], ...]}}'
                        note="Expected format: array of [x1, y1, x2, y2] coordinates in pixels"
                      />
                    </label>
                    <input
                      type="text"
                      value={formData.endpoint_config?.response_mapping?.boxes_field || ''}
                      onChange={(e) => handleResponseMappingChange('boxes_field', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg
                                 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="boxes"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Default: <code className="px-1 py-0.5 bg-gray-100 rounded">boxes</code>
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      Confidence Scores Field
                      <InfoTooltip
                        content="JSON path to confidence scores in your API response. Must match the order and length of bounding boxes."
                        example='predictions.confidence → {predictions: {confidence: [0.95, 0.87, ...]}}'
                        note="Values should be floats between 0.0 and 1.0"
                      />
                    </label>
                    <input
                      type="text"
                      value={formData.endpoint_config?.response_mapping?.scores_field || ''}
                      onChange={(e) => handleResponseMappingChange('scores_field', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg
                                 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="scores"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Default: <code className="px-1 py-0.5 bg-gray-100 rounded">scores</code>
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      Segmentation Masks Field (Optional)
                      <InfoTooltip content="JSON path to segmentation masks. Set to null if your model doesn't support masks. Mask format should be compatible with polygon conversion." />
                    </label>
                    <input
                      type="text"
                      value={formData.endpoint_config?.response_mapping?.masks_field || ''}
                      onChange={(e) => handleResponseMappingChange('masks_field', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg
                                 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="masks"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Default: <code className="px-1 py-0.5 bg-gray-100 rounded">masks</code> • Leave empty if not supported
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      Class Labels Field (Optional)
                      <InfoTooltip
                        content="JSON path to class labels/names in your API response. Must correspond to each detection."
                        example='predictions.class_names → {predictions: {class_names: ["car", "person", ...]}}'
                        note="Leave empty if your model doesn't return class labels"
                      />
                    </label>
                    <input
                      type="text"
                      value={formData.endpoint_config?.response_mapping?.labels_field || ''}
                      onChange={(e) => handleResponseMappingChange('labels_field', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg
                                 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="labels"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Default: <code className="px-1 py-0.5 bg-gray-100 rounded">labels</code>
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      Object Count Field (Optional)
                      <InfoTooltip content="JSON path to object count in response. If not provided, count will be automatically computed from the boxes array length." />
                    </label>
                    <input
                      type="text"
                      value={formData.endpoint_config?.response_mapping?.num_objects_field || ''}
                      onChange={(e) => handleResponseMappingChange('num_objects_field', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg
                                 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="Leave empty to auto-compute"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Optional • Computed from boxes array if not specified
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 5: Form Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white
                             rounded-lg transition-colors font-medium disabled:opacity-50 shadow-sm"
                >
                  {submitting ? 'Registering...' : 'Register Model'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700
                             rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Models List */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Registered Models</h2>
            <button
              onClick={refreshModels}
              disabled={loading}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading && registeredModels.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-emerald-600" />
              Loading models...
            </div>
          ) : registeredModels.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              <p>No models registered yet.</p>
              <p className="text-sm mt-2">Click "Register Model" to add your first BYOM model.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {registeredModels.map((model) => (
                <div key={model.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-medium text-gray-900">{model.name}</h3>
                        {model.is_healthy ? (
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                        {!model.is_active && (
                          <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">
                            Inactive
                          </span>
                        )}
                      </div>

                      {model.description && (
                        <p className="text-gray-600 text-sm mb-2">{model.description}</p>
                      )}

                      <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                        <span>Endpoint: {model.endpoint_url}</span>
                        {model.last_health_check && (
                          <span>
                            • Last check: {new Date(model.last_health_check).toLocaleString()}
                          </span>
                        )}
                      </div>

                      {model.capabilities && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {model.capabilities.supports_text_prompt && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                              Text Prompt
                            </span>
                          )}
                          {model.capabilities.supports_bbox_prompt && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                              BBox Prompt
                            </span>
                          )}
                          {model.capabilities.supports_auto_detect && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">
                              Auto Detect
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleHealthCheck(model.id, model.name)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Check Health"
                      >
                        <RefreshCw className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => handleDelete(model.id, model.name)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
