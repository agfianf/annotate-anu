/**
 * LabelDropdownCell Component
 * Inline dropdown for changing annotation label in the table
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { LabelDropdownCellProps } from './types';

export function LabelDropdownCell({ row, labels, onLabelChange }: LabelDropdownCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calculate dropdown position
  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleScroll = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, updatePosition]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(!isOpen);
  };

  const handleSelect = (labelId: string) => {
    if (labelId !== row.labelId) {
      onLabelChange(row.id, labelId);
    }
    setIsOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="
          flex items-center gap-1.5 px-2 py-1 rounded
          text-left text-xs w-full max-w-[100px]
          hover:bg-gray-100 transition-colors
          border border-transparent hover:border-gray-200
        "
        title={`Label: ${row.labelName} (click to change)`}
      >
        {/* Color swatch */}
        <div
          className="w-3 h-3 rounded flex-shrink-0"
          style={{ backgroundColor: row.labelColor }}
        />
        {/* Label name */}
        <span className="truncate flex-1 text-gray-700">{row.labelName}</span>
        {/* Chevron */}
        <ChevronDown className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown portal */}
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="
            fixed z-[9999] min-w-[140px] max-w-[200px] max-h-[240px]
            bg-white border border-gray-200 rounded-lg shadow-lg
            overflow-y-auto
            animate-in fade-in-0 zoom-in-95 duration-150
          "
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
          }}
        >
          <div className="py-1">
            {labels.map((label) => {
              const isSelected = label.id === row.labelId;

              return (
                <button
                  key={label.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(label.id);
                  }}
                  className={`
                    w-full px-3 py-2 flex items-center gap-2 text-left text-sm
                    transition-colors
                    ${isSelected
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-gray-700 hover:bg-gray-50'
                    }
                  `}
                >
                  {/* Color swatch */}
                  <div
                    className="w-3 h-3 rounded flex-shrink-0"
                    style={{ backgroundColor: label.color }}
                  />
                  {/* Label name */}
                  <span className="truncate flex-1">{label.name}</span>
                  {/* Check mark for selected */}
                  {isSelected && (
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default LabelDropdownCell;
