import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { FolderOpen, Image as ImageIcon, Loader2, Plus, Shapes, Tag, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { projectStorage } from '@/lib/storage'
import type { Project } from '@/types/annotations'

interface ProjectRow extends Project {
  stats: { images: number; annotations: number; labels: number }
}

export default function LocalProjectsPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      await projectStorage.ensureDefault()
      const list = await projectStorage.getAll()
      const withStats = await Promise.all(
        list.map(async (p) => ({ ...p, stats: await projectStorage.getStats(p.id) }))
      )
      setProjects(withStats)
    } catch (error) {
      console.error('Failed to load projects:', error)
      toast.error('Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    const project = await projectStorage.create(name, newDescription.trim() || undefined)
    setShowCreate(false)
    setNewName('')
    setNewDescription('')
    toast.success(`Created "${project.name}"`)
    navigate({ to: '/annotation', search: { projectId: project.id } })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await projectStorage.remove(deleteTarget.id)
    toast.success(`Deleted "${deleteTarget.name}"`)
    setDeleteTarget(null)
    setDeleteConfirmText('')
    load()
  }

  const openProject = (id: string) => navigate({ to: '/annotation', search: { projectId: id } })

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-600 mt-1">
              Each project keeps its own images, labels and annotations in this browser.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="glass rounded-xl p-12 text-center border border-gray-200/50">
            <FolderOpen className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-700 font-medium">No projects yet</p>
            <p className="text-sm text-gray-500 mt-1">Create one to start annotating.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="glass rounded-xl p-5 border border-gray-200/50 hover:border-emerald-300 transition-colors flex items-center justify-between gap-4"
              >
                <button onClick={() => openProject(project.id)} className="flex-1 min-w-0 text-left">
                  <div className="font-semibold text-gray-900 truncate">{project.name}</div>
                  {project.description && (
                    <div className="text-sm text-gray-600 truncate mt-0.5">{project.description}</div>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                    <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" />{project.stats.images} images</span>
                    <span className="flex items-center gap-1"><Shapes className="w-3 h-3" />{project.stats.annotations} annotations</span>
                    <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{project.stats.labels} labels</span>
                    <span>Updated {new Date(project.updatedAt).toLocaleString()}</span>
                  </div>
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openProject(project.id)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded transition-colors"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => { setDeleteTarget(project); setDeleteConfirmText('') }}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Delete project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Project" maxWidth="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Name</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Warehouse segmentation"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">Description (optional)</label>
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 glass hover:glass-strong text-gray-900 rounded border border-gray-300">Cancel</button>
            <button onClick={handleCreate} disabled={!newName.trim()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded transition-colors">Create</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Project" maxWidth="md">
        <div className="space-y-4">
          <p className="text-gray-800">
            This permanently deletes <span className="font-semibold">{deleteTarget?.name}</span> with
            its {deleteTarget?.stats.images} images and {deleteTarget?.stats.annotations} annotations.
          </p>
          <p className="text-red-600 text-sm font-medium">This cannot be undone. Export first if you need the data.</p>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Type the project name to confirm</label>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 glass hover:glass-strong text-gray-900 rounded border border-gray-300">Cancel</button>
            <button
              onClick={handleDelete}
              disabled={deleteConfirmText !== deleteTarget?.name}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              Delete Project
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
