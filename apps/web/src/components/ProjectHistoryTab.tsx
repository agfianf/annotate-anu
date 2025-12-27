/**
 * ProjectHistoryTab Component
 * Shows export history for the project
 */

import { Download } from 'lucide-react';
import { ExportHistoryPanel } from './export/ExportHistoryPanel';

interface ProjectHistoryTabProps {
  projectId: string;
}

export default function ProjectHistoryTab({ projectId }: ProjectHistoryTabProps) {
  return (
    <div className="space-y-6">
      {/* Export History Section */}
      <div className="glass-strong rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 flex items-center gap-2 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
          <Download className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">Export History</h2>
        </div>
        <div className="p-6">
          <ExportHistoryPanel projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
