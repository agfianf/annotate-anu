#!/bin/bash
# Setup script for AnnotateANU with HuggingFace SAM3 backend

set -e

echo "=========================================="
echo "AnnotateANU Setup (HuggingFace SAM3)"
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

# Install backend dependencies (HuggingFace)
echo "Installing backend dependencies (HuggingFace SAM3)..."
cd apps/api-inference
pip install --upgrade pip
pip install -r requirements.txt 2>/dev/null || pip install -e .
echo "✅ Backend dependencies installed"
echo ""

# Setup .env file
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ Created .env file from .env.example"
        echo ""
        echo "⚠️  IMPORTANT: Edit apps/api-inference/.env and add:"
        echo "   HF_TOKEN=hf_your_token_here"
        echo ""
        echo "To get your HuggingFace token:"
        echo "1. Create account: https://huggingface.co/join"
        echo "2. Request access: https://huggingface.co/facebook/sam3"
        echo "3. Generate token: https://huggingface.co/settings/tokens"
        echo ""
    else
        echo "⚠️  No .env.example found. Creating basic .env..."
        cat > .env << EOF
HF_TOKEN=your_huggingface_token_here
SAM3_MODEL_NAME=facebook/sam3-large
SAM3_DEVICE=auto
SAM3_DEFAULT_THRESHOLD=0.5
MAX_IMAGE_SIZE_MB=10
MAX_IMAGE_DIMENSION=2048
EOF
        echo "✅ Created basic .env file"
        echo "⚠️  IMPORTANT: Edit .env and add your HuggingFace token"
    fi
else
    echo "✅ .env file already exists"
    echo "⚠️  Make sure HF_TOKEN is set in .env"
fi
echo ""

cd ../..

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
echo "1. Add your HuggingFace token to apps/api-inference/.env"
echo "2. Run backend: ./run-hf.sh"
echo "3. Run frontend: cd apps/web && npm run dev"
echo ""
echo "Or use the run-hf script to start both services."
echo ""
