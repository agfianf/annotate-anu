
import { ImageOff, Loader2 } from 'lucide-react';
import { useAuthenticatedImage } from '../../hooks/useAuthenticatedImage';

interface FullscreenImageProps {
  src: string | null;
  alt: string;
  className?: string;
}

export function FullscreenImage({ src, alt, className = '' }: FullscreenImageProps) {
  const { blobUrl, isLoading, error } = useAuthenticatedImage(src);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className={`flex flex-col items-center justify-center text-gray-400 ${className}`}>
        <ImageOff className="w-8 h-8 mb-2" />
        <p className="text-sm">Failed to load image</p>
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
    />
  );
}
