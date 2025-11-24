import { useState } from 'react'
import { Upload, MousePointer, Square, Pentagon } from 'lucide-react'
import { TextPromptPanel } from './TextPromptPanel'
import { BboxPromptPanel } from './BboxPromptPanel'
import type { Label, ImageData, Tool, PromptMode } from '@/types/annotations'

interface LeftSidebarProps {
  selectedTool: Tool
  onToolChange: (tool: Tool) => void
  labels: Label[]
  selectedLabelId: string | null
  currentImage: ImageData | null
  images: ImageData[]
  promptMode: PromptMode
  setPromptMode: (mode: PromptMode) => void
  onImageUpload: (files: FileList) => void
  onAnnotationsCreated: (results: {
    boxes: Array<[number, number, number, number]>
    masks: Array<{ polygons: Array<Array<[number, number]>>; area: number }>
    scores: number[]
    annotationType: 'bbox' | 'polygon'
    labelId?: string
    imageId?: string
  }) => void
  onBboxPromptModeChange?: (enabled: boolean) => void
  onAIPanelActiveChange?: (active: boolean) => void
  promptBboxes?: Array<{ x: number; y: number; width: number; height: number; id: string; labelId: string }>
  onPromptBboxesChange?: (bboxes: Array<{ x: number; y: number; width: number; height: number; id: string; labelId: string }>) => void
  currentAnnotations?: any[]
  onAutoApplyLoadingChange?: (loading: boolean) => void
}

type ActiveTool = 'text-prompt' | 'bbox-prompt' | null

// Custom icon for Text-Prompt tool
function TextPromptIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Sparkle/wand with text lines */}
      <path d="M3 12h8M3 8h8M3 16h8" />
      <path d="M15 4l1.5 3.5L20 9l-3.5 1.5L15 14l-1.5-3.5L10 9l3.5-1.5L15 4z" />
      <path d="M19 16l0.75 1.75L21.5 18.5l-1.75 0.75L19 21l-0.75-1.75L16.5 18.5l1.75-0.75L19 16z" />
    </svg>
  )
}

// Custom icon for Bbox-Prompt tool
function BboxPromptIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Square with sparkles */}
      <rect x="3" y="3" width="12" height="12" />
      <path d="M18 6l0.75 1.5L20.25 8.25l-1.5 0.75L18 10.5l-0.75-1.5L15.75 8.25l1.5-0.75L18 6z" />
      <path d="M20 16l0.5 1L21.5 17.5l-1 0.5L20 19l-0.5-1L18.5 17.5l1-0.5L20 16z" />
    </svg>
  )
}

export function LeftSidebar({
  selectedTool,
  onToolChange,
  labels,
  selectedLabelId,
  currentImage,
  images,
  promptMode,
  setPromptMode,
  onImageUpload,
  onAnnotationsCreated,
  onBboxPromptModeChange,
  onAIPanelActiveChange,
  promptBboxes = [],
  onPromptBboxesChange,
  currentAnnotations = [],
  onAutoApplyLoadingChange,
}: LeftSidebarProps) {
  const [activeTool, setActiveTool] = useState<ActiveTool>(null)

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'select', icon: <MousePointer className="w-5 h-5" />, label: 'Select' },
    { id: 'rectangle', icon: <Square className="w-5 h-5" />, label: 'Rectangle' },
    { id: 'polygon', icon: <Pentagon className="w-5 h-5" />, label: 'Polygon' },
  ]

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      onImageUpload(files)
    }
  }

  const handleToolClick = (tool: ActiveTool) => {
    const newActiveTool = activeTool === tool ? null : tool
    setActiveTool(newActiveTool)

    // Notify parent about bbox-prompt mode change
    if (onBboxPromptModeChange) {
      onBboxPromptModeChange(newActiveTool === 'bbox-prompt')
    }

    // Notify parent about AI panel active state
    if (onAIPanelActiveChange) {
      onAIPanelActiveChange(newActiveTool !== null)
    }

    // Auto-switch to rectangle tool when bbox-prompt is activated
    if (newActiveTool === 'bbox-prompt') {
      onToolChange('rectangle')
    }
  }

  const handlePanelClose = () => {
    setActiveTool(null)
    if (onAIPanelActiveChange) {
      onAIPanelActiveChange(false)
    }
    if (onBboxPromptModeChange) {
      onBboxPromptModeChange(false)
    }
    if (onPromptBboxesChange) {
      onPromptBboxesChange([])
    }
  }

  return (
    <div className="flex border-r border-gray-700">
      {/* Icon Bar */}
      <div className="w-16 bg-gray-800 flex flex-col items-center py-4 gap-2 border-r border-gray-700">
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

        {/* Manual Annotation Tools */}
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

        <div className="w-full h-px bg-gray-700 my-2" />

        {/* Text-Prompt Tool */}
        <button
          onClick={() => handleToolClick('text-prompt')}
          className={`
            p-3 rounded transition-colors
            ${activeTool === 'text-prompt'
              ? 'bg-purple-600 text-white'
              : 'text-gray-300 hover:bg-gray-700'
            }
          `}
          title="Text-Prompt Automate"
        >
          <TextPromptIcon className="w-5 h-5" />
        </button>

        {/* Bbox-Prompt Tool */}
        <button
          onClick={() => handleToolClick('bbox-prompt')}
          className={`
            p-3 rounded transition-colors
            ${activeTool === 'bbox-prompt'
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:bg-gray-700'
            }
          `}
          title="Bbox-Prompt Automate"
        >
          <BboxPromptIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Panel Area */}
      {activeTool && (
        <div className="w-80 bg-gray-800 overflow-y-auto">
          {activeTool === 'text-prompt' && (
            <TextPromptPanel
              labels={labels}
              selectedLabelId={selectedLabelId}
              currentImage={currentImage}
              images={images}
              promptMode={promptMode}
              setPromptMode={setPromptMode}
              onAnnotationsCreated={onAnnotationsCreated}
              onClose={handlePanelClose}
              currentAnnotations={currentAnnotations}
              onLoadingChange={onAutoApplyLoadingChange}
            />
          )}
          {activeTool === 'bbox-prompt' && (
            <BboxPromptPanel
              labels={labels}
              selectedLabelId={selectedLabelId}
              currentImage={currentImage}
              images={images}
              promptMode={promptMode}
              setPromptMode={setPromptMode}
              onAnnotationsCreated={onAnnotationsCreated}
              onClose={handlePanelClose}
              promptBboxes={promptBboxes}
              onPromptBboxesChange={onPromptBboxesChange}
            />
          )}
        </div>
      )}
    </div>
  )
}
