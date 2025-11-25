import React from 'react';
import { Modal } from './Modal';

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  title: string;
  shortcuts: ShortcutItem[];
}

const ShortcutsHelpModal: React.FC<ShortcutsHelpModalProps> = ({ isOpen, onClose }) => {
  const shortcutCategories: ShortcutCategory[] = [
    {
      title: '🛠️ Tool Selection',
      shortcuts: [
        { keys: ['V'], description: 'Select tool (pointer)' },
        { keys: ['R'], description: 'Rectangle tool' },
        { keys: ['P'], description: 'Polygon tool' },
        { keys: ['O'], description: 'Point tool' },
      ],
    },
    {
      title: '📝 Editing',
      shortcuts: [
        { keys: ['N'], description: 'New annotation (rectangle)' },
        { keys: ['Delete'], description: 'Delete selected annotation' },
        { keys: ['Backspace'], description: 'Delete selected annotation' },
        { keys: ['Escape'], description: 'Cancel current drawing' },
      ],
    },
    {
      title: '🖼️ Image Navigation',
      shortcuts: [
        { keys: ['F'], description: 'Next image' },
        { keys: ['D'], description: 'Previous image' },
      ],
    },
    {
      title: '↩️ History',
      shortcuts: [
        { keys: ['Ctrl', 'Z'], description: 'Undo' },
        { keys: ['⌘', 'Z'], description: 'Undo (Mac)' },
        { keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo' },
        { keys: ['⌘', 'Shift', 'Z'], description: 'Redo (Mac)' },
        { keys: ['Ctrl', 'Y'], description: 'Redo (alternative)' },
      ],
    },
    {
      title: '🔍 Zoom & View',
      shortcuts: [
        { keys: ['+'], description: 'Zoom in' },
        { keys: ['='], description: 'Zoom in (alternative)' },
        { keys: ['-'], description: 'Zoom out' },
        { keys: ['0'], description: 'Reset zoom to 100%' },
        { keys: ['Ctrl', '0'], description: 'Autofit (fit to screen)' },
        { keys: ['⌘', '0'], description: 'Autofit (Mac)' },
      ],
    },
    {
      title: '🎛️ UI Controls',
      shortcuts: [
        { keys: ['Ctrl', 'B'], description: 'Toggle annotations sidebar' },
        { keys: ['⌘', 'B'], description: 'Toggle annotations sidebar (Mac)' },
      ],
    },
    {
      title: '🎨 Canvas Interactions',
      shortcuts: [
        { keys: ['Space'], description: 'Pan mode (hold and drag)' },
        { keys: ['Shift'], description: 'Constrain proportions (hold while transforming)' },
        { keys: ['Ctrl'], description: 'Add point to polygon (hold and click edge)' },
        { keys: ['⌘'], description: 'Add point to polygon (Mac)' },
        { keys: ['Double-click'], description: 'Delete polygon point' },
      ],
    },
    {
      title: '❓ Help',
      shortcuts: [
        { keys: ['?'], description: 'Show this shortcuts help' },
      ],
    },
  ];

  const renderKeys = (keys: string[]) => {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {keys.map((key, index) => (
          <React.Fragment key={index}>
            {index > 0 && <span className="text-gray-600 text-xs">+</span>}
            <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-white/70 border border-gray-300 rounded shadow-sm min-w-[28px] text-center">
              {key}
            </kbd>
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Keyboard Shortcuts" maxWidth="2xl">
      <div className="space-y-6 p-4">
        {shortcutCategories.map((category, categoryIndex) => (
          <div key={categoryIndex}>
            <h3 className="text-sm font-semibold text-emerald-600 mb-3">{category.title}</h3>
            <div className="space-y-2">
              {category.shortcuts.map((shortcut, shortcutIndex) => (
                <div
                  key={shortcutIndex}
                  className="flex items-center justify-between py-2 px-3 rounded hover:bg-white/40 transition-colors"
                >
                  <span className="text-sm text-gray-800">{shortcut.description}</span>
                  {renderKeys(shortcut.keys)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200/50 mt-4 pt-4 px-4 pb-2">
        <p className="text-xs text-gray-700 text-center">
          Press <kbd className="px-1.5 py-0.5 text-xs bg-white/70 border border-gray-300 rounded text-gray-800">?</kbd> anytime to toggle this help
        </p>
      </div>
    </Modal>
  );
};

export default ShortcutsHelpModal;
