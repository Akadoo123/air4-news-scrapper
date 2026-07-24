@echo off
REM ============================================================
REM  Air4 Daily Automotive Intelligence - ตัวเรียกใช้สำหรับ Task Scheduler
REM
REM  มีไฟล์นี้เพื่อเลี่ยงปัญหาการใส่เครื่องหมายคำพูดซ้อนกันใน
REM  powershell.exe -Command "..." ซึ่งพังทันทีเมื่อพาธมีช่องว่าง
REM  (โฟลเดอร์โปรเจกต์ชื่อ "Air4 News Scrap" มีช่องว่างอยู่)
REM
REM  เรียกใช้เองได้ด้วย:  scripts\run-daily.cmd
REM ============================================================

setlocal

REM ย้ายไปยังโฟลเดอร์โปรเจกต์ (โฟลเดอร์แม่ของ scripts\)
cd /d "%~dp0.."

if not exist "logs" mkdir "logs"

REM หมุนไฟล์ log เมื่อเกิน ~5 MB เพื่อไม่ให้โตไม่จำกัด (รันทุกวันตลอดปี)
if exist "logs\daily.log" (
  for %%F in ("logs\daily.log") do if %%~zF GTR 5242880 (
    if exist "logs\daily.log.old" del "logs\daily.log.old"
    move /y "logs\daily.log" "logs\daily.log.old" >nul
  )
)

echo. >> "logs\daily.log"
echo ============================================================ >> "logs\daily.log"
echo [%date% %time%] เริ่มทำงาน >> "logs\daily.log"
echo ============================================================ >> "logs\daily.log"

call npm run daily >> "logs\daily.log" 2>&1
set EXITCODE=%ERRORLEVEL%

echo [%date% %time%] จบการทำงาน (exit code: %EXITCODE%) >> "logs\daily.log"

REM คืนค่า exit code ให้ Task Scheduler เห็นผลลัพธ์จริง
exit /b %EXITCODE%
