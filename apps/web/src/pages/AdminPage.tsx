/**
 * Admin Page
 * User management with TanStack Table, toggle for status, and user overview panel
 */

import { Loader2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { User } from '@/lib/api-client';
import { adminApi } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import UsersTable from '@/components/admin/UsersTable';
import UserOverviewPanel from '@/components/admin/UserOverviewPanel';
import { useUserActivity } from '@/hooks/useUserActivity';

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Fetch user activity when a user is selected
  const {
    data: userActivity,
    isLoading: isLoadingActivity,
  } = useUserActivity(selectedUser?.id || null, {
    enabled: !!selectedUser && isPanelOpen,
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await adminApi.listUsers();
      setUsers(data);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      toast.error(axiosError.response?.data?.detail || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserClick = (user: User) => {
    setSelectedUser(user);
    setIsPanelOpen(true);
  };

  const handleClosePanel = () => {
    setIsPanelOpen(false);
    // Delay clearing selected user to allow animation to complete
    setTimeout(() => setSelectedUser(null), 300);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingUserId(userId);
    try {
      const updated = await adminApi.updateUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      // Update selected user if it's the one being modified
      if (selectedUser?.id === userId) {
        setSelectedUser(updated);
      }
      toast.success('Role updated');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      toast.error(axiosError.response?.data?.detail || 'Failed to update role');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    setUpdatingUserId(userId);
    try {
      const updated = await adminApi.toggleUserActive(userId, !currentActive);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      // Update selected user if it's the one being modified
      if (selectedUser?.id === userId) {
        setSelectedUser(updated);
      }
      toast.success(updated.is_active ? 'User activated' : 'User deactivated');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      toast.error(axiosError.response?.data?.detail || 'Failed to toggle active');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDelete = async (userId: string, username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"? This cannot be undone.`)) {
      return;
    }

    setUpdatingUserId(userId);
    try {
      await adminApi.deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      // Close panel if deleted user was selected
      if (selectedUser?.id === userId) {
        handleClosePanel();
      }
      toast.success('User deleted');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      toast.error(axiosError.response?.data?.detail || 'Failed to delete user');
    } finally {
      setUpdatingUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="w-7 h-7" />
          User Management
        </h1>
        <span className="text-gray-500 text-sm">{users.length} users</span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        </div>
      ) : (
        <UsersTable
          users={users}
          currentUserId={currentUser?.id || ''}
          onUserClick={handleUserClick}
          onRoleChange={handleRoleChange}
          onToggleActive={handleToggleActive}
          onDelete={handleDelete}
          updatingUserId={updatingUserId}
        />
      )}

      {/* User Overview Panel */}
      {selectedUser && (
        <UserOverviewPanel
          user={selectedUser}
          activity={userActivity || null}
          isLoadingActivity={isLoadingActivity}
          currentUserId={currentUser?.id || ''}
          isOpen={isPanelOpen}
          onClose={handleClosePanel}
          onRoleChange={handleRoleChange}
          onDelete={handleDelete}
          isUpdating={updatingUserId === selectedUser.id}
        />
      )}
    </div>
  );
}
