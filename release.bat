@echo off
REM Minneapolis Meditation Center apps: build, test and release. Double-click, or run: release build ^| test ^| prod ^| status ^| rollback test^|prod
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is needed: https://nodejs.org & pause & exit /b 1)
if not exist node_modules ( echo Installing tools the first time... & call npm install || (pause & exit /b 1) )
if not "%~1"=="" ( node tools\release.mjs %* & pause & exit /b )
echo.
echo   1  Build     - commit, run all tests, number the build, push to GitHub
echo   2  Test      - deploy the current build to test.sosmn.org
echo   3  Prod      - release notes, back up, deploy to sosmn.org
echo   4  Status    - what is built, on test and live
echo   5  Run locally (localhost:8000 / 8001)
echo   6  First-time set-up of test.sosmn.org (once)
echo.
set /p C=Choose 1-6: 
if "%C%"=="1" node tools\release.mjs build
if "%C%"=="2" node tools\release.mjs test
if "%C%"=="3" node tools\release.mjs prod
if "%C%"=="4" node tools\release.mjs status
if "%C%"=="5" node tools\dev.mjs
if "%C%"=="6" node tools\release.mjs setup-test
pause
