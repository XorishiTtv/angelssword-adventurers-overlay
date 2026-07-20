@echo off
setlocal

cd /d "%~dp0"

echo.
echo  ============================================
echo   AS Adventurer - First Time Setup
echo  ============================================
echo.
echo  Security note:
echo  This script does not download or install a runtime.
echo  Install Node.js 18 or newer from the official Node.js website first.
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Node.js was not found in PATH.
    echo.
    echo  Install Node.js 18 or newer, reopen this folder, and run setup.bat again.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] npm was not found in PATH.
    echo.
    echo  Reinstall Node.js with npm enabled, then run setup.bat again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR (
    echo  [ERROR] Could not determine the installed Node.js version.
    pause
    exit /b 1
)

if %NODE_MAJOR% LSS 18 (
    echo  [ERROR] Node.js 18 or newer is required. Found:
    node --version
    echo.
    pause
    exit /b 1
)

echo  [OK] Using installed runtime:
node --version
npm --version

if not exist "package-lock.json" (
    echo.
    echo  [ERROR] package-lock.json is missing.
    echo  Refusing to perform an unlocked dependency installation.
    echo.
    pause
    exit /b 1
)

echo.
echo  Installing locked production dependencies...
echo  Package lifecycle scripts are disabled during installation.
echo.

call npm ci --omit=dev --ignore-scripts
if errorlevel 1 (
    echo.
    echo  [ERROR] Dependency installation failed.
    echo.
    pause
    exit /b 1
)

set "HAS_ASSETS=0"
for %%F in (public\assets\neutral_idle.*) do set "HAS_ASSETS=1"
if "%HAS_ASSETS%"=="0" (
    echo.
    echo  Generating local placeholder assets...
    node generate-placeholders.js
    if errorlevel 1 (
        echo.
        echo  [ERROR] Placeholder generation failed.
        echo.
        pause
        exit /b 1
    )
)

echo.
echo  ============================================
echo   Setup Complete!
echo  ============================================
echo.
echo   Double-click start.bat to run.
echo.
echo   Place your GIF/WEBM assets in:
echo     public\assets\
echo.
pause
