import { useState, useRef, type ReactNode } from 'react'
import { ColorPickerPopup } from './ColorPickerPopup'

interface ColorBorderWrapperProps {
  /** Current color for the border */
  color: string
  /** Callback when color changes */
  onColorChange: (color: string) => void
  /** Title to display in the color picker popup */
  title: string
  /** Children to wrap */
  children: ReactNode
  /** Additional className for the container */
  className?: string
}

export function ColorBorderWrapper({
  color,
  onColorChange,
  title,
  children,
  className = '',
}: ColorBorderWrapperProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const borderRef = useRef<HTMLDivElement>(null)

  const handleBorderClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsPickerOpen(true)
  }

  const handleColorChange = (newColor: string) => {
    onColorChange(newColor)
  }

  const handleClose = () => {
    setIsPickerOpen(false)
  }

  return (
    <div className={`relative ${className}`}>
      {/* Clickable color border */}
      <div
        ref={borderRef}
        className="absolute left-0 top-0 bottom-0 cursor-pointer transition-all duration-150 rounded-l-sm"
        style={{
          width: isHovered || isPickerOpen ? '8px' : '3px',
          backgroundColor: color,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleBorderClick}
        title={`Click to change ${title.toLowerCase()} color`}
      />

      {/* Content with padding for border */}
      <div
        className="transition-all duration-150"
        style={{
          paddingLeft: isHovered || isPickerOpen ? '12px' : '7px',
        }}
      >
        {children}
      </div>

      {/* Color Picker Popup */}
      <ColorPickerPopup
        selectedColor={color}
        onColorChange={handleColorChange}
        isOpen={isPickerOpen}
        onClose={handleClose}
        anchorEl={borderRef.current}
        title={title}
      />
    </div>
  )
}
