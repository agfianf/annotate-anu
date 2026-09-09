import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Database,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { getApiErrorMessage } from '@/lib/api-error'
import { storageClient, type BucketListing, type StorageConnection } from '@/lib/storage-client'

const EMPTY_FORM = {
  name: '',
  bucket: '',
  access_key: '',
  secret_key: '',
  endpoint_url: '',
  region: 'us-east-1',
  prefix: '',
  use_ssl: true,
}

export default function StoragePage() {
  const [connections, setConnections] = useState<StorageConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StorageConnection | null>(null)
  const [browsing, setBrowsing] = useState<StorageConnection | null>(null)
  const [listing, setListing] = useState<BucketListing | null>(null)
  const [browsePath, setBrowsePath] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setConnections(await storageClient.list())
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to load storage connections'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!form.name.trim() || !form.bucket.trim() || !form.access_key || !form.secret_key) return
    setSaving(true)
    try {
      const created = await storageClient.create({
        ...form,
        endpoint_url: form.endpoint_url.trim() || null,
        region: form.region.trim() || null,
      })
      toast[created.healthy ? 'success' : 'error'](
        created.healthy ? `Connected to ${created.bucket}` : `Saved, but: ${created.last_status}`
      )
      setShowCreate(false)
      setForm({ ...EMPTY_FORM })
      load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to save connection'))
    } finally {
      setSaving(false)
    }
  }

  const handleCheck = async (connection: StorageConnection) => {
    setCheckingId(connection.id)
    try {
      const result = await storageClient.check(connection.id)
      toast[result.healthy ? 'success' : 'error'](result.status)
      load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Check failed'))
    } finally {
      setCheckingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await storageClient.remove(deleteTarget.id)
      toast.success(`Removed "${deleteTarget.name}"`)
      setDeleteTarget(null)
      load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Delete failed'))
    }
  }

  const openBrowse = async (connection: StorageConnection, path = '') => {
    setBrowsing(connection)
    setListing(null)
    setBrowsePath(path)
    try {
      setListing(await storageClient.browse(connection.id, path))
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Bucket listing failed'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Storage</h1>
          <p className="text-sm text-gray-600 mt-1">
            S3 or MinIO buckets used to import batches and publish QC manifests.
            Credentials are encrypted before they are stored and never returned by the API.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-2 flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Bucket
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-emerald-600 animate-spin" /></div>
      ) : connections.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center border border-gray-200/50">
          <Database className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">No buckets connected</p>
          <p className="text-sm text-gray-500 mt-1">Add one to import batches and sync QC results.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {connections.map((c) => {
            const healthy = c.last_status?.toLowerCase().includes('reachable')
            return (
              <div key={c.id} className="glass rounded-xl p-5 border border-gray-200/50 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{c.name}</span>
                    {healthy ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                  <div className="text-sm text-gray-600 font-mono mt-0.5 truncate">
                    s3://{c.bucket}{c.prefix ? `/${c.prefix}` : ''}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    {c.endpoint_url || 'AWS S3'}
                    {c.last_status ? ` · ${c.last_status}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openBrowse(c)}
                    className="px-3 py-1.5 text-sm bg-white hover:bg-gray-100 text-gray-800 rounded border border-gray-300 flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Browse
                  </button>
                  <button
                    onClick={() => handleCheck(c)}
                    disabled={checkingId === c.id}
                    className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                    title="Re-test credentials"
                  >
                    {checkingId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add Bucket" maxWidth="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="production-data" autoFocus />
            <Field label="Bucket" value={form.bucket} onChange={(v) => setForm({ ...form, bucket: v })} placeholder="my-bucket" />
          </div>
          <Field
            label="Endpoint URL (blank for AWS)"
            value={form.endpoint_url}
            onChange={(v) => setForm({ ...form, endpoint_url: v })}
            placeholder="http://minio:9000"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Access Key" value={form.access_key} onChange={(v) => setForm({ ...form, access_key: v })} />
            <Field label="Secret Key" value={form.secret_key} onChange={(v) => setForm({ ...form, secret_key: v })} type="password" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Region" value={form.region} onChange={(v) => setForm({ ...form, region: v })} />
            <Field label="Prefix (optional subset)" value={form.prefix} onChange={(v) => setForm({ ...form, prefix: v })} placeholder="datasets/2026" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={form.use_ssl}
              onChange={(e) => setForm({ ...form, use_ssl: e.target.checked })}
              className="w-4 h-4 accent-emerald-600"
            />
            Use TLS (uncheck for a local MinIO over http)
          </label>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-200/50">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 glass text-gray-900 rounded border border-gray-300">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={saving || !form.name.trim() || !form.bucket.trim() || !form.access_key || !form.secret_key}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save & Test
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove Bucket" maxWidth="md">
        <div className="space-y-4">
          <p className="text-gray-800">
            Remove <span className="font-semibold">{deleteTarget?.name}</span>? This only forgets the
            connection here; nothing in the bucket is touched.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 glass text-gray-900 rounded border border-gray-300">Cancel</button>
            <button onClick={handleDelete} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded">Remove</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!browsing} onClose={() => setBrowsing(null)} title={`Browse ${browsing?.bucket ?? ''}`} maxWidth="2xl">
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-sm text-gray-600 font-mono flex-wrap">
            <button onClick={() => browsing && openBrowse(browsing, '')} className="hover:text-emerald-600">
              {browsing?.bucket}
            </button>
            {browsePath.split('/').filter(Boolean).map((part, i, all) => (
              <span key={i} className="flex items-center gap-1.5">
                <ChevronRight className="w-3 h-3" />
                <button
                  onClick={() => browsing && openBrowse(browsing, all.slice(0, i + 1).join('/') + '/')}
                  className="hover:text-emerald-600"
                >
                  {part}
                </button>
              </span>
            ))}
          </div>

          {!listing ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-emerald-600 animate-spin" /></div>
          ) : (
            <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {listing.prefixes.map((prefix) => (
                <button
                  key={prefix}
                  onClick={() => browsing && openBrowse(browsing, prefix)}
                  className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-emerald-50 text-sm"
                >
                  <FolderOpen className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="font-mono truncate">{prefix}</span>
                </button>
              ))}
              {listing.objects.map((obj) => (
                <div key={obj.key} className="px-3 py-2 flex items-center gap-2 text-sm text-gray-700">
                  <span className="font-mono truncate flex-1">{obj.key}</span>
                  <span className="text-xs text-gray-500 flex-shrink-0">{(obj.size / 1024).toFixed(0)} KB</span>
                </div>
              ))}
              {listing.prefixes.length === 0 && listing.objects.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-gray-500">Nothing here</p>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, type = 'text', autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  autoFocus?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-800 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </div>
  )
}
