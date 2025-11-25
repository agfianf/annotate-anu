import Features from '../components/landing/Features'
import Footer from '../components/landing/Footer'
import Hero from '../components/landing/Hero'
import HowItWorks from '../components/landing/HowItWorks'
import Navigation from '../components/landing/Navigation'
import Roadmap from '../components/landing/Roadmap'

function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
      <Navigation />
      <Hero />
      <Features />
      <HowItWorks />
      <Roadmap />
      <Footer />
    </div>
  )
}

export default LandingPage
