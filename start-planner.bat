@echo off
setlocal
cd /d "%~dp0"

echo Stopping anything already listening on port 3100...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3100" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%P >nul 2>&1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found on PATH. Install Node.js, then double-click this file again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting HVAC Project Planner at http://localhost:3100
echo The browser will open when the server is ready.
echo Close this window to stop the server.
start "" powershell -NoProfile -WindowStyle Hidden -Command "for ($i=0; $i -lt 80; $i++) { try { $c = New-Object System.Net.Sockets.TcpClient('127.0.0.1',3100); $c.Close(); Start-Process 'http://localhost:3100'; exit 0 } catch { Start-Sleep -Milliseconds 500 } }"
call npm run dev
if errorlevel 1 pause
