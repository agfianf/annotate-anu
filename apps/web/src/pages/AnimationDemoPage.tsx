import { useState } from 'react';
import {
  CountingNumber,
  GradientText,
  FadeIn,
  TiltCard,
  ImageZoom,
  PulseGlow,
  ParticleEffect,
  SkeletonLoader,
  SkeletonCard,
  ShakeError,
  SuccessCheckmark,
} from '@/components/ui/animate';
import { Button } from '@/components/ui/button';
import { Folder, Check, Tag, Sparkles } from 'lucide-react';

export default function AnimationDemoPage() {
  const [showParticles, setShowParticles] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);

  const triggerParticles = () => {
    setShowParticles(true);
    setTimeout(() => setShowParticles(false), 2000);
  };

  const triggerError = () => {
    setHasError(true);
    setTimeout(() => setHasError(false), 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-8">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <FadeIn direction="up">
            <GradientText
              as="h1"
              colors="emerald-chartreuse"
              animate
              className="text-6xl mb-4"
            >
              Animation Demo
            </GradientText>
          </FadeIn>
          <FadeIn direction="up" delay={0.1}>
            <p className="text-xl text-gray-600">
              All 18 animation components in action!
            </p>
          </FadeIn>
        </div>

        {/* Counting Numbers */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-gray-800">📊 Counting Numbers</h2>
          <div className="grid grid-cols-3 gap-6">
            <FadeIn delay={0} direction="up">
              <TiltCard tiltAngle={12}>
                <div className="glass p-6 rounded-xl text-center">
                  <Folder className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <h3 className="text-sm text-gray-600 mb-1">Projects</h3>
                  <CountingNumber
                    value={42}
                    className="text-4xl font-bold text-emerald-600"
                    duration={1.5}
                  />
                </div>
              </TiltCard>
            </FadeIn>

            <FadeIn delay={0.1} direction="up">
              <TiltCard tiltAngle={12}>
                <div className="glass p-6 rounded-xl text-center">
                  <Check className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <h3 className="text-sm text-gray-600 mb-1">Tasks</h3>
                  <CountingNumber
                    value={156}
                    className="text-4xl font-bold text-emerald-600"
                    duration={1.8}
                  />
                </div>
              </TiltCard>
            </FadeIn>

            <FadeIn delay={0.2} direction="up">
              <TiltCard tiltAngle={12}>
                <div className="glass p-6 rounded-xl text-center">
                  <Tag className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <h3 className="text-sm text-gray-600 mb-1">Annotations</h3>
                  <CountingNumber
                    value={3420}
                    className="text-4xl font-bold text-emerald-600"
                    duration={2}
                    formatNumber
                  />
                </div>
              </TiltCard>
            </FadeIn>
          </div>
        </section>

        {/* Interactive Buttons */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-gray-800">🖱️ Interactive Buttons</h2>
          <div className="flex flex-wrap gap-4">
            <FadeIn delay={0}>
              <Button>Default (Subtle Hover)</Button>
            </FadeIn>
            <FadeIn delay={0.05}>
              <Button ripple>With Ripple Effect</Button>
            </FadeIn>
            <FadeIn delay={0.1}>
              <Button magnetic>Magnetic (Follow Cursor)</Button>
            </FadeIn>
            <FadeIn delay={0.15}>
              <Button ripple magnetic size="lg">
                Ripple + Magnetic!
              </Button>
            </FadeIn>
            <FadeIn delay={0.2}>
              <Button ripple magnetic variant="destructive">
                Destructive Combo
              </Button>
            </FadeIn>
          </div>
        </section>

        {/* Image Gallery with Zoom */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-gray-800">🖼️ Image Gallery (Hover to Zoom)</h2>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <FadeIn key={i} delay={i * 0.1}>
                <TiltCard tiltAngle={8}>
                  <ImageZoom scale={1.08} shadow>
                    <div className="w-full h-48 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-lg flex items-center justify-center text-white text-4xl font-bold">
                      {i}
                    </div>
                  </ImageZoom>
                </TiltCard>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* Selection Pulse Glow */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-gray-800">✨ Selection Feedback (Click Cards)</h2>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <PulseGlow key={i} active={selectedCard === i} color="#10b981" intensity={0.5}>
                <div
                  onClick={() => setSelectedCard(i)}
                  className="glass p-6 rounded-xl cursor-pointer hover:bg-white/80 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold">
                      {i}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">Option {i}</h3>
                      <p className="text-sm text-gray-500">
                        {selectedCard === i ? '✓ Selected' : 'Click to select'}
                      </p>
                    </div>
                  </div>
                </div>
              </PulseGlow>
            ))}
          </div>
        </section>

        {/* Form Validation */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-gray-800">📝 Form Validation</h2>
          <div className="max-w-md space-y-4">
            <ShakeError trigger={hasError}>
              <div className="relative">
                <input
                  type="email"
                  placeholder="Email address"
                  className={`w-full px-4 py-2 border rounded-lg ${
                    hasError ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <SuccessCheckmark show={isValid} size="sm" />
                </div>
              </div>
            </ShakeError>
            <div className="flex gap-2">
              <Button onClick={triggerError} variant="destructive" ripple>
                Trigger Error Shake
              </Button>
              <Button onClick={() => setIsValid(!isValid)} ripple>
                Toggle Success ✓
              </Button>
            </div>
          </div>
        </section>

        {/* Particle Celebration */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-gray-800">🎊 Success Celebration</h2>
          <div className="text-center">
            <Button ripple magnetic size="lg" onClick={triggerParticles}>
              <Sparkles className="w-5 h-5 mr-2" />
              Celebrate!
            </Button>
            <p className="text-sm text-gray-500 mt-2">
              Click to trigger emerald particle burst!
            </p>
          </div>
        </section>

        {/* Loading Skeletons */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-gray-800">⏳ Loading Skeletons</h2>
          <div className="grid grid-cols-3 gap-6">
            <SkeletonCard />
            <div className="space-y-4">
              <SkeletonLoader width="100%" height={40} rounded="rounded-lg" />
              <SkeletonLoader lines={3} height={16} />
              <SkeletonLoader width="60%" height={32} rounded="rounded-full" />
            </div>
            <div className="glass p-6 rounded-xl">
              <SkeletonLoader width="80%" height={24} className="mb-4" animation="pulse" />
              <SkeletonLoader lines={4} height={14} animation="wave" />
            </div>
          </div>
        </section>

        {/* Gradient Text Variations */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-gray-800">🎨 Gradient Text</h2>
          <div className="space-y-4">
            <GradientText colors="emerald" as="h2" className="text-4xl">
              Emerald Gradient
            </GradientText>
            <GradientText colors="emerald-chartreuse" as="h2" className="text-4xl">
              Emerald → Chartreuse
            </GradientText>
            <GradientText colors="rainbow" as="h2" className="text-4xl">
              Rainbow Gradient
            </GradientText>
            <GradientText colors="sunset" as="h2" className="text-4xl" animate>
              Animated Sunset (Watch it flow!)
            </GradientText>
          </div>
        </section>
      </div>

      {/* Particle Effect */}
      <ParticleEffect
        trigger={showParticles}
        quantity={60}
        colors={['#10b981', '#9ABA12', '#37520B']}
        spread={200}
      />
    </div>
  );
}
