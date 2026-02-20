#!/bin/bash
# Run script for AnnotateANU with HuggingFace SAM3 backend

set -e

echo "=========================================="
echo "Starting AnnotateANU (HuggingFace SAM3)"
echo "=========================================="
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Error: Virtual environment not found"
    echo "Please run ./setup-hf.sh first"
    exit 1
fi

# Check for HF_TOKEN
if [ ! -f "apps/api-inference/.env" ]; then
    echo "❌ Error: .env file not found"
    echo "Please run ./setup-hf.sh first and configure your HuggingFace token"
    exit 1
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate
echo "✅ Virtual environment activated"
echo ""

# Kill any existing processes on ports
echo "Checking for existing processes..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
echo "✅ Ports cleared"
echo ""

# Start backend in background
echo "Starting backend on http://localhost:8000"
cd apps/api-inference
python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ../..
echo "✅ Backend started (PID: $BACKEND_PID)"
echo ""

# Wait for backend to be ready
echo "Waiting for backend to initialize..."
echo "⚠️  First run will download the SAM3 model (~2.4GB)"
echo "   This can take several minutes depending on your connection"
sleep 5

# Check if backend is running
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "⚠️  Backend may still be downloading/loading the model..."
fi
echo ""

# Start frontend in background
echo "Starting frontend on http://localhost:5173"
cd apps/web
npm run dev &
FRONTEND_PID=$!
cd ../..
echo "✅ Frontend started (PID: $FRONTEND_PID)"
echo ""

echo "=========================================="
echo "AnnotateANU is running! 🚀"
echo "=========================================="
echo ""
echo "Frontend: http://localhost:5173"
echo "Backend API: http://localhost:8000"
echo "API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Trap Ctrl+C and cleanup
cleanup() {
    echo ""
    echo "Stopping services..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    lsof -ti:5173 | xargs kill -9 2>/dev/null || true
    echo "✅ Services stopped"
    exit 0
}

trap cleanup INT TERM

# Wait for background processes
wait
