import type { ImageData, Label, PromptMode, Tool } from '@/types/annotations'
import type { AvailableModel } from '@/types/byom'
import { Keyboard, Maximize2, MousePointer, Pentagon, Redo, Square, Undo, ZoomIn, ZoomOut } from 'lucide-react'
import { useState } from 'react'
import { AutoDetectPanel } from './AutoDetectPanel'
import { BboxPromptPanel } from './BboxPromptPanel'
import { ClassificationPanel } from './ClassificationPanel'
import { TextPromptPanel } from './TextPromptPanel'
import { ToolButton } from './ui/ToolButton'

interface LeftSidebarProps {
  selectedTool: Tool
  onToolChange: (tool: Tool) => void
  labels: Label[]
  selectedLabelId: string | null
  onSelectLabel?: (labelId: string) => void
  currentImage: ImageData | null
  images: ImageData[]
  promptMode: PromptMode
  setPromptMode: (mode: PromptMode) => void
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
  onTextPromptChange?: (prompt: string) => void
  promptBboxes?: Array<{ x: number; y: number; width: number; height: number; id: string; labelId: string }>
  onPromptBboxesChange?: (bboxes: Array<{ x: number; y: number; width: number; height: number; id: string; labelId: string }>) => void
  currentAnnotations?: any[]
  onAutoApplyLoadingChange?: (loading: boolean) => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  onAutofit?: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  onShowShortcuts?: () => void
  selectedModel: AvailableModel
}

type ActiveTool = 'text-prompt' | 'bbox-prompt' | 'auto-detect' | 'classify' | null

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

// Custom icon for Auto-Detect tool
function AutoDetectIcon({ className }: { className?: string }) {
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
      {/* Target/crosshair with sparkle */}
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  )
}

// Custom icon for Classification tool
function ClassifyIcon({ className }: { className?: string }) {
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
      {/* Tags/labels pattern */}
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  )
}

