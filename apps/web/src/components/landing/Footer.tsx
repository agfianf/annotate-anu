import { Github } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { markAsVisited } from '../../lib/navigation'

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
            to="/annotate"
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
