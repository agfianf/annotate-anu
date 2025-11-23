import { MousePointer, Square, Pentagon, Upload } from 'lucide-react'
import type { Tool } from '../types/annotations'

interface ToolbarProps {
  selectedTool: Tool
  onToolChange: (tool: Tool) => void
  onImageUpload: (files: FileList) => void
}

export default function Toolbar({ selectedTool, onToolChange, onImageUpload }: ToolbarProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      onImageUpload(files)
    }
  }

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'select', icon: <MousePointer className="w-5 h-5" />, label: 'Select' },
    { id: 'rectangle', icon: <Square className="w-5 h-5" />, label: 'Rectangle' },
    { id: 'polygon', icon: <Pentagon className="w-5 h-5" />, label: 'Polygon' },
  ]

  return (
    <div className="w-16 bg-gray-800 border-r border-gray-700 flex flex-col items-center py-4 gap-2">
      {/* Image Upload */}
      <label className="cursor-pointer p-3 rounded hover:bg-gray-700 transition-colors" title="Upload Images">
        <Upload className="w-5 h-5 text-gray-300" />
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </label>

      <div className="w-full h-px bg-gray-700 my-2" />

      {/* Tools */}
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onToolChange(tool.id)}
          className={`
            p-3 rounded transition-colors
            ${selectedTool === tool.id
              ? 'bg-orange-600 text-white'
              : 'text-gray-300 hover:bg-gray-700'
            }
          `}
          title={tool.label}
        >
          {tool.icon}
        </button>
      ))}
    </div>
  )
}
