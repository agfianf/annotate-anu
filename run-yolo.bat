@echo off
REM Run script for AnnotateANU with Ultralytics SAM3 backend

echo ==========================================
echo Starting AnnotateANU (Ultralytics SAM3)
echo ==========================================
echo.

REM Check if sam3.pt exists
if not exist apps\sam3.pt (
    echo Error: SAM3 model weights not found at apps\sam3.pt
    echo.
    echo Please download sam3.pt:
    echo 1. Request access: https://huggingface.co/facebook/sam3
    echo 2. Download sam3.pt from the Files tab
    echo 3. Place it in: apps\sam3.pt
    echo.
    pause
    exit /b 1
)

REM Check if virtual environment exists
if not exist venv (
    echo Error: Virtual environment not found
    echo Please run setup-yolo.bat first
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
start "AnnotateANU Backend" cmd /k "cd apps\api-inference-yolo && python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload"
echo Backend started
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

echo Press any key to stop all services...
pause >nul

echo Stopping services...
:KILL_LOOP
set "RUNNING=0"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do (
    taskkill /F /PID %%a 2>nul
    set "RUNNING=1"
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do (
    taskkill /F /PID %%a 2>nul
    set "RUNNING=1"
)

if "%RUNNING%"=="1" (
    echo Waiting for services to stop...
    timeout /t 1 /nobreak >nul
    goto KILL_LOOP
)

echo Services stopped.
exit /b 0
