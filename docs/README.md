# AnnotateANU Documentation

Welcome to the AnnotateANU documentation directory.

## 📁 Directory Structure

```
docs/
├── getting-started.md         # 🆕 Complete guide to running AnnotateANU
├── explore-sidebar-image-gallery.md # Explore sidebar + image gallery guide
├── architecture/              # System architecture documents
├── api-specs/                 # API specifications and contracts
├── byom-integration-guide/    # Bring Your Own Model integration guide
└── README.md                  # This file
```

## 📚 Documentation Sections

### 🆕 Getting Started Guide (`getting-started.md`)

**Complete guide for new developers!**

Covers:
- What is Turborepo and why we use it
- 3 different ways to run the project
- Complete command reference
- Development workflows
- Troubleshooting and best practices

**👉 [Read the Getting Started Guide](./getting-started.md)**

---

### Feature Guides

**Explore Sidebar + Image Gallery**

Documentation for the unified sidebar and the virtualized explore image gallery, including filters, visibility, and the fullscreen image modal.

**👉 [Explore Sidebar + Image Gallery](./explore-sidebar-image-gallery.md)**

---

### Architecture (`architecture/`)

System design documents including:
- Monorepo structure and organization
- Service architecture (Solo vs Team mode)
- Data flow diagrams
- Database schema design
- Infrastructure setup
- Deployment strategies

**Placeholder for future content**

### API Specifications (`api-specs/`)

API documentation including:
- OpenAPI/Swagger specifications
- API Core endpoints (user management, projects, datasets, annotations)
- API Inference endpoints (SAM3 inference, BYOM)
- WebSocket protocols (real-time sync)
- Authentication and authorization flows

**Placeholder for future content**

### BYOM Integration Guide (`byom-integration-guide/`)

Guide for integrating custom models:
- Model registry protocol
- Inference API contract
- Deployment options
- Performance optimization
- Example implementations

**Placeholder for future content**

---

## 🚀 Quick Links

- **[Getting Started Guide](./getting-started.md)** ⭐ **START HERE!**
- [Main README](../README.md)
- [CLAUDE.md - AI Development Guide](../CLAUDE.md)
- [Docker Deployment Modes](../docker/README.md)

---

## 📝 Contributing to Documentation

When adding new documentation:

1. **Architecture docs**: Add to `architecture/` directory
   - Use diagrams (mermaid, plantuml, or images)
   - Document design decisions and trade-offs

2. **API specs**: Add to `api-specs/` directory
   - Use OpenAPI 3.0 format
   - Include request/response examples
   - Document error codes

3. **Integration guides**: Add to `byom-integration-guide/`
   - Step-by-step tutorials
   - Code examples
   - Troubleshooting sections

4. **Format**: Use Markdown (.md) files
5. **Images**: Store in `docs/assets/` (create if needed)
6. **Update this README** when adding new sections

---

## 🎯 Documentation Roadmap

- [ ] Architecture decision records (ADRs)
- [ ] Database schema documentation
- [ ] API reference (auto-generated from OpenAPI)
- [ ] BYOM model registry specification
- [ ] Deployment guide for production
- [ ] Active learning pipeline documentation
- [ ] CVAT integration guide
- [ ] Team mode user guide
- [ ] Administrator guide
