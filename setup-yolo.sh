#!/bin/bash
# Setup script for AnnotateANU with Ultralytics SAM3 backend

set -e

echo "=========================================="
echo "AnnotateANU Setup (Ultralytics SAM3)"
echo "=========================================="
echo ""

# Check Python version
echo "Checking Python version..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed"
    echo "Please install Python 3.12 or higher"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
echo "✅ Found Python $PYTHON_VERSION"
echo ""

# Check Node.js
echo "Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "Please install Node.js 18 or higher"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "✅ Found Node.js $NODE_VERSION"
echo ""

# Create virtual environment
echo "Creating Python virtual environment..."
if [ -d "venv" ]; then
    echo "⚠️  Virtual environment already exists. Skipping creation."
else
    python3 -m venv venv
    echo "✅ Virtual environment created"
fi
echo ""

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate
echo "✅ Virtual environment activated"
echo ""

# Install backend dependencies (Ultralytics)
echo "Installing backend dependencies (Ultralytics SAM3)..."
cd apps/api-inference-yolo
pip install --upgrade pip
pip install -r requirements.txt 2>/dev/null || pip install -e .
echo "✅ Backend dependencies installed"
echo ""

# Check for CLIP package conflict
echo "Checking for CLIP package conflicts..."
if pip list | grep -q "^clip "; then
    echo "⚠️  Found conflicting 'clip' package. Removing..."
    pip uninstall clip -y
    pip install git+https://github.com/ultralytics/CLIP.git
    echo "✅ Installed correct CLIP package"
fi
echo ""

# Setup .env file
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ Created .env file from .env.example"
        echo ""
        echo "⚠️  IMPORTANT: Edit apps/api-inference-yolo/.env and configure:"
        echo "   - SAM3_MODEL_PATH (default: sam3.pt)"
        echo "   - SAM3_DEVICE (auto/cuda/cpu)"
        echo ""
    else
        echo "⚠️  No .env.example found. Creating basic .env..."
        cat > .env << EOF
SAM3_MODEL_PATH=sam3.pt
SAM3_DEVICE=auto
SAM3_DEFAULT_THRESHOLD=0.25
MAX_IMAGE_SIZE_MB=10
MAX_IMAGE_DIMENSION=2048
EOF
        echo "✅ Created basic .env file"
    fi
else
    echo "✅ .env file already exists"
fi
echo ""

cd ../..

# Check for SAM3 model weights
echo "Checking for SAM3 model weights..."
if [ ! -f "apps/sam3.pt" ]; then
    echo "❌ SAM3 model weights not found!"
    echo ""
    echo "IMPORTANT: SAM3 weights are NOT automatically downloaded."
    echo "You must download sam3.pt manually:"
    echo ""
    echo "1. Request access: https://huggingface.co/facebook/sam3"
    echo "2. Once approved, download sam3.pt from the Files tab"
    echo "3. Place sam3.pt in: apps/sam3.pt"
    echo ""
    echo "After downloading, re-run this script or continue to frontend setup."
    echo ""
else
    echo "✅ Found SAM3 model weights at apps/sam3.pt"
    echo ""
fi

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd apps/web
npm install
echo "✅ Frontend dependencies installed"
echo ""

cd ../..

echo "=========================================="
echo "Setup Complete! 🎉"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Ensure sam3.pt is in apps/sam3.pt"
echo "2. Run backend: ./run-yolo.sh"
echo "3. Run frontend: cd apps/web && npm run dev"
echo ""
echo "Or use the run-yolo script to start both services."
echo ""
