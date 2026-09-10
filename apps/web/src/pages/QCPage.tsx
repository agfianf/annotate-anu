import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { CheckCircle2, Eye, EyeOff, Loader2, Plus, RotateCcw, ThumbsDown, Trash2, UploadCloud, Wrench } from '@/components/ui/icons'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { InstanceQCViewer } from '@/components/qc/InstanceQCViewer'
import { ROITileGrid } from '@/components/qc/ROITileGrid'
import { getApiErrorMessage } from '@/lib/api-error'
import { imagesApi } from '@/lib/api-client'
import { qcClient, type QCItem, type QCSession, type QCStats, type StorageConnection, type Verdict } from '@/lib/qc-client'

const VERDICT_STYLES: Record<Verdict, { label: string; className: string; key: string }> = {
  bad: { label: 'Bad', className: 'bg-red-500 hover:bg-red-600', key: 'A' },
  refine: { label: 'Refine', className: 'bg-amber-500 hover:bg-amber-600', key: 'S' },
  good: { label: 'Good', className: 'bg-emerald-600 hover:bg-emerald-700', key: 'D' },
}

export default function QCPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { sessionId?: string; projectId?: string }

  const [sessions, setSessions] = useState<QCSession[]>([])
  const [session, setSession] = useState<QCSession | null>(null)
  const [queue, setQueue] = useState<QCItem[]>([])
  const [remaining, setRemaining] = useState(0)
  const [stats, setStats] = useState<QCStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newJobId, setNewJobId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<QCSession | null>(null)
  const [showEmpty, setShowEmpty] = useState(false)
  const [connections, setConnections] = useState<StorageConnection[]>([])
  const [showPublish, setShowPublish] = useState(false)
  const [publishTo, setPublishTo] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [newMode, setNewMode] = useState<'instance' | 'roi'>('instance')

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await qcClient.listSessions())
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to load QC sessions'))
    }
  }, [])

  const loadQueue = useCallback(async (sessionId: string) => {
    const result = await qcClient.getQueue(sessionId, 25)
    setQueue(result.items)
    setRemaining(result.remaining)
  }, [])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      if (!search.sessionId) {
        // Returning to the list: drop the open session or it renders forever
        setSession(null)
        setQueue([])
        setStats(null)
        setHistory([])
        await loadSessions()
        setLoading(false)
        return
      }
      try {
        const s = await qcClient.getSession(search.sessionId)
        setSession(s)
        setStats(s.stats ?? null)
        await loadQueue(s.id)
      } catch (error) {
        toast.error(getApiErrorMessage(error, 'Failed to open session'))
        setSession(null)
      }
      setLoading(false)
    })()
  }, [search.sessionId, loadSessions, loadQueue])

  const current = queue[0]

  const submitVerdict = useCallback(
    async (verdict: Verdict) => {
      if (!session || !current || busy) return
      setBusy(true)
      const key = current.item_key
      try {
        const result = await qcClient.recordVerdict(session.id, {
          item_key: key,
          verdict,
          image_id: current.image_id,
        })
        setStats(result.stats)
        setHistory((prev) => [key, ...prev].slice(0, 50))
        setQueue((prev) => prev.slice(1))
        setRemaining((prev) => Math.max(0, prev - 1))
        if (queue.length <= 3) await loadQueue(session.id)
      } catch (error) {
        toast.error(getApiErrorMessage(error, 'Failed to record verdict'))
      } finally {
        setBusy(false)
      }
    },
    [session, current, busy, queue.length, loadQueue]
  )

  const undoLast = useCallback(async () => {
    if (!session || history.length === 0 || busy) return
    setBusy(true)
    try {
      const result = await qcClient.undo(session.id, history[0])
      setStats(result.stats)
      setHistory((prev) => prev.slice(1))
      await loadQueue(session.id)
      toast.success('Verdict withdrawn')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Undo failed'))
    } finally {
      setBusy(false)
    }
  }, [session, history, busy, loadQueue])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const key = e.key.toLowerCase()
      if (key === 'a' || e.key === 'ArrowLeft') { e.preventDefault(); submitVerdict('bad') }
      else if (key === 's' || e.key === 'ArrowDown') { e.preventDefault(); submitVerdict('refine') }
      else if (key === 'd' || e.key === 'ArrowRight') { e.preventDefault(); submitVerdict('good') }
      else if (key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undoLast() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [submitVerdict, undoLast])

  const openPublish = async () => {
    try {
      const list = await qcClient.listConnections()
      setConnections(list)
      setPublishTo(list[0]?.id ?? '')
      setShowPublish(true)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to load storage connections'))
    }
  }

  const handlePublish = async () => {
    if (!session || !publishTo) return
    setPublishing(true)
    try {
      const result = await qcClient.publish(session.id, publishTo)
      toast.success(`Wrote ${result.entries} verdicts to ${result.bucket}/${result.key}`)
      setShowPublish(false)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Publish failed'))
    } finally {
      setPublishing(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await qcClient.deleteSession(deleteTarget.id)
      toast.success(`Deleted "${deleteTarget.name}"`)
      setDeleteTarget(null)
      await loadSessions()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to delete session'))
    }
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      const created = await qcClient.createSession({
        project_id: 1,
        name,
        mode: newMode,
        job_id: newJobId ? parseInt(newJobId, 10) : null,
      })
      setShowCreate(false)
      setNewName('')
      setNewJobId('')
      navigate({ to: '/dashboard/qc', search: { sessionId: created.id } })
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to create session'))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  const visibleSessions = showEmpty ? sessions : sessions.filter((s) => (s.total_items ?? 0) > 0)

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 px-6 py-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Quality Control</h1>
              <p className="text-sm text-gray-600 mt-1">Review annotated frames and triage them.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowEmpty((prev) => !prev)}
                className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-300 flex items-center gap-1.5"
                title={showEmpty ? 'Hide sessions with nothing to review' : 'Show every session'}
              >
                {showEmpty ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showEmpty ? 'Hide empty' : 'Show all'}
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Session
              </button>
            </div>
          </div>

          {visibleSessions.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center border border-gray-200/50 text-gray-600">
              {sessions.length === 0
                ? 'No QC sessions yet.'
                : 'No session has annotated images to review yet.'}
            </div>
          ) : (
            <div className="grid gap-3">
              {visibleSessions.map((s) => {
                const total = s.total_items ?? 0
                const reviewed = s.stats?.reviewed ?? 0
                const pct = total > 0 ? Math.round((reviewed / total) * 100) : 0
                return (
                  <div
                    key={s.id}
                    className="glass rounded-xl p-5 border border-gray-200/50 hover:border-emerald-300 transition-colors flex items-center gap-4"
                  >
                    <button
                      onClick={() => navigate({ to: '/dashboard/qc', search: { sessionId: s.id } })}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="font-semibold text-gray-900">{s.name}</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
                        <span>{s.mode}</span>
                        {s.job_id && <span>job {s.job_id}</span>}
                        <span>{reviewed} / {total} reviewed</span>
                        <span>{s.stats?.settled ?? 0} settled</span>
                        {(s.stats?.disputed ?? 0) > 0 && (
                          <span className="text-amber-700">{s.stats?.disputed} disputed</span>
                        )}
                      </div>
                      <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                    <button
                      onClick={() => setDeleteTarget(s)}
                      className="flex-shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <Modal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="Delete QC Session"
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-gray-800">
              Delete <span className="font-semibold">{deleteTarget?.name}</span> and its{' '}
              {deleteTarget?.stats?.reviewed ?? 0} recorded verdict(s)?
            </p>
            <p className="text-red-600 text-sm font-medium">
              This cannot be undone. Export the manifest first if you need the verdicts.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 glass text-gray-900 rounded border border-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded"
              >
                Delete Session
              </button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New QC Session" maxWidth="md">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Name</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Mode</label>
              <div className="flex gap-2">
                {(['instance', 'roi'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setNewMode(m)}
                    className={`flex-1 px-3 py-2 text-sm rounded border transition-colors ${
                      newMode === m
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-900 border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {m === 'instance' ? 'Instance (whole frame)' : 'ROI (crops by class)'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Job ID (optional)</label>
              <input
                value={newJobId}
                onChange={(e) => setNewJobId(e.target.value)}
                placeholder="Leave empty to review every image"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 glass text-gray-900 rounded border border-gray-300">Cancel</button>
              <button onClick={handleCreate} disabled={!newName.trim()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded">Create</button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }

  return (
    // Sized to the dashboard content box (main has p-6 lg:p-8) so the action bar never scrolls away
    <div className="h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)] overflow-hidden flex flex-col bg-gray-100 rounded-lg border border-gray-200">
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: '/dashboard/qc', search: {} })}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            ← Sessions
          </button>
          <span className="font-semibold text-gray-900">{session.name}</span>
          <span className="text-xs text-gray-500">{remaining} left</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {stats && (
            <>
              <span className="text-emerald-700">{stats.by_verdict.good ?? 0} good</span>
              <span className="text-amber-700">{stats.by_verdict.refine ?? 0} refine</span>
              <span className="text-red-700">{stats.by_verdict.bad ?? 0} bad</span>
              {stats.disputed > 0 && <span className="text-purple-700">{stats.disputed} disputed</span>}
              <span className="text-gray-500">{stats.settled} settled</span>
            </>
          )}
          <button
            onClick={openPublish}
            className="px-2.5 py-1 rounded border border-gray-300 hover:bg-gray-100 flex items-center gap-1.5 text-gray-700"
            title="Write the verdict manifest to a bucket"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Publish
          </button>
          <button
            onClick={undoLast}
            disabled={history.length === 0 || busy}
            className="px-2.5 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 flex items-center gap-1.5 text-gray-700"
            title="Undo last verdict (Ctrl+Z)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Undo
          </button>
        </div>
      </header>

      {session.mode === 'roi' ? (
        <div className="flex-1 min-h-0">
          <ROITileGrid sessionId={session.id} onStats={(s) => setStats(s as QCStats)} />
        </div>
      ) : (
      <div className="flex-1 min-h-0 flex items-center justify-center p-3">
        {!current ? (
          <div className="text-center text-gray-600">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="font-medium text-gray-900">Nothing left to review</p>
            <p className="text-sm mt-1">Every item in this session has your verdict.</p>
          </div>
        ) : (
          <InstanceQCViewer
            item={current}
            imageUrl={imagesApi.getFullImageUrl(
              current.s3_key,
              current.job_id ? String(current.job_id) : undefined,
              current.image_id
            )}
          />
        )}
      </div>
      )}

      <Modal isOpen={showPublish} onClose={() => setShowPublish(false)} title="Publish Manifest" maxWidth="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Writes a JSON manifest of every verdict into the bucket, including the
            <span className="font-medium"> refine </span>
            marker list. Source objects are never moved or deleted.
          </p>
          {connections.length === 0 ? (
            <p className="text-sm text-amber-700">
              No storage connection registered yet. Add one via the storage API first.
            </p>
          ) : (
            <select
              value={publishTo}
              onChange={(e) => setPublishTo(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.bucket}{c.prefix ? `/${c.prefix}` : ''}
                </option>
              ))}
            </select>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowPublish(false)} className="px-4 py-2 glass text-gray-900 rounded border border-gray-300">
              Cancel
            </button>
            <button
              onClick={handlePublish}
              disabled={!publishTo || publishing}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded flex items-center gap-2"
            >
              {publishing && <Loader2 className="w-4 h-4 animate-spin" />}
              Publish
            </button>
          </div>
        </div>
      </Modal>

      {session.mode !== 'roi' && current && (
        <div className="flex-shrink-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-center gap-3">
          {(['bad', 'refine', 'good'] as Verdict[]).map((verdict) => {
            const style = VERDICT_STYLES[verdict]
            const Icon = verdict === 'good' ? CheckCircle2 : verdict === 'refine' ? Wrench : ThumbsDown
            return (
              <button
                key={verdict}
                onClick={() => submitVerdict(verdict)}
                disabled={busy}
                className={`px-6 py-3 rounded-xl text-white font-medium flex items-center gap-2 disabled:opacity-50 transition-colors ${style.className}`}
              >
                <Icon className="w-5 h-5" />
                {style.label}
                <kbd className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">{style.key}</kbd>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
