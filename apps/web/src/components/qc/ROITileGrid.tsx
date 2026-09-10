import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { qcClient, type ROIClass, type ROITile } from '@/lib/qc-client'

interface ROITileGridProps {
  sessionId: string
  onStats?: (stats: unknown) => void
}

const API_BASE = import.meta.env.VITE_CORE_API_URL !== undefined
  ? import.meta.env.VITE_CORE_API_URL
  : 'http://localhost:8001'

/**
 * Odd-one-out review: tiles of one predicted class, click the ones that do not
 * belong, then confirm the rest or reassign the wrong ones to a real class.
 */
export function ROITileGrid({ sessionId, onStats }: ROITileGridProps) {
  const [classes, setClasses] = useState<ROIClass[]>([])
  const [activeClass, setActiveClass] = useState<string | null>(null)
  const [tiles, setTiles] = useState<ROITile[]>([])
  const [remaining, setRemaining] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reassignTo, setReassignTo] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (labelId: string | null) => {
      setLoading(true)
      try {
        const result = await qcClient.getROITiles(sessionId, labelId, 120)
        setTiles(result.tiles)
        setRemaining(result.remaining)
        setClasses(result.classes)
        setSelected(new Set())
        if (labelId === null && result.classes.length > 0) {
          setActiveClass(result.classes[0].label_id)
        }
      } catch (error) {
        toast.error(getApiErrorMessage(error, 'Failed to load crops'))
      } finally {
        setLoading(false)
      }
    },
    [sessionId]
  )

  useEffect(() => { load(activeClass) }, [activeClass, load])

  const activeClassName = useMemo(
    () => classes.find((c) => c.label_id === activeClass)?.label_name ?? 'all',
    [classes, activeClass]
  )

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const submit = async (mode: 'confirm-rest' | 'reject-selected') => {
    if (busy || tiles.length === 0) return
    setBusy(true)
    try {
      const items =
        mode === 'reject-selected'
          ? Array.from(selected).map((key) => ({
              item_key: key,
              verdict: 'bad' as const,
              corrected_label_id: reassignTo || null,
            }))
          : tiles
              .filter((t) => !selected.has(t.item_key))
              .map((t) => ({ item_key: t.item_key, verdict: 'good' as const }))

      if (items.length === 0) {
        toast.error(mode === 'reject-selected' ? 'Nothing selected' : 'Every tile is selected')
        return
      }

      const result = await qcClient.recordBulk(sessionId, items)
      onStats?.(result.stats)
      toast.success(`Recorded ${result.recorded} verdict(s)`)
      await load(activeClass)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to record verdicts'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white">
        {classes.map((c) => (
          <button
            key={c.label_id ?? 'none'}
            onClick={() => setActiveClass(c.label_id)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              activeClass === c.label_id
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-100'
            }`}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle"
              style={{ backgroundColor: c.label_color || '#9ca3af' }}
            />
            {c.label_name ?? 'unlabelled'}
            <span className="ml-1.5 opacity-70">{c.count}</span>
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500">{remaining} unreviewed</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 bg-gray-50">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
          </div>
        ) : tiles.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto mb-2" />
            Nothing left to review in <span className="font-medium">{activeClassName}</span>.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
            {tiles.map((tile) => {
              const isSelected = selected.has(tile.item_key)
              return (
                <button
                  key={tile.item_key}
                  onClick={() => toggle(tile.item_key)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    isSelected ? 'border-red-500 ring-2 ring-red-300 scale-95' : 'border-transparent hover:border-emerald-400'
                  }`}
                  title={`${tile.filename}${tile.confidence ? ` · ${(tile.confidence * 100).toFixed(0)}%` : ''}`}
                >
                  <img
                    src={`${API_BASE}${tile.crop_url}`}
                    alt={tile.filename}
                    loading="lazy"
                    className="w-full h-full object-cover bg-gray-900"
                  />
                  {isSelected && (
                    <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
                      <span className="text-white text-xs font-semibold px-1.5 py-0.5 bg-red-600 rounded">
                        not {activeClassName}
                      </span>
                    </div>
                  )}
                  {tile.confidence != null && (
                    <span className="absolute bottom-0 right-0 text-[10px] text-white bg-black/60 px-1 rounded-tl">
                      {(tile.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-3 py-3 flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-700">
          <span className="font-semibold">{selected.size}</span> marked as not {activeClassName}
        </span>

        <select
          value={reassignTo}
          onChange={(e) => setReassignTo(e.target.value)}
          className="px-2.5 py-1.5 text-sm bg-white border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Reassign to... (optional)</option>
          {classes
            .filter((c) => c.label_id && c.label_id !== activeClass)
            .map((c) => (
              <option key={c.label_id} value={c.label_id as string}>
                {c.label_name}
              </option>
            ))}
        </select>

        <button
          onClick={() => submit('reject-selected')}
          disabled={busy || selected.size === 0}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white rounded-lg text-sm"
        >
          Reject {selected.size}
        </button>

        <button
          onClick={() => submit('confirm-rest')}
          disabled={busy || tiles.length === 0}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-lg text-sm ml-auto"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" />}
          Confirm remaining {tiles.length - selected.size}
        </button>
      </div>
    </div>
  )
}
