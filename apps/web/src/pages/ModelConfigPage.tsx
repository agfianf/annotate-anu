/**
 * Model Configuration Page for managing BYOM models
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useModelRegistry } from '../hooks/useModelRegistry'
import { byomClient } from '../lib/byom-client'
import type { ModelRegistrationRequest } from '../types/byom'

export default function ModelConfigPage() {
  const navigate = useNavigate()
  const { registeredModels, refreshModels, loading } = useModelRegistry()
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<ModelRegistrationRequest>({
    name: '',
    endpoint_url: '',
    auth_token: '',
    description: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      await byomClient.registerModel({
        ...formData,
        auth_token: formData.auth_token || undefined,
        description: formData.description || undefined,
      })

      toast.success(`Model "${formData.name}" registered successfully!`)
      setShowForm(false)
      setFormData({ name: '', endpoint_url: '', auth_token: '', description: '' })
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/app')}
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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Model Name *
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Endpoint URL *
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bearer Token (Optional)
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
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

              <p className="text-xs text-gray-600 mt-3 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Capabilities will be auto-detected from your model's /capabilities endpoint
              </p>
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
                          <CheckCircle className="w-5 h-5 text-emerald-600" title="Healthy" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" title="Unhealthy" />
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
