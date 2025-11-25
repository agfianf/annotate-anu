import { Cloud, Plug } from 'lucide-react'

const roadmapItems = [
  {
    icon: Plug,
    emoji: '🔌',
    title: 'Bring Your Own Model (BYOM)',
    description:
      'Connect your existing custom models via API. Pre-label your images using your own weights to bootstrap the annotation process even faster.',
  },
  {
    icon: Cloud,
    emoji: '☁️',
    title: 'Enterprise Storage Integration',
    description:
      'Move beyond browser storage. We are adding native integration for MinIO and S3-compatible object storage, allowing you to pull and sync datasets directly from your cloud buckets.',
  },
]

function Roadmap() {
  return (
    <section className="py-20 px-4 bg-gradient-to-br from-emerald-50 to-white">
      <div className="container mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-block px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-full mb-4">
            🚀 COMING SOON
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">The Roadmap</h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            We are constantly evolving. Here is what is shipping next to AnnotateANU:
          </p>
        </div>

        {/* Roadmap Grid */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {roadmapItems.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.title}
                className="relative group p-8 bg-white border-2 border-emerald-200 rounded-xl hover:border-emerald-400 hover:shadow-2xl transition-all duration-300"
              >
                {/* Coming Soon Badge */}
                <div className="absolute -top-3 -right-3 px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full shadow-lg">
                  SOON
                </div>

                {/* Emoji + Icon */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-5xl">{item.emoji}</span>
                  <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center group-hover:bg-emerald-600 transition-colors">
                    <Icon className="w-6 h-6 text-emerald-600 group-hover:text-white transition-colors" />
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-2xl font-bold text-gray-900 mb-3">{item.title}</h3>

                {/* Description */}
                <p className="text-gray-600 leading-relaxed text-lg">{item.description}</p>
              </div>
            )
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <p className="text-lg text-gray-600 mb-4">
            Want to influence what we build next? Join our community on GitHub!
          </p>
          <a
            href="https://github.com/yourusername/annotateau"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50 font-semibold rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path
                fillRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                clipRule="evenodd"
              />
            </svg>
            Contribute on GitHub
          </a>
        </div>
      </div>
    </section>
  )
}

export default Roadmap