export function LeftSidebar({
  selectedTool,
  onToolChange,
  labels,
  selectedLabelId,
  onSelectLabel,
  currentImage,
  images,
  promptMode,
  setPromptMode,
  onAnnotationsCreated,
  onBboxPromptModeChange,
  onAIPanelActiveChange,
  onTextPromptChange,
  promptBboxes = [],
  onPromptBboxesChange,
  currentAnnotations = [],
  onAutoApplyLoadingChange,
  onZoomIn,
  onZoomOut,
  onAutofit,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onShowShortcuts,
  selectedModel,
}: LeftSidebarProps) {
  const [activeTool, setActiveTool] = useState<ActiveTool>(null)

  // No longer needed - ToolButton component handles everything
  // const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [...]

  const handleToolClick = (tool: ActiveTool) => {
    // If clicking a different AI tool, switch to it (mutual exclusion)
    // If clicking the same AI tool, deactivate it (toggle)
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

    // Clear bbox prompts when switching away from bbox-prompt
    if (activeTool === 'bbox-prompt' && newActiveTool !== 'bbox-prompt') {
      if (onPromptBboxesChange) {
        onPromptBboxesChange([])
      }
    }

    // Auto-switch to rectangle tool when bbox-prompt is activated
    if (newActiveTool === 'bbox-prompt') {
      onToolChange('rectangle')
    }

    // Switch to select tool when text-prompt is activated (deactivate manual tools)
    if (newActiveTool === 'text-prompt') {
      onToolChange('select')
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
    <div className="flex border-r border-gray-200">
      {/* Icon Bar */}
      <div className="w-16 glass flex flex-col items-center py-4 gap-2 border-r border-gray-200">
        {/* Manual Annotation Tools */}
        <ToolButton
          icon={<MousePointer className="w-5 h-5" />}
          tooltipTitle="Select"
          tooltipDescription="Select annotations or drag to move them around the canvas"
          shortcut="V"
          onClick={() => {
            // Close bbox-prompt panel when manually switching to select
            if (activeTool === 'bbox-prompt') {
              setActiveTool(null)
              if (onAIPanelActiveChange) onAIPanelActiveChange(false)
              if (onBboxPromptModeChange) onBboxPromptModeChange(false)
              if (onPromptBboxesChange) onPromptBboxesChange([])
            }
            onToolChange('select')
          }}
          isActive={selectedTool === 'select'}
          activeColor="emerald"
        />

        <ToolButton
          icon={<Square className="w-5 h-5" />}
          tooltipTitle="Rectangle"
          tooltipDescription="Click and drag to draw rectangular bounding boxes for object annotation"
          shortcut="R"
          onClick={() => {
            // Close AI panels when manually switching to rectangle
            if (activeTool === 'text-prompt') {
              setActiveTool(null)
              if (onAIPanelActiveChange) onAIPanelActiveChange(false)
            }
            if (activeTool === 'bbox-prompt') {
              setActiveTool(null)
              if (onAIPanelActiveChange) onAIPanelActiveChange(false)
              if (onBboxPromptModeChange) onBboxPromptModeChange(false)
              if (onPromptBboxesChange) onPromptBboxesChange([])
            }
            onToolChange('rectangle')
          }}
          isActive={selectedTool === 'rectangle'}
          activeColor="emerald"
          showLabelSelector={true}
          labels={labels}
          selectedLabelId={selectedLabelId}
          onSelectLabel={onSelectLabel}
        />

        <ToolButton
          icon={<Pentagon className="w-5 h-5" />}
          tooltipTitle="Polygon"
          tooltipDescription="Click multiple points to draw custom polygon shapes around objects"
          shortcut="P"
          onClick={() => {
            // Close any AI panel when switching to polygon
            if (activeTool !== null) {
              setActiveTool(null)
              if (onAIPanelActiveChange) onAIPanelActiveChange(false)
              if (onBboxPromptModeChange) onBboxPromptModeChange(false)
              if (onPromptBboxesChange) onPromptBboxesChange([])
            }
            onToolChange('polygon')
          }}
          isActive={selectedTool === 'polygon'}
          activeColor="emerald"
          showLabelSelector={true}
          labels={labels}
          selectedLabelId={selectedLabelId}
          onSelectLabel={onSelectLabel}
          disabled={activeTool === 'bbox-prompt'}
        />

        <div className="w-full h-px bg-gray-300 my-2" />

        {/* AI-Powered Tools */}
        <ToolButton
          icon={<TextPromptIcon className="w-5 h-5" />}
          tooltipTitle="Text Prompt"
          tooltipDescription={
            selectedModel?.capabilities.supports_text_prompt
              ? "AI generates segmentation masks from text descriptions (e.g., 'person', 'car', 'tree')"
              : `${selectedModel?.name || 'Selected model'} does not support text prompts`
          }
          onClick={() => handleToolClick('text-prompt')}
          isActive={activeTool === 'text-prompt'}
          activeColor="purple"
          disabled={!selectedModel?.capabilities.supports_text_prompt}
        />

        <ToolButton
          icon={<BboxPromptIcon className="w-5 h-5" />}
          tooltipTitle="Bbox Prompt"
          tooltipDescription={
            selectedModel?.capabilities.supports_bbox_prompt
              ? "Draw bounding boxes to prompt AI for precise object segmentation. Supports single, auto-apply, and batch modes"
              : `${selectedModel?.name || 'Selected model'} does not support bbox prompts`
          }
          onClick={() => handleToolClick('bbox-prompt')}
          isActive={activeTool === 'bbox-prompt'}
          activeColor="blue"
          disabled={!selectedModel?.capabilities.supports_bbox_prompt}
        />

        <ToolButton
          icon={<AutoDetectIcon className="w-5 h-5" />}
          tooltipTitle="Auto-Detect"
          tooltipDescription={
            selectedModel?.capabilities.supports_auto_detect
              ? "Automatically detect all objects in the image without prompts"
              : `${selectedModel?.name || 'Selected model'} does not support auto-detection`
          }
          onClick={() => handleToolClick('auto-detect')}
          isActive={activeTool === 'auto-detect'}
          activeColor="orange"
          disabled={!selectedModel?.capabilities.supports_auto_detect}
        />

        <ToolButton
          icon={<ClassifyIcon className="w-5 h-5" />}
          tooltipTitle="Classify"
          tooltipDescription={
            selectedModel?.capabilities.supports_classification
              ? "Classify the entire image into categories"
              : `${selectedModel?.name || 'Selected model'} does not support classification`
          }
          onClick={() => handleToolClick('classify')}
          isActive={activeTool === 'classify'}
          activeColor="violet"
          disabled={!selectedModel?.capabilities.supports_classification}
        />

        {/* Spacer to push controls to bottom */}
        <div className="flex-1" />

        <div className="w-full h-px bg-gray-300 my-2" />

        {/* View Controls */}
        <ToolButton
          icon={<ZoomIn className="w-5 h-5" />}
          tooltipTitle="Zoom In"
          tooltipDescription="Zoom into the canvas to see more detail"
          shortcut="+"
          onClick={() => onZoomIn?.()}
          disabled={!onZoomIn}
        />

        <ToolButton
          icon={<ZoomOut className="w-5 h-5" />}
          tooltipTitle="Zoom Out"
          tooltipDescription="Zoom out to see more of the canvas"
          shortcut="-"
          onClick={() => onZoomOut?.()}
          disabled={!onZoomOut}
        />

        <ToolButton
          icon={<Maximize2 className="w-5 h-5" />}
          tooltipTitle="Autofit"
          tooltipDescription="Fit the entire image to the screen viewport"
          shortcut="Ctrl+0"
          onClick={() => onAutofit?.()}
          disabled={!onAutofit}
        />

        <div className="w-full h-px bg-gray-300 my-2" />

        {/* History Controls */}
        <ToolButton
          icon={<Undo className="w-5 h-5" />}
          tooltipTitle="Undo"
          tooltipDescription="Undo your last annotation change"
          shortcut="Ctrl+Z"
          onClick={() => onUndo?.()}
          disabled={!canUndo || !onUndo}
        />

        <ToolButton
          icon={<Redo className="w-5 h-5" />}
          tooltipTitle="Redo"
          tooltipDescription="Redo the previously undone change"
          shortcut="Ctrl+Shift+Z"
          onClick={() => onRedo?.()}
          disabled={!canRedo || !onRedo}
        />

        <div className="w-full h-px bg-gray-300 my-2" />

        {/* Help */}
        <ToolButton
          icon={<Keyboard className="w-5 h-5" />}
          tooltipTitle="Shortcuts"
          tooltipDescription="View all available keyboard shortcuts and hotkeys"
          shortcut="?"
          onClick={() => onShowShortcuts?.()}
          disabled={!onShowShortcuts}
        />
      </div>

      {/* Panel Area */}
      {activeTool && (
        <div className="w-80 glass-strong overflow-y-auto">
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
              onTextPromptChange={onTextPromptChange}
              selectedModel={selectedModel}
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
              selectedModel={selectedModel}
            />
          )}
          {activeTool === 'auto-detect' && (
            <AutoDetectPanel
              labels={labels}
              selectedLabelId={selectedLabelId}
              currentImage={currentImage}
              onAnnotationsCreated={onAnnotationsCreated}
              onClose={handlePanelClose}
              selectedModel={selectedModel}
            />
          )}
          {activeTool === 'classify' && (
            <ClassificationPanel
              currentImage={currentImage}
              onClose={handlePanelClose}
              selectedModel={selectedModel}
            />
          )}
        </div>
      )}
    </div>
  )
}
