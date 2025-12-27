/**
 * GlassMultiSelect - Reusable glassmorphism multi-select dropdown component
 * Features liquid glass effect with smooth animations and multi-selection support
 */

import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ANIMATION_TIMINGS, SPRING_CONFIGS } from '@/lib/motion-config';

export interface MultiSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

interface GlassMultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
  emptyMessage?: string;
  maxDisplayItems?: number;
}

export default function GlassMultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select options',
  isLoading = false,
  disabled = false,
  className = '',
  emptyMessage = 'No options available',
  maxDisplayItems = 2,
}: GlassMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const selectedOptions = options.filter((opt) => value.includes(opt.value));

  // Handle opening with position calculation first
  const handleOpen = () => {
    if (disabled || isLoading) return;

    if (!isOpen && triggerRef.current) {
      // Calculate position BEFORE showing
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Close dropdown
  const handleClose = () => {
    setIsOpen(false);
  };

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Handle option toggle
  const handleToggle = (optionValue: string) => {
    const option = options.find((opt) => opt.value === optionValue);
    if (option?.disabled) return;

    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  // Remove a selected item
  const handleRemove = (optionValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== optionValue));
  };

  // Animation variants
  const dropdownVariants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        hidden: { opacity: 0, scale: 0.98, y: -8 },
        visible: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.98, y: -4 },
      };

  const optionVariants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      }
    : {
        hidden: { opacity: 0, x: -10 },
        visible: { opacity: 1, x: 0 },
      };

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: prefersReducedMotion ? 0 : 0.03,
        delayChildren: prefersReducedMotion ? 0 : 0.05,
      },
    },
  };

  const dropdownTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { ...SPRING_CONFIGS.responsive };

  // Render selected items display
  const renderSelectedDisplay = () => {
    if (isLoading) {
      return (
        <span className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading...
        </span>
      );
    }

    if (selectedOptions.length === 0) {
      return <span className="text-gray-400">{placeholder}</span>;
    }

    const displayItems = selectedOptions.slice(0, maxDisplayItems);
    const remainingCount = selectedOptions.length - maxDisplayItems;

    return (
      <div className="flex flex-wrap gap-1.5 items-center">
        {displayItems.map((opt) => (
          <span
            key={opt.value}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-md"
          >
            {opt.icon}
            {opt.label}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => handleRemove(opt.value, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleRemove(opt.value, e as unknown as React.MouseEvent);
                }
              }}
              className="hover:bg-emerald-200 rounded p-0.5 -mr-0.5 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </span>
          </span>
        ))}
        {remainingCount > 0 && (
          <span className="text-xs text-gray-500">+{remainingCount} more</span>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        disabled={disabled || isLoading}
        className={`
          w-full px-3 py-2 text-left min-h-[42px]
          border border-gray-200 rounded-lg
          bg-white/80 backdrop-blur-sm
          focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent
          disabled:bg-gray-100 disabled:cursor-not-allowed
          transition-all duration-200
          flex items-center justify-between gap-2
          hover:border-emerald-300 hover:bg-white/90
          ${isOpen ? 'ring-2 ring-emerald-500 border-transparent' : ''}
          ${className}
        `}
      >
        <div className="flex-1">{renderSelectedDisplay()}</div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : ANIMATION_TIMINGS.quick }}
        >
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        </motion.div>
      </button>

      {/* Dropdown Portal */}
      {createPortal(
        <AnimatePresence mode="wait">
          {isOpen && (
            <motion.div
              ref={dropdownRef}
              className="fixed z-[9999]"
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
              }}
              variants={dropdownVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={dropdownTransition}
            >
              <motion.div
                className="
                  py-1 rounded-xl overflow-hidden
                  bg-white/85 backdrop-blur-xl
                  border border-white/50
                  shadow-[0_8px_32px_rgba(0,0,0,0.12),0_0_0_1px_rgba(255,255,255,0.15)_inset]
                  max-h-[280px] overflow-y-auto
                "
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 100%)',
                }}
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {options.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-gray-400">{emptyMessage}</div>
                ) : (
                  options.map((option) => {
                    const isSelected = value.includes(option.value);
                    const isDisabled = option.disabled;
                    return (
                      <motion.button
                        key={option.value}
                        type="button"
                        onClick={() => handleToggle(option.value)}
                        disabled={isDisabled}
                        variants={optionVariants}
                        transition={{
                          duration: prefersReducedMotion ? 0.01 : ANIMATION_TIMINGS.quick,
                        }}
                        whileHover={
                          prefersReducedMotion || isDisabled
                            ? {}
                            : {
                                x: 4,
                                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                              }
                        }
                        className={`
                          w-full px-3 py-2.5 text-left
                          flex items-center gap-3
                          transition-colors duration-100
                          ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                          ${
                            isSelected
                              ? 'bg-emerald-500/10 text-emerald-700'
                              : 'text-gray-700'
                          }
                        `}
                      >
                        {/* Checkbox indicator with bounce animation */}
                        <div
                          className={`
                            w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0
                            transition-colors duration-150
                            ${
                              isSelected
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'border-gray-300'
                            }
                          `}
                        >
                          {isSelected && (
                            <motion.div
                              initial={prefersReducedMotion ? {} : { scale: 0, rotate: -180 }}
                              animate={{ scale: 1, rotate: 0 }}
                              transition={prefersReducedMotion ? {} : SPRING_CONFIGS.bouncy}
                            >
                              <Check className="w-3 h-3 text-white" />
                            </motion.div>
                          )}
                        </div>

                        {/* Option content */}
                        <div className="flex-1 flex items-center gap-2">
                          {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                          <div className="flex flex-col">
                            <span className="font-medium">{option.label}</span>
                            {option.sublabel && (
                              <span className={`text-xs mt-0.5 ${isSelected ? 'text-emerald-500' : 'text-gray-400'}`}>
                                {option.sublabel}
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
