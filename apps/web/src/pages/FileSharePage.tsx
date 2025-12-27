import { FileExplorer } from '@/features/file-explorer'
import toast from 'react-hot-toast'

export default function FileSharePage() {
  const handleSelect = (paths: string[]) => {
    if (paths.length === 0) {
      toast.error('No files selected')
      return
    }
    toast.success(`Selected ${paths.length} file(s)`)
    console.log('Selected paths:', paths)
  }

  return (
    <div className="p-6 h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          File Share
        </h1>
        <p className="text-gray-500 mt-1">
          Browse and manage shared files on the server
        </p>
      </div>

      <div className="h-[calc(100vh-200px)]">
        <FileExplorer
          onSelect={handleSelect}
          selectionMode="multiple"
          showUpload={true}
        />
      </div>
    </div>
  )
}
