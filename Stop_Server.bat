@echo off
chcp 65001 >nul
title Stop POLE MAP Server
echo กำลังค้นหาและปิดโปรเซส POLE MAP พอร์ต 3406...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3406" ^| findstr "LISTENING"') do (
    echo กำลังปิด PID: %%a
    taskkill /F /PID %%a >nul 2>nul
)

echo ปิดเซิร์ฟเวอร์ POLE MAP เรียบร้อยแล้ว
timeout /t 2 >nul
