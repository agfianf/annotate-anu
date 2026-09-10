import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Cpu, Loader2, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { byomClient } from '@/lib/byom-client'
import { getApiErrorMessage } from '@/lib/api-error'
import { modelEndpointUrl, modelServerClient, modelServerUrl, type ServerModel } from '@/lib/model-server-client'
import type { OutputType } from '@/types/byom'

interface LocalModelPanelProps {
  onModelRegistered?: () => void
}

// Ultralytics task -> the capability flags BYOM needs
function capabilitiesForTask(task: string, classes: string[]) {
  const isSegment = task === 'segment'
  const isClassify = task === 'classify'
  return {
    supports_text_prompt: false,
    supports_bbox_prompt: false,
    supports_auto_detect: !isClassify,
    supports_class_filter: !isClassify,
    supports_classification: isClassify,
    output_types: (isSegment ? ['polygon', 'bbox'] : ['bbox']) as OutputType[],
    classes,
  }
}

export function LocalModelPanel({ onModelRegistered }: LocalModelPanelProps) {
  const [models, setModels] = useState<ServerModel[]>([])
  const [serverUp, setServerUp] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadPercent, setUploadPercent] = useState<number | null>(null)
  const [registering, setRegistering] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      await modelServerClient.health()
      setServerUp(true)
      setModels(await modelServerClient.listModels())
    } catch {
      setServerUp(false)
      setModels([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleUpload = async (file: File) => {
    setUploadPercent(0)
    try {
      const uploaded = await modelServerClient.uploadModel(file, setUploadPercent)
      toast.success(`Uploaded ${uploaded.name} (${uploaded.task}, ${uploaded.classes.length} classes)`)
      await refresh()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Upload failed'))
    } finally {
      setUploadPercent(null)
    }
  }

  const handleRegister = async (model: ServerModel) => {
    setRegistering(model.name)
    try {
      const info = model.task && model.classes
        ? { task: model.task, classes: model.classes }
        : await modelServerClient.info(model.name)

      await byomClient.registerModel({
        name: model.name,
        endpoint_url: modelEndpointUrl(model.name),
        description: `Local ${info.task} model (${info.classes.length} classes)`,
        capabilities: capabilitiesForTask(info.task, info.classes),
        endpoint_config: {
          inference_path: '/inference',
          response_mapping: {
            boxes_field: 'boxes',
            scores_field: 'scores',
            masks_field: 'masks',
            labels_field: 'labels',
            num_objects_field: 'num_objects',
          },
        },
      })
      toast.success(`Registered "${model.name}" as a model you can select`)
      onModelRegistered?.()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Registration failed'))
    } finally {
      setRegistering(null)
    }
  }

  const handleDelete = async (name: string) => {
    if (!window.confirm(`Delete "${name}.pt" from the model server?`)) return
    try {
      await modelServerClient.deleteModel(name)
      toast.success(`Deleted ${name}`)
      refresh()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Delete failed'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-600" />
            Local Models
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Upload Ultralytics/YOLO <code className="text-xs">.pt</code> weights and register them
            for annotation. Served from <code className="text-xs">{modelServerUrl}</code>.
          </p>
        </div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 text-sm bg-white hover:bg-gray-100 text-gray-900 rounded border border-gray-300 transition-colors"
        >
          Refresh
        </button>
      </div>

      {serverUp === false && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            Model server is not reachable at <code>{modelServerUrl}</code>. Start it with{' '}
            <code>docker compose -f docker/docker-compose.dev.yml up -d model-server</code>.
          </div>
        </div>
      )}

      {serverUp && (
        <label className="block cursor-pointer">
          <div className="border-2 border-dashed border-gray-300 hover:border-emerald-500 rounded-xl p-6 flex flex-col items-center justify-center gap-2 transition-colors bg-white hover:bg-emerald-50">
            {uploadPercent === null ? (
              <>
                <Upload className="w-6 h-6 text-gray-400" />
                <span className="text-sm text-gray-700">Upload a .pt file</span>
                <span className="text-xs text-gray-500">yolo11n.pt, yolo11n-seg.pt, or your own trained weights</span>
              </>
            ) : (
              <>
                <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
                <span className="text-sm text-gray-700">Uploading... {uploadPercent}%</span>
              </>
            )}
          </div>
          <input
            type="file"
            accept=".pt"
            className="hidden"
            disabled={uploadPercent !== null}
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
        </label>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-emerald-600 animate-spin" /></div>
      ) : models.length === 0 && serverUp ? (
        <p className="text-sm text-gray-500 text-center py-6">No .pt files on the server yet.</p>
      ) : (
        <div className="space-y-2">
          {models.map((model) => (
            <div key={model.name} className="flex items-center justify-between gap-4 p-3 glass rounded-lg border border-gray-200/50">
              <div className="min-w-0">
                <div className="font-medium text-gray-900 flex items-center gap-2">
                  {model.name}
                  {model.loaded && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {(model.size_bytes / 1024 / 1024).toFixed(1)} MB
                  {model.task && ` - ${model.task}`}
                  {model.classes && ` - ${model.classes.length} classes`}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleRegister(model)}
                  disabled={registering === model.name}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white text-sm rounded transition-colors flex items-center gap-1.5"
                >
                  {registering === model.name && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Register
                </button>
                <button
                  onClick={() => handleDelete(model.name)}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Delete from server"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
