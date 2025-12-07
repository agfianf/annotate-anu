/**
 * AssigneeDropdown Component
 * A beautiful, reusable dropdown for selecting assignees from project members
 */

import {
    Check,
    ChevronDown,
    Loader2,
    User,
    UserCircle,
    Users,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MemberUserInfo, ProjectMember } from '../lib/api-client';
import { membersApi } from '../lib/api-client';

interface AssigneeDropdownProps {
  projectId: string;
  value: string | null;
  onChange: (userId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showClear?: boolean;
  assignedUser?: MemberUserInfo | null;
}

// Mock user data for members (in real implementation, member.user would be populated)
const getMemberDisplayName = (member: ProjectMember): string => {
  if (member.user) {
    return member.user.full_name || member.user.username || member.user.email;
  }
  return `Member ${member.user_id.slice(0, 8)}`;
};

const getMemberInitials = (member: ProjectMember): string => {
  const name = getMemberDisplayName(member);
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

const getRoleColor = (role: string): string => {
  switch (role) {
    case 'maintainer':
      return 'bg-purple-100 text-purple-700';
    case 'annotator':
      return 'bg-blue-100 text-blue-700';
    case 'viewer':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

export default function AssigneeDropdown({
  projectId,
  value,
  onChange,
  placeholder = 'Select assignee',
  disabled = false,
  size = 'md',
  showClear = true,
  assignedUser,
}: AssigneeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  // Load members when dropdown opens
  useEffect(() => {
    if (isOpen && members.length === 0) {
      loadMembers();
    }
  }, [isOpen, projectId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setDropdownPosition(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    if (disabled) return;
    
    if (!isOpen && buttonRef.current) {
      // Calculate position BEFORE opening
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 280),
      });
    }
    setIsOpen(!isOpen);
    if (isOpen) {
      setDropdownPosition(null);
    }
  };

  const loadMembers = async () => {
    setIsLoading(true);
    try {
      const data = await membersApi.list(projectId);
      setMembers(data);
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      setIsLoading(false);
    }
  };

  let selectedMember = members.find(m => m.user_id === value);
  
  // Fallback: If member not found in list (e.g. list not loaded), use assignedUser info
  if (!selectedMember && value && assignedUser && assignedUser.id === value) {
     selectedMember = {
         id: 'temp',
         user_id: assignedUser.id,
         project_id: projectId,
         role: 'annotator', // fallback role, mainly for color
         allowed_task_ids: null,
         allowed_job_ids: null,
         created_at: new Date().toISOString(),
         updated_at: new Date().toISOString(),
         user: {
             id: assignedUser.id,
             username: assignedUser.username,
             email: '', // Not needed for display usually if full_name/username is there
             full_name: assignedUser.full_name,
             role: 'annotator',
             is_active: true,
             created_at: '',
         }
     } as ProjectMember;
  }

  const filteredMembers = members.filter(member => {
    if (!search) return true;
    const name = getMemberDisplayName(member).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const handleSelect = (userId: string) => {
    onChange(userId);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-sm',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base',
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        disabled={disabled}
        className={`
          ${sizeClasses[size]}
          w-full flex items-center justify-between gap-2
          rounded-xl border border-gray-200 bg-white
          hover:border-emerald-300 hover:bg-gray-50
          focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all
        `}
      >
        <div className="flex items-center gap-2 min-w-0">
          {selectedMember ? (
            <>
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                {getMemberInitials(selectedMember)}
              </div>
              <span className="text-gray-900 truncate">
                {getMemberDisplayName(selectedMember)}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium capitalize flex-shrink-0 ${getRoleColor(selectedMember.role)}`}>
                {selectedMember.role}
              </span>
            </>
          ) : (
            <>
              <UserCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <span className="text-gray-500">{placeholder}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {showClear && value && (
            <button
              onClick={handleClear}
              className="p-0.5 text-gray-400 hover:text-red-500 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && dropdownPosition && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
            zIndex: 9999,
          }}
          className="bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden"
        >
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                autoFocus
              />
            </div>
          </div>

          {/* Members List */}
          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="py-8 text-center">
                <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
                <p className="text-sm text-gray-500 mt-2">Loading members...</p>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="py-8 text-center">
                <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  {search ? 'No members found' : 'No members in project'}
                </p>
              </div>
            ) : (
              <div className="py-1">
                {filteredMembers.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => handleSelect(member.user_id)}
                    className={`
                      w-full px-3 py-2.5 flex items-center gap-3
                      hover:bg-emerald-50 transition-colors text-left
                      ${value === member.user_id ? 'bg-emerald-50' : ''}
                    `}
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                      {getMemberInitials(member)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {getMemberDisplayName(member)}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {member.user?.email || `ID: ${member.user_id.slice(0, 8)}...`}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getRoleColor(member.role)}`}>
                      {member.role}
                    </span>
                    {value === member.user_id && (
                      <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500 text-center">
              {members.length} member{members.length !== 1 ? 's' : ''} in project
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
