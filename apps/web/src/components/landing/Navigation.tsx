import { LayoutDashboard, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const { user, isAuthenticated, logout } = useAuth()

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false)
  }

  const handleLogout = async () => {
    try {
      await logout()
      toast.success('Logged out')
      closeMobileMenu()
    } catch {
      toast.error('Failed to logout')
    }
  }

  return (
    <nav className="sticky top-0 z-50 glass border-b border-gray-200">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-3 group transition-all hover:opacity-90"
          aria-label="AnnotateANU Home"
        >
          <img
            src="/logo.png"
            alt="AnnotateANU Logo"
            className="h-12 w-12 sm:h-14 sm:w-14 transition-transform group-hover:scale-105"
          />
          <span className="text-2xl font-bold text-emerald-600">AnnotateANU</span>
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-6">
          <a href="#features" className="text-gray-600 hover:text-emerald-600 transition-colors">
            Features
          </a>
          <a
            href="https://github.com/agfianf/annotate-anu.git"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 hover:text-emerald-600 transition-colors"
          >
            GitHub
          </a>
          {/* Show Dashboard link only when authenticated */}
          {isAuthenticated && (
            <div className="flex items-center gap-3 pl-4 border-l border-gray-300">
              <Link
                to="/dashboard"
                className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors flex items-center gap-2"
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
                <span className="font-medium">{user?.full_name || user?.username}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-red-600 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden p-2 text-gray-600 hover:text-emerald-600 transition-colors"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 glass-strong">
          <div className="container mx-auto px-4 py-4 flex flex-col gap-4">
            <a
              href="#features"
              onClick={closeMobileMenu}
              className="text-gray-700 hover:text-emerald-600 transition-colors py-2"
            >
              Features
            </a>
            <a
              href="https://github.com/agfianf/annotate-anu.git"
              target="_blank"
              rel="noopener noreferrer"
              onClick={closeMobileMenu}
              className="text-gray-700 hover:text-emerald-600 transition-colors py-2"
            >
              GitHub
            </a>

            {/* Show Dashboard only when authenticated */}
            {isAuthenticated && (
              <div className="border-t border-gray-200 pt-4 mt-2">
                <div className="flex items-center gap-2 mb-3 px-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-sm">
                    {user?.full_name?.charAt(0).toUpperCase() || user?.username?.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-gray-900">{user?.full_name || user?.username}</span>
                </div>
                <Link
                  to="/dashboard"
                  onClick={closeMobileMenu}
                  className="flex items-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors mb-2"
                >
                  <LayoutDashboard className="w-5 h-5" />
                  Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-3 text-gray-600 hover:text-red-600 font-medium transition-colors w-full"
                >
                  <LogOut className="w-5 h-5" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}

export default Navigation
