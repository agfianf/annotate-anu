# SAM3 Annotation Platform - Frontend

React-based annotation platform for image labeling, inspired by T-REX Label and MakeSense.ai.

## Features

- Canvas-based image annotation
- Multiple annotation tools (rectangle, polygon, point)
- Real-time annotation management
- SAM3 backend integration for AI-assisted segmentation
- Responsive UI with Tailwind CSS

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** - Fast build tool and dev server
- **Konva** + **React-Konva** - Canvas manipulation for annotations
- **Tailwind CSS** - Utility-first styling
- **Axios** - HTTP client for API calls
- **Lucide React** - Icon library

## Development

### Prerequisites

- Node.js 18+ and npm

### Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start development server
npm run dev

# Open http://localhost:5173
```

### Environment Variables

Create a `.env` file:

```bash
# Backend API URL
VITE_API_URL=http://localhost:8000

# Environment
VITE_ENV=development
```

### Available Scripts

```bash
npm run dev          # Start dev server (port 5173)
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Canvas.tsx       # Main annotation canvas
│   │   ├── Toolbar.tsx      # Tool selection sidebar
│   │   └── Sidebar.tsx      # Annotations list
│   ├── App.tsx              # Main application
│   ├── App.css
│   ├── index.css            # Tailwind directives
│   └── main.tsx             # Entry point
├── public/
├── Dockerfile               # Multi-stage build (Vite + Nginx)
├── nginx.conf               # Nginx configuration for production
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

## Annotation Tools

- **Select** - Select and modify existing annotations
- **Rectangle** - Draw bounding boxes
- **Polygon** - Draw custom polygon shapes
- **Point** - Add single point annotations

## Docker Deployment

The frontend is containerized using a multi-stage Docker build:

1. **Build stage**: Uses Node.js to build the Vite app
2. **Production stage**: Serves static files with Nginx

See root `docker-compose.yml` for full setup.

## API Integration

The frontend communicates with the SAM3 backend API:

- **Endpoint**: `/api/v1/sam3/inference/*`
- **Features**: Text prompts, bounding box inference, batch processing

## Future Enhancements

- CVAT integration for advanced labeling
- Export annotations (COCO, YOLO, Pascal VOC formats)
- Multi-user collaboration
- Annotation history and versioning
- Keyboard shortcuts for faster labeling
- AI-assisted annotation with SAM3 backend

## References

- [T-REX Label](https://www.trexlabel.com/)
- [MakeSense.ai](https://www.makesense.ai/)
- [React Konva](https://konvajs.org/docs/react/)
- [Vite](https://vite.dev/)
