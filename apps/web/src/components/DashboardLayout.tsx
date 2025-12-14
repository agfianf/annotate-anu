/**
 * Dashboard Layout
 * White glassmorphism sidebar with emerald green accents
 */

import {
    Boxes,
    ChevronLeft,
    ChevronRight,
    HardDrive,
    Home,
    LogOut,
    Menu,
    User,
    Users,
    X,
} from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useExploreView } from '../contexts/ExploreViewContext';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Overview', icon: <Home className="w-4 h-4" /> },
  { path: '/dashboard/profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
  { path: '/dashboard/admin', label: 'Users', icon: <Users className="w-4 h-4" />, adminOnly: true },
  { path: '/dashboard/projects', label: 'Projects', icon: <Boxes className="w-4 h-4" /> },
  { path: '/dashboard/files', label: 'File Share', icon: <HardDrive className="w-4 h-4" /> },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { isFullView } = useExploreView();

  // Combine manual collapse state with full-view mode
  const effectiveCollapsed = isSidebarCollapsed || isFullView;

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      navigate('/');
    } catch {
      toast.error('Failed to logout');
    }
  };

  const filteredNavItems = navItems.filter(
    (item) => !item.adminOnly || user?.role === 'admin'
  );

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-50 glass border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="h-10 w-10" />
            <span className="font-bold text-emerald-600 text-xl">AnnotateANU</span>
          </Link>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-gray-600 hover:text-emerald-600"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <nav className="px-4 py-4 border-t border-gray-200 glass-strong">
            {filteredNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-all ${
                  isActive(item.path)
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'text-gray-600 hover:bg-emerald-50 hover:text-emerald-600'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all mt-4"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </nav>
        )}
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className={`hidden lg:flex flex-col min-h-screen glass border-r border-gray-200 sticky top-0 transition-all duration-300 ${effectiveCollapsed ? 'w-20' : 'w-72'}`}>
          {/* Logo */}
          <div className={`border-b border-gray-200 transition-all ${effectiveCollapsed ? 'p-4' : 'p-6'}`}>
            <button
              onClick={() => !isFullView && setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="flex items-center gap-3 group w-full relative"
              title={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {!effectiveCollapsed && (
                <>
                  <img
                    src="/logo.png"
                    alt="Logo"
                    className="h-7 w-7 transition-all flex-shrink-0 group-hover:opacity-0"
                  />
                  <span className="font-bold text-emerald-600 text-xl transition-opacity">AnnotateANU</span>
                  <ChevronLeft
                    className="absolute left-0 w-7 h-7 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  />
                </>
              )}
              {effectiveCollapsed && (
                <>
                  <img
                    src="/logo.png"
                    alt="Logo"
                    className="h-7 w-7 transition-all flex-shrink-0 group-hover:opacity-0"
                  />
                  <ChevronRight
                    className="absolute left-1/2 -translate-x-1/2 w-7 h-7 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </>
              )}
            </button>
          </div>

          {/* User Info */}
          <div className={`border-b border-gray-200 transition-all ${effectiveCollapsed ? 'p-2' : 'p-4'}`}>
            <div
              className={`flex items-center rounded-lg transition-all ${
                effectiveCollapsed ? 'w-12 h-12 justify-center bg-emerald-50' : 'gap-3 px-3 py-2 bg-emerald-50'
              }`}
              title={effectiveCollapsed ? `${user?.full_name || user?.username} (${user?.role})` : ''}
            >
              {effectiveCollapsed ? (
                <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-700 font-semibold text-sm">
                  {user?.full_name?.charAt(0).toUpperCase() || user?.username?.charAt(0).toUpperCase()}
                </div>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-700 font-semibold flex-shrink-0">
                    {user?.full_name?.charAt(0).toUpperCase() || user?.username?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{user?.full_name || user?.username}</p>
                    <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className={`flex-1 transition-all ${effectiveCollapsed ? 'p-2' : 'p-4'}`}>
            {filteredNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                title={effectiveCollapsed ? item.label : ''}
                className={`flex items-center rounded-lg mb-2 transition-all group ${
                  effectiveCollapsed ? 'w-12 h-12 justify-center' : 'gap-3 px-4 py-3'
                } ${
                  isActive(item.path)
                    ? 'bg-emerald-100 text-emerald-700 shadow-sm'
                    : 'text-gray-600 hover:bg-emerald-50 hover:text-emerald-600'
                }`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!effectiveCollapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight
                      className={`w-4 h-4 opacity-0 -translate-x-2 transition-all ${
                        isActive(item.path) ? 'opacity-100 translate-x-0' : 'group-hover:opacity-50 group-hover:translate-x-0'
                      }`}
                    />
                  </>
                )}
              </Link>
            ))}
          </nav>

          {/* Logout */}
          <div className={`border-t border-gray-200 transition-all ${effectiveCollapsed ? 'p-2' : 'p-4'}`}>
            <button
              onClick={handleLogout}
              title={effectiveCollapsed ? "Logout" : ''}
              className={`flex items-center rounded-lg text-left text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all ${
                effectiveCollapsed ? 'w-12 h-12 justify-center' : 'w-full gap-3 px-4 py-3'
              }`}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              {!effectiveCollapsed && <span>Logout</span>}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-h-screen">
          <div className="p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
