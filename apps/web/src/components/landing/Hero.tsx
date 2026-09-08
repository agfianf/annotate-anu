import { ArrowRight, LogIn, Shield, User, UserPlus, Users, Zap } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { FadeIn, GradientText, TiltCard } from '../ui/animate'
import { useAuth } from '../../contexts/AuthContext'
import { markAsVisited } from '../../lib/navigation'

interface SoloCardProps {
  onClick: () => void
}

function SoloCard({ onClick }: SoloCardProps) {
  const features = [
    'No login required',
    'AI-powered segmentation',
    'Export to COCO, YOLO',
    'Local browser storage',
  ]

  return (
    <button
      onClick={onClick}
      className="group relative w-full text-left p-8 rounded-2xl bg-white/70 backdrop-blur-sm border-2 border-chartreuse-200 hover:border-chartreuse-400 transition-all duration-300 cursor-pointer hover:shadow-2xl hover:shadow-chartreuse-500/10"
    >
      {/* Icon */}
      <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-6 bg-chartreuse-100 text-chartreuse-700 transition-transform duration-300 group-hover:scale-110">
        <User className="w-8 h-8" />
      </div>

      {/* Title & Description */}
      <h3 className="text-2xl font-bold text-gray-900 mb-2">Solo Mode</h3>
      <p className="text-gray-600 mb-6">Quick start, 100% private annotation</p>

      {/* Features */}
      <ul className="space-y-3 mb-8">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center gap-3 text-gray-700">
            <svg className="w-5 h-5 flex-shrink-0 text-chartreuse-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA Button */}
      <div className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold bg-chartreuse-600 text-white group-hover:bg-chartreuse-700 transition-all duration-300 group-hover:gap-3">
        Start Now
        <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
      </div>

      {/* Hover glow effect */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10 blur-xl bg-chartreuse-400/20" />
    </button>
  )
}

function TeamCard() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const features = [
    'Image exploration & curation',
    'BYOM: Bring your own models',
    'Project & task management',
    'Multi-user collaboration',
  ]

  const handleDashboard = () => {
    markAsVisited()
    navigate({ to: '/dashboard' })
  }

  return (
    <div className="relative w-full text-left p-8 rounded-2xl bg-white/70 backdrop-blur-sm border-2 border-emerald-200 hover:border-emerald-400 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/10 group">
      {/* Icon */}
      <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-6 bg-emerald-100 text-emerald-600 transition-transform duration-300 group-hover:scale-110">
        <Users className="w-8 h-8" />
      </div>

      {/* Title & Description */}
      <h3 className="text-2xl font-bold text-gray-900 mb-2">Team Mode</h3>
      <p className="text-gray-600 mb-6">Full-featured platform for teams and enterprises</p>

      {/* Features */}
      <ul className="space-y-3 mb-8">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center gap-3 text-gray-700">
            <svg className="w-5 h-5 flex-shrink-0 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA Buttons */}
      {isAuthenticated ? (
        <button
          onClick={handleDashboard}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-all duration-300 hover:gap-3"
        >
          Go to Dashboard
          <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
        </button>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Link
            to="/login"
            onClick={() => markAsVisited()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-all duration-300"
          >
            <LogIn className="w-4 h-4" />
            Login
          </Link>
          <Link
            to="/register"
            onClick={() => markAsVisited()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50 transition-all duration-300"
          >
            <UserPlus className="w-4 h-4" />
            Register
          </Link>
        </div>
      )}

      {/* Hover glow effect */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10 blur-xl bg-emerald-400/20" />
    </div>
  )
}

function Hero() {
  const navigate = useNavigate()

  const handleSoloMode = () => {
    markAsVisited()
    navigate({ to: '/annotation' })
  }

  return (
    <section className="min-h-screen flex items-center justify-center px-4 py-20">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          {/* Animated Heading */}
          <FadeIn direction="up" duration={0.5}>
            <GradientText
              as="h1"
              colors="emerald-chartreuse"
              animate
              className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight"
            >
              Your Complete CV Data Platform
            </GradientText>
          </FadeIn>

          <FadeIn direction="up" delay={0.1} duration={0.5}>
            <p className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Explore, curate, annotate, and manage your image datasets.
              Bring your own models or use built-in AI for instant results.
            </p>
          </FadeIn>
        </div>

        {/* Mode Selection Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-16">
          <FadeIn direction="up" delay={0.2} duration={0.5}>
            <TiltCard tiltAngle={8} hoverScale={1.02} glare>
              <TeamCard />
            </TiltCard>
          </FadeIn>

          <FadeIn direction="up" delay={0.3} duration={0.5}>
            <TiltCard tiltAngle={8} hoverScale={1.02} glare>
              <SoloCard onClick={handleSoloMode} />
            </TiltCard>
          </FadeIn>
        </div>

        {/* Trust Badges */}
        <FadeIn direction="up" delay={0.4} duration={0.5}>
          <div className="flex flex-wrap gap-4 justify-center text-sm text-gray-600">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-gray-200">
              <Shield className="w-5 h-5 text-emerald-600" />
              <span className="font-medium">Open Source</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-gray-200">
              <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="font-medium">Privacy First</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-gray-200">
              <Zap className="w-5 h-5 text-emerald-600" />
              <span className="font-medium">BYOM Ready</span>
            </div>
          </div>
        </FadeIn>

        {/* GitHub Link */}
        <FadeIn direction="up" delay={0.5} duration={0.5}>
          <div className="text-center mt-12">
            <a
              href="https://github.com/agfianf/annotate-anu.git"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-gray-500 hover:text-emerald-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>View on GitHub</span>
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

export default Hero
