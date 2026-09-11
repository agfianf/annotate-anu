import type { Annotation } from '../types/annotations'

export interface PendingChange {
  annotation: Annotation
  operation: 'create' | 'update' | 'delete'
  imageWidth: number
  imageHeight: number
  backendId?: string
}

/** Preserve edits made while a request is in flight, including create-then-delete. */
export class AnnotationSyncQueue {
  readonly pending = new Map<string, PendingChange>()
  private inFlight = new Map<string, PendingChange>()
  private backendIds = new Map<string, string>()

  readonly jobId: string | null

  constructor(jobId: string | null = null) {
    this.jobId = jobId
  }

  put(change: PendingChange): void {
    const id = change.annotation.id
    const backendId = change.backendId || this.backendIds.get(id)
    if (backendId) this.backendIds.set(id, backendId)
    if (change.operation === 'delete' && !backendId && !this.inFlight.has(id)) {
      this.pending.delete(id)
      return
    }
    this.pending.set(id, {
      ...change,
      backendId,
      operation: change.operation === 'delete' ? 'delete' : backendId ? 'update' : 'create',
    })
  }

  begin(): PendingChange[] {
    const previous = this.inFlight
    this.inFlight = new Map([...this.pending].map(([id, change]) => {
      // A failed create may still need a retry before its queued delete has a server ID.
      const sent = previous.get(id)
      return [id, change.operation === 'delete' && !change.backendId && sent?.operation === 'create' ? sent : change]
    }))
    return [...this.inFlight.values()]
  }

  acknowledge(imageIds: string[], createdIds: Record<string, string>): void {
    const acknowledgedImages = new Set(imageIds)
    for (const [id, sent] of this.inFlight) {
      if (!acknowledgedImages.has(sent.annotation.imageId)) continue
      const backendId = createdIds[sent.annotation.originalFrontendId || id] || sent.backendId
      // A create without an ID cannot safely be turned into a later update/delete.
      if (sent.operation === 'create' && !backendId) continue
      if (backendId) this.backendIds.set(id, backendId)
      const pending = this.pending.get(id)
      if (pending === sent) {
        this.pending.delete(id)
      } else if (pending && backendId) {
        this.pending.set(id, {
          ...pending,
          backendId,
          operation: pending.operation === 'delete' ? 'delete' : 'update',
        })
      }
    }
    this.inFlight.clear()
  }

  failed(): void {
    // Keep the sent create until a possible queued delete can be resolved.
  }

  clear(): void {
    this.pending.clear()
  }
}
