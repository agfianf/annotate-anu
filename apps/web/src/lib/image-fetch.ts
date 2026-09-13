import { getAccessToken } from './api-client'

interface SharedRequest {
  controller: AbortController
  promise: Promise<Blob>
  /** Callers still waiting on this request. */
  refCount: number
}

/** In-flight requests keyed by token + URL, so callers holding different sessions never share a response. */
const inFlight = new Map<string, SharedRequest>()

/** An image request that reached the server and was refused. `status` lets callers separate an expired session (401/403) from a missing file (404/410) from a transient failure (5xx) without parsing the message. */
export interface ImageFetchError extends Error {
  status?: number
}

function imageFetchError(status: number): ImageFetchError {
  const error: ImageFetchError = new Error(`Failed to fetch image: ${status}`)
  error.status = status
  return error
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Image request aborted', 'AbortError')
}

/**
 * Fetch protected job images for canvas rendering and model prompts.
 *
 * Concurrent callers for the same image share one request. Cancellation is reference counted: `signal` only detaches the caller that passed it, and the underlying fetch is aborted only once every caller has detached. An unmounting thumbnail therefore never cancels an image another mounted component is still waiting for.
 */
export async function fetchImageAsBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  const token = getAccessToken()
  const key = JSON.stringify([token ?? '', url])

  let request = inFlight.get(key)
  if (!request) {
    const controller = new AbortController()
    const created: SharedRequest = {
      controller,
      refCount: 0,
      promise: (async () => {
        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        })
        if (!response.ok) throw imageFetchError(response.status)
        return response.blob()
      })(),
    }
    const forget = () => {
      if (inFlight.get(key) === created) inFlight.delete(key)
    }
    created.promise.then(forget, forget)
    inFlight.set(key, created)
    request = created
  }

  const shared = request
  shared.refCount += 1

  if (!signal) return shared.promise

  let rejectAborted: ((reason: Error) => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    rejectAborted = reject
  })
  const onAbort = () => {
    shared.refCount -= 1
    if (shared.refCount <= 0) {
      if (inFlight.get(key) === shared) inFlight.delete(key)
      shared.controller.abort()
    }
    rejectAborted?.(abortReason(signal))
  }

  if (signal.aborted) {
    onAbort()
    return aborted
  }

  signal.addEventListener('abort', onAbort, { once: true })
  try {
    return await Promise.race([shared.promise, aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}
