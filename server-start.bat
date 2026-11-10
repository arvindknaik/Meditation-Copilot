@echo off
REM ============================================================
REM  Meditation Copilot - start local test server
REM  Serves this folder at http://localhost:8000/ and opens it.
REM  (localhost:8000 is registered with Google and Microsoft sign-in.)
REM ============================================================
setlocal
cd /d "%~dp0"
set "PORT=8000"
set "URL=http://localhost:%PORT%/"

REM Already running? Just open the browser.
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo Server is already running on port %PORT%.
  start "" "%URL%"
  goto :end
)

REM Find Python: prefer the "py" launcher, then "python"
set "PY="
py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY (
  python --version >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo [ERROR] Python 3 was not found.
  echo         Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
  pause
  exit /b 1
)

echo Starting local server with %PY% on %URL%
echo (A minimized window named "Meditation Copilot server" runs the server.
echo  Use server-stop.bat or close that window to stop it.)
start "Meditation Copilot server" /min %PY% -m http.server %PORT% --bind 127.0.0.1 --directory "%~dp0."

REM Give it a moment, then open the app
timeout /t 2 /nobreak >nul
start "" "%URL%"

:end
endlocal
