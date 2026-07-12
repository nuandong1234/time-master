@echo off
chcp 65001 >nul
cd /d "%~dp0"

set PATH=%PATH%;%USERPROFILE%\.cargo\bin

echo ========================================
echo    Time Master - Time Management App
echo ========================================
echo.
echo Killing old processes...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im cargo.exe >nul 2>&1
taskkill /f /im rustc.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo Starting app (first build may take 3-5 min)...
echo.
npm run tauri dev

if %errorlevel% neq 0 (
    echo.
    echo [!] Failed to start.
    echo Make sure Rust and Node.js are installed.
    echo.
    pause
)
