import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false)
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

          </div>
        </div>
      )}
    </nav>
  )
}

export default Navigation
