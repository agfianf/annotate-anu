@echo off
REM Setup script for AnnotateANU with Ultralytics SAM3 backend

echo ==========================================
echo AnnotateANU Setup (Ultralytics SAM3)
echo ==========================================
echo.

REM Check Python version
echo Checking Python version...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python 3 is not installed
    echo Please install Python 3.12 or higher
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo Found Python %PYTHON_VERSION%
echo.

REM Check Node.js
echo Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed
    echo Please install Node.js 18 or higher
    exit /b 1
)

for /f "tokens=1" %%i in ('node --version') do set NODE_VERSION=%%i
echo Found Node.js %NODE_VERSION%
echo.

REM Create virtual environment
echo Creating Python virtual environment...
if exist venv (
    echo Virtual environment already exists. Skipping creation.
) else (
    python -m venv venv
    echo Virtual environment created
)
echo.

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat
echo Virtual environment activated
echo.

REM Install backend dependencies (Ultralytics)
echo Installing backend dependencies (Ultralytics SAM3)...
cd apps\api-inference-yolo
pip install --upgrade pip
pip install -r requirements.txt 2>nul || pip install -e .
echo Backend dependencies installed
echo.

REM Check for CLIP package conflict
echo Checking for CLIP package conflicts...
pip list | findstr /B "clip " >nul
if %errorlevel% equ 0 (
    echo Found conflicting 'clip' package. Removing...
    pip uninstall clip -y
    pip install git+https://github.com/ultralytics/CLIP.git
    echo Installed correct CLIP package
)
echo.

REM Setup .env file
if not exist .env (
    if exist .env.example (
        copy .env.example .env
        echo Created .env file from .env.example
        echo.
        echo IMPORTANT: Edit apps\api-inference-yolo\.env and configure:
        echo    - SAM3_MODEL_PATH (default: sam3.pt)
        echo    - SAM3_DEVICE (auto/cuda/cpu)
        echo.
    ) else (
        echo No .env.example found. Creating basic .env...
        (
            echo SAM3_MODEL_PATH=sam3.pt
            echo SAM3_DEVICE=auto
            echo SAM3_DEFAULT_THRESHOLD=0.25
            echo MAX_IMAGE_SIZE_MB=10
            echo MAX_IMAGE_DIMENSION=2048
        ) > .env
        echo Created basic .env file
    )
) else (
    echo .env file already exists
)
echo.

cd ..\..

REM Check for SAM3 model weights
echo Checking for SAM3 model weights...
if not exist apps\sam3.pt (
    echo SAM3 model weights not found!
    echo.
    echo IMPORTANT: SAM3 weights are NOT automatically downloaded.
    echo You must download sam3.pt manually:
    echo.
    echo 1. Request access: https://huggingface.co/facebook/sam3
    echo 2. Once approved, download sam3.pt from the Files tab
    echo 3. Place sam3.pt in: apps\sam3.pt
    echo.
    echo After downloading, re-run this script or continue to frontend setup.
    echo.
) else (
    echo Found SAM3 model weights at apps\sam3.pt
    echo.
)

REM Install frontend dependencies
echo Installing frontend dependencies...
cd apps\web
call npm install
echo Frontend dependencies installed
echo.

cd ..\..

echo ==========================================
echo Setup Complete!
echo ==========================================
echo.
echo Next steps:
echo 1. Ensure sam3.pt is in apps\sam3.pt
echo 2. Run backend: run-yolo.bat
echo 3. Run frontend: cd apps\web ^&^& npm run dev
echo.
echo Or use the run-yolo script to start both services.
echo.

pause
