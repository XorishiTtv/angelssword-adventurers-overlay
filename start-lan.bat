@echo off
setlocal

set "NODE_DIR=%~dp0runtime"

:: Use bundled Node.js if available, otherwise try system Node
if exist "%NODE_DIR%\node.exe" (
    set "NODE=%NODE_DIR%\node.exe"
    set "PATH=%NODE_DIR%;%PATH%"
) else (
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo.
        echo  Node.js not found! Run setup.bat first.
        echo.
        pause
        exit /b 1
    )
    set "NODE=node"
)

:: Install deps if missing
if not exist "node_modules" (
    echo  Installing dependencies...
    if exist "%NODE_DIR%\npm.cmd" (
        call "%NODE_DIR%\npm.cmd" install --production
    ) else (
        npm install --production
    )
    echo.
)

echo.
echo  ============================================
echo   AS Adventurer - Secure LAN Mode
echo  ============================================
echo.
echo  This mode is visible to other devices on your
echo  trusted home/private network.
echo.
echo  On first launch, Windows creates a local HTTPS
echo  certificate so remote camera and microphone access works.
echo.
echo  Each LAN computer registers a private machine token.
echo  Its uploaded assets are stored separately under machine-data.
echo.
echo  Models in public\assets are shared read-only global models.
echo.
echo  Press Ctrl+C to stop the server.
echo.

cd /d "%~dp0"
"%NODE%" lan-global-server.js
pause
