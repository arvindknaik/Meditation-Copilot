@echo off
REM ============================================================
REM  Meditation Copilot - stop local test server (port 8000)
REM ============================================================
setlocal EnableDelayedExpansion
set "PORT=8000"
set "FOUND="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  if not "%%P"=="0" if not defined SEEN_%%P (
    set "SEEN_%%P=1"
    set "FOUND=1"
    echo Stopping server process %%P on port %PORT%...
    taskkill /PID %%P /F >nul 2>nul
    if errorlevel 1 (echo   Could not stop process %%P. Try running as administrator.) else (echo   Stopped.)
  )
)

if not defined FOUND echo No server is running on port %PORT%.
timeout /t 3 >nul
endlocal
