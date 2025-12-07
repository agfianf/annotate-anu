/**
 * ProjectExploreTab Component
 * Placeholder for image gallery/exploration feature (FiftyOne-like)
 */

import { Image, Sparkles, Tag } from 'lucide-react';

interface ProjectExploreTabProps {
  projectId: string;
}

export default function ProjectExploreTab({ projectId }: ProjectExploreTabProps) {
  return (
    <div className="glass-strong rounded-2xl shadow-lg p-12 text-center">
      <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Image className="w-10 h-10 text-emerald-600" />
      </div>
      
      <h3 className="text-xl font-semibold text-gray-800 mb-3">
        Explore &amp; Gallery
      </h3>
      
      <p className="text-gray-500 max-w-md mx-auto mb-8">
        This feature is coming soon! It will provide a FiftyOne-like experience for browsing, 
        filtering, and exploring your annotated images.
      </p>

      <div className="flex flex-wrap justify-center gap-4 text-sm">
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg text-gray-600">
          <Image className="w-4 h-4 text-gray-400" />
          Image Gallery View
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg text-gray-600">
          <Tag className="w-4 h-4 text-gray-400" />
          Smart Tagging
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg text-gray-600">
          <Sparkles className="w-4 h-4 text-gray-400" />
          Image Classification
        </div>
      </div>

      <div className="mt-8 p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
        <strong>Note:</strong> This tab will allow you to view images in a gallery format, 
        apply tags, and potentially run classification models. Stay tuned!
      </div>
    </div>
  );
}
