/**
 * SplitDropdown Component
 * Dropdown for changing task split category
 */

import { useState } from 'react';
import GlassDropdown, { type DropdownOption } from '../ui/GlassDropdown';
import type { Split, SplitDropdownProps } from './types';

// Split options for dropdown
const SPLIT_OPTIONS: DropdownOption[] = [
  { value: 'null', label: 'Unassigned', sublabel: 'No split assigned' },
  { value: 'train', label: 'Train', sublabel: 'Training dataset' },
  { value: 'val', label: 'Validation', sublabel: 'Validation dataset' },
  { value: 'test', label: 'Test', sublabel: 'Test dataset' },
];

/**
 * Convert Split type to string for dropdown
 */
function splitToString(split: Split): string {
  return split === null ? 'null' : split;
}

/**
 * Convert string from dropdown to Split type
 */
function stringToSplit(value: string): Split {
  return value === 'null' ? null : (value as 'train' | 'val' | 'test');
}

export default function SplitDropdown({ value, onChange, disabled = false }: SplitDropdownProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = async (newValue: string) => {
    const newSplit = stringToSplit(newValue);

    // Don't trigger if unchanged
    if (newSplit === value) return;

    setIsLoading(true);
    try {
      await onChange(newSplit);
    } catch (err) {
      console.error('Failed to change split:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <GlassDropdown
      options={SPLIT_OPTIONS}
      value={splitToString(value)}
      onChange={handleChange}
      disabled={disabled}
      isLoading={isLoading}
      placeholder="Select split"
      className="text-sm"
    />
  );
}
