import { Link } from 'react-router-dom'
import { markAsVisited } from '../../lib/navigation'
import HeroIllustration from './HeroIllustration'

function Hero() {
  const handleGetStarted = () => {
    markAsVisited()
  }

  return (
    <section className="min-h-screen flex items-center justify-center px-4 py-20">
      <div className="container mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Text Content */}
          <div className="text-center md:text-left">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Annotate Faster.
              <br />
              <span className="text-emerald-600">Annotate Smarter.</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              AnnotateANU combines powerful AI-assisted segmentation with lightning-fast manual annotation
              tools. Free, open-source, and built for speed.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
              <Link
                to="/app"
                onClick={handleGetStarted}
                className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold rounded-lg transition-colors shadow-lg hover:shadow-xl"
              >
                Get Started
              </Link>
              <a
                href="https://github.com/yourusername/annotateau"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50 text-lg font-semibold rounded-lg transition-colors"
              >
                View on GitHub
              </a>
            </div>

            {/* Quick info badges */}
            <div className="mt-8 flex flex-wrap gap-4 justify-center md:justify-start text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Free & Open Source</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Browser-Based</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>SAM3-Powered AI</span>
              </div>
            </div>
          </div>

          {/* Illustration */}
          <div className="hidden md:block">
            <HeroIllustration />
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
