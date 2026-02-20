#!/bin/bash
# Run script for AnnotateANU with Ultralytics SAM3 backend

set -e

echo "=========================================="
echo "Starting AnnotateANU (Ultralytics SAM3)"
echo "=========================================="
echo ""

# Check if sam3.pt exists
if [ ! -f "apps/sam3.pt" ]; then
    echo "❌ Error: SAM3 model weights not found at apps/sam3.pt"
    echo ""
    echo "Please download sam3.pt:"
    echo "1. Request access: https://huggingface.co/facebook/sam3"
    echo "2. Download sam3.pt from the Files tab"
    echo "3. Place it in: apps/sam3.pt"
    echo ""
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Error: Virtual environment not found"
    echo "Please run ./setup-yolo.sh first"
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
cd apps/api-inference-yolo
python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ../..
echo "✅ Backend started (PID: $BACKEND_PID)"
echo ""

# Wait for backend to be ready
echo "Waiting for backend to initialize..."
sleep 5

# Check if backend is running
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "⚠️  Backend may still be loading the model..."
    echo "   This can take 30-60 seconds on first run"
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
    
    # Send kill signal aggressively just in case
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    lsof -ti:5173 | xargs kill -9 2>/dev/null || true

    # Wait for processes to actually stop
    echo "Waiting for services to stop..."
    while kill -0 $BACKEND_PID 2>/dev/null || kill -0 $FRONTEND_PID 2>/dev/null; do
        sleep 0.5
    done

    echo "✅ Services stopped"
    exit 0
}

trap cleanup INT TERM

# Wait for background processes
wait
