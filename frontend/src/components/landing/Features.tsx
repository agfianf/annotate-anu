import { Database, Download, Keyboard, Layers, Sparkles, Target } from 'lucide-react'

const features = [
  {
    icon: Sparkles,
    title: 'Automated Segmentation',
    description:
      'SAM3 inference runs locally or via optimized endpoints to auto-segment objects instantly',
  },
  {
    icon: Target,
    title: 'Manual Precision',
    description:
      "Need to tweak the AI's work? Use our pixel-perfect pen, rectangle, and polygon tools for fine-tuning",
  },
  {
    icon: Layers,
    title: 'Batch Workflow',
    description:
      'Load hundreds of images at once. Our interface handles batch processing without browser lag',
  },
  {
    icon: Keyboard,
    title: 'Lightning Shortcuts',
    description:
      'Designed for power users. Keep your hands on the keyboard and annotate without breaking flow',
  },
  {
    icon: Download,
    title: 'Export Ready',
    description: 'Export to COCO JSON, YOLO format, or ZIP archives with one click',
  },
  {
    icon: Database,
    title: 'Local-First Storage',
    description: 'Your data stays local with IndexedDB - no server uploads, total privacy',
  },
]

function Features() {
  return (
    <section id="features" className="py-20 px-4">
      <div className="container mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Feature Deep Dive</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Everything you need for professional-grade annotation workflows
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="group p-6 bg-white border border-gray-200 rounded-xl hover:glass transition-all duration-300 hover:shadow-lg"
              >
                {/* Icon */}
                <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-emerald-600 transition-colors">
                  <Icon className="w-6 h-6 text-emerald-600 group-hover:text-white transition-colors" />
                </div>

                {/* Title */}
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>

                {/* Description */}
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default Features
