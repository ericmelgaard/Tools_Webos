@echo off
setlocal

echo ================================
echo   LG Device Lookup - Starting
echo ================================
echo.

REM Check Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is not installed on this computer.
    echo.
    echo Please install it first from https://nodejs.org
    echo ^(choose the LTS version, click through the installer with defaults^)
    echo.
    echo Then double-click this file again.
    echo.
    pause
    exit /b 1
)

REM Check .env exists
if not exist ".env" (
    echo ERROR: .env file not found in this folder.
    echo This should have been included when you got this app - contact
    echo whoever shared it with you.
    echo.
    pause
    exit /b 1
)

REM Install dependencies if needed (first run only)
if not exist "node_modules" (
    echo First-time setup - installing dependencies, this may take a minute...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo Something went wrong during setup. Please contact whoever shared
        echo this app with you and share the error above.
        pause
        exit /b 1
    )
    echo.
)

echo Starting the app...
echo.
echo Once you see "running at http://localhost:3000" below,
echo open your browser and go to: http://localhost:3000
echo.
echo Leave this window open while you use the app.
echo Close this window to stop the app.
echo.

REM Open the browser automatically after a short delay
start "" cmd /c "timeout /t 3 >nul && start http://localhost:3000"

call npm start

pause
