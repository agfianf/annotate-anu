import { Link } from '@tanstack/react-router'
import { markAsVisited } from '../../lib/navigation'

// lucide-react v1 dropped all brand icons, so the GitHub mark is inlined here.
function Github({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.573C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function Footer() {
  const handleGetStarted = () => {
    markAsVisited()
  }

  return (
    <footer className="bg-gray-900 text-gray-400 py-16 px-4">
      <div className="container mx-auto">
        {/* CTA Section */}
        <div className="text-center mb-16 pb-12 border-b border-gray-800">
          <h3 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to speed up your CV pipeline?
          </h3>
          <Link
            to="/annotation"
            onClick={handleGetStarted}
            className="inline-block px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold rounded-lg transition-colors shadow-lg hover:shadow-xl"
          >
            Get Started - It's Free
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <img
                src="/logo.png"
                alt="AnnotateANU Logo"
                className="h-10 w-10"
              />
              <h3 className="text-white font-bold text-xl">AnnotateANU</h3>
            </div>
            <p className="text-sm leading-relaxed">
              Free, open-source annotation platform powered by SAM3 AI and built for speed.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-white font-semibold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://github.com/agfianf/annotate-anu.git"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-emerald-400 transition-colors"
                >
                  GitHub Repository
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-emerald-400 transition-colors">
                  Documentation
                </a>
              </li>
              <li>
                <a
                  href="https://huggingface.co/facebook/sam3"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-emerald-400 transition-colors"
                >
                  SAM3 Model
                </a>
              </li>
            </ul>
          </div>

          {/* Built With */}
          <div>
            <h4 className="text-white font-semibold mb-4">Built With</h4>
            <ul className="space-y-2 text-sm">
              <li>React + TypeScript</li>
              <li>FastAPI + Python</li>
              <li>SAM3 (Segment Anything Model 3)</li>
              <li>Tailwind CSS</li>
              <li>IndexedDB</li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm">
            &copy; {new Date().getFullYear()} AnnotateANU. Built for the Computer Vision Community.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/agfianf/annotate-anu.git"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-emerald-400 transition-colors"
              aria-label="GitHub"
            >
              <Github className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
