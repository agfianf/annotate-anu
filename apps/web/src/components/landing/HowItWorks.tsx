import { Download, Image, Sparkles, Tag } from '@/components/ui/icons'

const steps = [
  {
    number: 1,
    icon: Image,
    title: 'Upload Images',
    description: 'Drag and drop images or folders directly into the browser',
  },
  {
    number: 2,
    icon: Tag,
    title: 'Create Labels',
    description: 'Define your dataset classes with customizable colors',
  },
  {
    number: 3,
    icon: Sparkles,
    title: 'Annotate',
    description: 'Use manual tools or AI assistance to create precise annotations',
  },
  {
    number: 4,
    icon: Download,
    title: 'Export',
    description: 'Download COCO JSON or YOLO format for training your models',
  },
]

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 px-4 bg-gray-50">
      <div className="container mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Simple Workflow, Powerful Results
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Get started in minutes with our intuitive 4-step process
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <div key={step.number} className="text-center">
                {/* Number Circle */}
                <div className="relative inline-block mb-6">
                  <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                    {step.number}
                  </div>
                  {step.number < 4 && (
                    <div className="hidden lg:block absolute top-8 left-full w-24 h-0.5 bg-emerald-200" />
                  )}
                </div>

                {/* Icon */}
                <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-6 h-6 text-emerald-600" />
                </div>

                {/* Title */}
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{step.title}</h3>

                {/* Description */}
                <p className="text-gray-600 leading-relaxed">{step.description}</p>
              </div>
            )
          })}
        </div>

        {/* CTA Section */}
        <div className="mt-16 text-center">
          <p className="text-lg text-gray-600 mb-6">Ready to streamline your annotation workflow?</p>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            className="inline-block px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold rounded-lg transition-colors shadow-lg hover:shadow-xl"
          >
            Start Annotating Now
          </a>
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
