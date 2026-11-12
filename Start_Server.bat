@echo off
chcp 65001 >nul
title POLE MAP Server (Port 3406)
cd /d "%~dp0"

where node >nul 2>nul
if not errorlevel 1 (
    netstat -ano | findstr /R /C:":3406 .*LISTENING" >nul 2>nul
    if errorlevel 1 (
        start "POLE MAP Server (Port 3406)" /min node "%~dp0server.cjs"
        ping 127.0.0.1 -n 3 >nul
    )
    start "" "http://127.0.0.1:3406/polemap/"
    exit /b 0
)

echo [ERROR] ไม่พบ Node.js ในระบบ กรุณาติดตั้ง Node.js
pause
