import { getAccessToken } from './api-client'

/** Fetch protected job images for canvas rendering and model prompts. */
export async function fetchImageAsBlob(url: string): Promise<Blob> {
  const token = getAccessToken()
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`)
  return response.blob()
}
