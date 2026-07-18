@echo off
echo.
echo  ============================================
echo   AS Adventurer - LAN Release Builder
echo  ============================================
echo.
cd /d "%~dp0"
node build-release-with-lan.js
pause
