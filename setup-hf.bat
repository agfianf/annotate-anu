@echo off
REM Setup script for AnnotateANU with HuggingFace SAM3 backend

echo ==========================================
echo AnnotateANU Setup (HuggingFace SAM3)
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

REM Install backend dependencies (HuggingFace)
echo Installing backend dependencies (HuggingFace SAM3)...
cd apps\api-inference
pip install --upgrade pip
pip install -r requirements.txt 2>nul || pip install -e .
echo Backend dependencies installed
echo.

REM Setup .env file
if not exist .env (
    if exist .env.example (
        copy .env.example .env
        echo Created .env file from .env.example
        echo.
        echo IMPORTANT: Edit apps\api-inference\.env and add:
        echo    HF_TOKEN=hf_your_token_here
        echo.
        echo To get your HuggingFace token:
        echo 1. Create account: https://huggingface.co/join
        echo 2. Request access: https://huggingface.co/facebook/sam3
        echo 3. Generate token: https://huggingface.co/settings/tokens
        echo.
    ) else (
        echo No .env.example found. Creating basic .env...
        (
            echo HF_TOKEN=your_huggingface_token_here
            echo SAM3_MODEL_NAME=facebook/sam3-large
            echo SAM3_DEVICE=auto
            echo SAM3_DEFAULT_THRESHOLD=0.5
            echo MAX_IMAGE_SIZE_MB=10
            echo MAX_IMAGE_DIMENSION=2048
        ) > .env
        echo Created basic .env file
        echo IMPORTANT: Edit .env and add your HuggingFace token
    )
) else (
    echo .env file already exists
    echo Make sure HF_TOKEN is set in .env
)
echo.

cd ..\..

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
echo 1. Add your HuggingFace token to apps\api-inference\.env
echo 2. Run backend: run-hf.bat
echo 3. Run frontend: cd apps\web ^&^& npm run dev
echo.
echo Or use the run-hf script to start both services.
echo.

pause
