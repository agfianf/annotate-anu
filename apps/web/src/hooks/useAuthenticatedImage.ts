/**
 * Hook to load images that require authentication
 * Fetches images with JWT token and creates blob URLs for <img> tags
 */

import { useEffect, useState } from 'react';
import { getAccessToken } from '../lib/api-client';

export function useAuthenticatedImage(imageUrl: string | null): {
  blobUrl: string | null;
  isLoading: boolean;
  error: Error | null;
} {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setBlobUrl(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    let objectUrl: string | null = null;

    async function fetchImage() {
      try {
        setIsLoading(true);
        setError(null);

        if (!imageUrl) {
          throw new Error('Image URL is required');
        }

        const token = getAccessToken();
        const response = await fetch(imageUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!response.ok) {
          throw new Error(`Failed to load image: ${response.status}`);
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (isMounted) {
          setBlobUrl(objectUrl);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Failed to load image'));
          setIsLoading(false);
        }
      }
    }

    fetchImage();

    // Cleanup: revoke blob URL when component unmounts or imageUrl changes
    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [imageUrl]);

  return { blobUrl, isLoading, error };
}
