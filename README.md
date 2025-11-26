<div align="center">
  <img src="assets/logo.png" alt="AnnotateANU Logo" width="200"/>

  # AnnotateANU

  ### Annotate at the Speed of AI. 100% Private.

  <p>
    AnnotateANU combines the power of Meta's SAM3 for instant segmentation with a strictly local-first architecture.<br/>
    Your images never leave your browser. Free, open-source, and built for high-performance computer vision workflows.
  </p>

  [![Open Source](https://img.shields.io/badge/Open%20Source-100%25-brightgreen)](https://github.com/agfianf/annotate-anu.git)
  [![Privacy](https://img.shields.io/badge/Privacy-No%20Server%20Uploads-blue)](https://github.com/agfianf/annotate-anu.git)
  [![Powered by SAM3](https://img.shields.io/badge/Powered%20by-Meta%20SAM3-0467DF)](https://huggingface.co/facebook/sam3)

  [Get Started](#quick-start) · [Report Bug](https://github.com/agfianf/annotate-anu/issues)

</div>

---

## 📚 Table of Contents

- [Why Choose AnnotateANU?](#why-choose-annotatanu)
- [Features](#-features)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Roadmap](#-roadmap---coming-soon)
- [Troubleshooting](#troubleshooting)
- [Contributing](#-contributing)

---

## ✨ Features

- **⚡ Automated Segmentation**: SAM3 inference runs locally or via optimized endpoints to auto-segment objects instantly. Use text prompts or bounding boxes to get pixel-perfect masks in milliseconds.

- **🎯 Manual Precision**: Need to tweak the AI's work? Use our pixel-perfect pen, rectangle, and polygon tools for fine-tuning your annotations with complete control.

- **📦 Batch Workflow**: Load hundreds of images at once. Our interface handles batch processing without browser lag, making large dataset annotation a breeze.

- **⌨️ Lightning Shortcuts**: Designed for power users. Keep your hands on the keyboard and annotate without breaking flow with comprehensive keyboard shortcuts.

- **💾 Export Ready**: Export to COCO JSON, YOLO format, or ZIP archives with one click. Industry-standard formats ready for your ML pipelines.

- **🔒 Local-First Storage**: Your data stays local with IndexedDB - no server uploads, total privacy. All processing happens in your browser or on your local backend.


![feature](assets/features.gif)


## Architecture

AnnotateANU is a **Turborepo monorepo** with shared TypeScript types and optimized build caching:

```
sam3-app/                    # Turborepo Monorepo
├── apps/
│   ├── web/                 # React annotation interface
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── package.json
│   └── api-inference/       # FastAPI SAM3 backend
│       ├── src/app/
│       ├── Dockerfile
│       └── pyproject.toml
├── packages/
│   ├── shared-types/        # Shared TypeScript API types
│   │   └── src/
│   └── tsconfig/            # Shared TypeScript configs
├── turbo.json               # Turborepo pipeline config
├── package.json             # Root workspace config
├── docker-compose.yml       # Orchestrates all services
├── Makefile                 # Development commands
└── README.md
```

## Quick Start

### Prerequisites

- **Docker & Docker Compose** (recommended)
- **Python 3.12+** and **uv** (for local backend development)
- **Node.js 18+** and **npm** (for local frontend development)
- **HuggingFace Account & Token** (required for SAM3 model access)

### HuggingFace Setup (REQUIRED)

SAM3 is a gated model. You must:

1. Create account: https://huggingface.co/join
2. Request access: https://huggingface.co/facebook/sam3
3. Generate token: https://huggingface.co/settings/tokens
4. Add to apps/api-inference/.env:

```bash
cp apps/api-inference/.env.example apps/api-inference/.env
# Edit apps/api-inference/.env and add:
HF_TOKEN=hf_your_token_here
```

### Docker (Recommended)

```bash
# 1. Setup environment
cp apps/api-inference/.env.example apps/api-inference/.env
# Edit backend/.env and add your HF_TOKEN

# 2. Start all services
make docker-up

# 3. Access the application
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

## 🚀 Roadmap - Coming Soon

We are constantly evolving. Here's what's shipping next to AnnotateANU:

#### 🔌 Bring Your Own Model (BYOM)
Connect your existing custom models via API. Pre-label your images using your own weights to bootstrap the annotation process even faster.

#### ☁️ Enterprise Storage Integration
Move beyond browser storage. We're adding native integration for MinIO and S3-compatible object storage, allowing you to pull and sync datasets directly from your cloud buckets.


## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, we'd love your help.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

Want to influence what we build next? Join our community on GitHub and share your ideas!

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## References

- [SAM3 Model](https://huggingface.co/facebook/sam3)
- [T-REX Label](https://www.trexlabel.com/)
- [MakeSense.ai](https://www.makesense.ai/)


---

<div align="center">
  <p><strong>Ready to speed up your CV pipeline?</strong></p>
  <p>© 2025 AnnotateANU. Built for the Computer Vision Community.</p>
</div>

