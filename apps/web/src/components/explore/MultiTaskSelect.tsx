/**
 * Multi-select dropdown for filtering by multiple tasks
 */

import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

interface Task {
  id: number;
  name: string;
}

interface MultiTaskSelectProps {
  tasks: Task[];
  selectedTaskIds: number[];
  onChange: (taskIds: number[]) => void;
  placeholder?: string;
}

export function MultiTaskSelect({
  tasks,
  selectedTaskIds,
  onChange,
  placeholder = 'All Tasks',
}: MultiTaskSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleTask = (taskId: number) => {
    if (selectedTaskIds.includes(taskId)) {
      onChange(selectedTaskIds.filter((id) => id !== taskId));
    } else {
      onChange([...selectedTaskIds, taskId]);
    }
  };

  const handleClearAll = () => {
    onChange([]);
    setIsOpen(false);
  };

  const getDisplayText = () => {
    if (selectedTaskIds.length === 0) return placeholder;
    if (selectedTaskIds.length === 1) {
      const task = tasks.find((t) => t.id === selectedTaskIds[0]);
      return task?.name || '1 task';
    }
    return `${selectedTaskIds.length} tasks`;
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`appearance-none pl-3 pr-8 py-2 rounded-lg border bg-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm flex items-center gap-2 min-w-[140px] ${
          selectedTaskIds.length > 0
            ? 'border-emerald-300 text-emerald-700'
            : 'border-gray-200 text-gray-700'
        }`}
      >
        <span className="truncate">{getDisplayText()}</span>
        <ChevronDown
          className={`absolute right-2 w-4 h-4 text-gray-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-lg border border-gray-200 z-50 min-w-[220px] py-1 max-h-64 overflow-y-auto">
          {/* All Tasks option */}
          <button
            type="button"
            onClick={handleClearAll}
            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ${
              selectedTaskIds.length === 0 ? 'text-emerald-600 font-medium' : 'text-gray-700'
            }`}
          >
            <div
              className={`w-4 h-4 rounded border flex items-center justify-center ${
                selectedTaskIds.length === 0
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'border-gray-300'
              }`}
            >
              {selectedTaskIds.length === 0 && <Check className="w-3 h-3 text-white" />}
            </div>
            {placeholder}
          </button>

          {tasks.length > 0 && <hr className="my-1 border-gray-100" />}

          {/* Task list */}
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => handleToggleTask(task.id)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
            >
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  selectedTaskIds.includes(task.id)
                    ? 'bg-emerald-500 border-emerald-500'
                    : 'border-gray-300'
                }`}
              >
                {selectedTaskIds.includes(task.id) && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="truncate">{task.name}</span>
            </button>
          ))}

          {tasks.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">No tasks available</div>
          )}

          {/* Clear selection footer */}
          {selectedTaskIds.length > 0 && (
            <>
              <hr className="my-1 border-gray-100" />
              <button
                type="button"
                onClick={handleClearAll}
                className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Clear selection
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
