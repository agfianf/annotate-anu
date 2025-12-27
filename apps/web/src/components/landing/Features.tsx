import {
  Box,
  Brain,
  Download,
  GitCompare,
  Layers,
  Search,
  Sparkles,
  Tag,
  Target,
} from 'lucide-react'
import { FadeIn, TiltCard } from '../ui/animate'

const features = [
  {
    icon: Search,
    title: 'Image Exploration',
    description:
      'FiftyOne-inspired image curation. Filter, sort, and explore your datasets with powerful query tools.',
    color: 'emerald',
  },
  {
    icon: Box,
    title: 'BYOM - Bring Your Own Model',
    description:
      'Connect your own models via API. Support for segmentation, detection, classification, and more.',
    color: 'chartreuse',
  },
  {
    icon: Sparkles,
    title: 'AI Segmentation',
    description:
      'Built-in SAM3 and other models for instant object segmentation with text or bbox prompts.',
    color: 'emerald',
  },
  {
    icon: Tag,
    title: 'Auto-Tagging',
    description:
      'Automatically tag and classify images using models like Moondream, BLIP, and custom endpoints.',
    color: 'chartreuse',
  },
  {
    icon: GitCompare,
    title: 'Embedding Visualization',
    description:
      'Map and visualize image embeddings. Cluster similar images and find outliers in your dataset.',
    color: 'emerald',
  },
  {
    icon: Target,
    title: 'Precision Annotation',
    description:
      'Pixel-perfect pen, rectangle, and polygon tools. Fine-tune AI predictions with manual edits.',
    color: 'chartreuse',
  },
  {
    icon: Layers,
    title: 'Batch Processing',
    description:
      'Process hundreds of images at once. Queue auto-annotation jobs and track progress in real-time.',
    color: 'emerald',
  },
  {
    icon: Brain,
    title: 'Smart Workflows',
    description:
      'Chain models together. Auto-detect objects, then segment, then classify - all in one pipeline.',
    color: 'chartreuse',
  },
  {
    icon: Download,
    title: 'Flexible Export',
    description:
      'Export to COCO, YOLO, Pascal VOC, or custom formats. Integrate with your ML training pipeline.',
    color: 'emerald',
  },
]

function Features() {
  return (
    <section id="features" className="py-20 px-4 bg-gradient-to-b from-white to-emerald-50/30">
      <div className="container mx-auto max-w-7xl">
        {/* Section Header */}
        <FadeIn direction="up">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Everything You Need
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              A complete platform for computer vision data management and annotation
            </p>
          </div>
        </FadeIn>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon
            const isEmerald = feature.color === 'emerald'
            return (
              <FadeIn key={feature.title} direction="up" delay={0.05 * index}>
                <TiltCard tiltAngle={5} hoverScale={1.02} glare={false}>
                  <div className="group h-full p-6 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl hover:border-emerald-300 transition-all duration-300 hover:shadow-lg">
                    {/* Icon */}
                    <div
                      className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-colors ${
                        isEmerald
                          ? 'bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'
                          : 'bg-chartreuse-100 text-chartreuse-700 group-hover:bg-chartreuse-600 group-hover:text-white'
                      }`}
                    >
                      <Icon className="w-6 h-6" />
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>

                    {/* Description */}
                    <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
                  </div>
                </TiltCard>
              </FadeIn>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default Features
