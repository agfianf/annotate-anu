import { memo } from 'react'
import { ChevronRight, Home } from 'lucide-react'

interface BreadcrumbNavProps {
  currentPath: string
  onNavigate: (path: string) => void
}

export const BreadcrumbNav = memo(function BreadcrumbNav({
  currentPath,
  onNavigate,
}: BreadcrumbNavProps) {
  const parts = currentPath ? currentPath.split('/').filter(Boolean) : []

  const handleClick = (index: number) => {
    const path = parts.slice(0, index + 1).join('/')
    onNavigate(path)
  }

  return (
    <nav className="flex items-center gap-1 px-3 py-2 bg-gray-50 border-b border-gray-200 text-sm">
      <button
        onClick={() => onNavigate('')}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-200 text-gray-600"
      >
        <Home className="w-4 h-4" />
        <span>Root</span>
      </button>

      {parts.map((part, index) => (
        <span key={index} className="flex items-center">
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <button
            onClick={() => handleClick(index)}
            className={`
              px-2 py-1 rounded
              ${
                index === parts.length - 1
                  ? 'font-medium text-gray-900'
                  : 'hover:bg-gray-200 text-gray-600'
              }
            `}
          >
            {part}
          </button>
        </span>
      ))}
    </nav>
  )
})
