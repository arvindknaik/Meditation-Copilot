@echo off
REM ============================================================
REM  Meditation Copilot - add, commit and push to GitHub
REM  Double-click this file, type a commit message, press Enter.
REM ============================================================
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Meditation Copilot - Push to GitHub

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git is not installed or not on PATH.
  echo         Install it from https://git-scm.com/download/win and try again.
  goto :fail
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [ERROR] This folder is not a Git repository:
  echo         %CD%
  goto :fail
)

for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%B"
echo.
echo Repository : %CD%
echo Branch     : !BRANCH!
echo.
echo Changes to be committed:
echo ------------------------------------------------------------
git status --short
echo ------------------------------------------------------------
echo.

git add -A
if errorlevel 1 (
  echo [ERROR] git add failed.
  goto :fail
)

git diff --cached --quiet
if not errorlevel 1 (
  echo No new changes to commit. Pushing any earlier commits...
  goto :push
)

:ask
set "MSG="
set /p "MSG=Commit message: "
if not defined MSG (
  echo   Please enter a message describing your changes.
  goto :ask
)

REM Write the message to a temp file so quotes, ^& and ^| are safe
set "MSGFILE=%TEMP%\mc_commit_msg_%RANDOM%.txt"
> "!MSGFILE!" echo(!MSG!
git commit -F "!MSGFILE!"
set "RC=!errorlevel!"
del "!MSGFILE!" >nul 2>nul
if not "!RC!"=="0" (
  echo [ERROR] git commit failed.
  goto :fail
)

:push
echo.
echo Pushing to GitHub...
git push
if errorlevel 1 (
  echo.
  echo [ERROR] git push failed.
  echo         - If asked, sign in to GitHub as arvindknaik.
  echo         - If GitHub has newer changes, run:  git pull --rebase   then run this file again.
  goto :fail
)

echo.
echo ============================================================
echo  Done. GitHub Pages updates in 1-2 minutes:
echo  https://arvindknaik.github.io/Meditation-Copilot/
echo ============================================================
echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
