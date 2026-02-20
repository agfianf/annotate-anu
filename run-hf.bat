@echo off
REM Run script for AnnotateANU with HuggingFace SAM3 backend

echo ==========================================
echo Starting AnnotateANU (HuggingFace SAM3)
echo ==========================================
echo.

REM Check if virtual environment exists
if not exist venv (
    echo Error: Virtual environment not found
    echo Please run setup-hf.bat first
    pause
    exit /b 1
)

REM Check for .env file
if not exist apps\api-inference\.env (
    echo Error: .env file not found
    echo Please run setup-hf.bat first and configure your HuggingFace token
    pause
    exit /b 1
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat
echo Virtual environment activated
echo.

REM Kill any existing processes on ports
echo Checking for existing processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do taskkill /F /PID %%a 2>nul
echo Ports cleared
echo.

REM Start backend in new window
echo Starting backend on http://localhost:8000
start "AnnotateANU Backend" cmd /k "cd apps\api-inference && python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload"
echo Backend started
echo.
echo First run will download the SAM3 model (~2.4GB)
echo This can take several minutes depending on your connection
echo.

REM Wait for backend to initialize
echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul
echo.

REM Start frontend in new window
echo Starting frontend on http://localhost:5173
start "AnnotateANU Frontend" cmd /k "cd apps\web && npm run dev"
echo Frontend started
echo.

echo ==========================================
echo AnnotateANU is running!
echo ==========================================
echo.
echo Frontend: http://localhost:5173
echo Backend API: http://localhost:8000
echo API Docs: http://localhost:8000/docs
echo.
echo Close the terminal windows to stop the services
echo.

pause
