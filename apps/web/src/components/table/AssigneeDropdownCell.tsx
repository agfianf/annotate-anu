/**
 * AssigneeDropdownCell Component
 * Dropdown cell for changing task assignee in the table
 */

import { useState } from 'react';
import AssigneeDropdown from '../AssigneeDropdown';
import type { MemberUserInfo } from '@/lib/api-client';

export interface AssigneeDropdownCellProps {
  projectId: string;
  taskId: number | string;
  assigneeId: string | null;
  assignee?: MemberUserInfo | null;
  onChange: (assigneeId: string | null) => Promise<void>;
  disabled?: boolean;
}

export default function AssigneeDropdownCell({
  projectId,
  taskId,
  assigneeId,
  assignee,
  onChange,
  disabled = false,
}: AssigneeDropdownCellProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = async (newAssigneeId: string | null) => {
    // Don't trigger if unchanged
    if (newAssigneeId === assigneeId) return;

    setIsLoading(true);
    try {
      await onChange(newAssigneeId);
    } catch (err) {
      console.error('Failed to change assignee:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      <AssigneeDropdown
        projectId={projectId}
        value={assigneeId}
        onChange={handleChange}
        disabled={disabled || isLoading}
        size="sm"
        showClear={true}
        assignedUser={assignee}
      />
    </div>
  );
}
