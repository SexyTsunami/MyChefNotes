@echo off
title MyChefNotes
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js from https://nodejs.org and then double-click this file again.
  pause
  exit /b 1
)
start "" http://localhost:8787
node server.js
echo.
echo MyChefNotes stopped.
pause
