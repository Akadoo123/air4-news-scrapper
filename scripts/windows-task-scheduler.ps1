<#
.SYNOPSIS
    ตั้ง Windows Task Scheduler ให้รัน Air4 Daily Intelligence ทุกวัน 08:00 น.

.DESCRIPTION
    ทางเลือกสำหรับกรณีที่ไม่ใช้ GitHub Actions (เช่น รันบนเครื่องเซิร์ฟเวอร์ในบริษัท)
    เครื่องต้องเปิดอยู่ ณ เวลาที่กำหนด — ถ้าพลาดรอบ ระบบจะรันให้ทันทีที่เปิดเครื่อง

.EXAMPLE
    # ติดตั้ง (ระดับผู้ใช้ ไม่ต้องใช้สิทธิ์ Administrator)
    .\scripts\windows-task-scheduler.ps1 -Install

.EXAMPLE
    # ติดตั้งแบบรันได้แม้ไม่ได้ล็อกอิน (ต้อง Run as Administrator)
    .\scripts\windows-task-scheduler.ps1 -Install -Elevated

.EXAMPLE
    # ถอนการติดตั้ง
    .\scripts\windows-task-scheduler.ps1 -Uninstall

.EXAMPLE
    # ทดสอบรันทันที
    .\scripts\windows-task-scheduler.ps1 -RunNow

.EXAMPLE
    # ดูสถานะและเวลารันครั้งถัดไป
    .\scripts\windows-task-scheduler.ps1 -Status
#>
param(
    [switch]$Install,
    [switch]$Uninstall,
    [switch]$RunNow,
    [switch]$Status,
    [switch]$Elevated,
    [string]$TaskName = 'Air4DailyIntelligence',
    [string]$Time = '08:00'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Test-Admin {
    $identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if ($Install) {
    # โหมด -Elevated ให้รันได้แม้ไม่ได้ล็อกอิน แต่ต้องมีสิทธิ์ Administrator
    if ($Elevated -and -not (Test-Admin)) {
        throw 'โหมด -Elevated ต้องรัน PowerShell แบบ Run as Administrator'
    }

    $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
    if ($null -eq $npm) { throw 'ไม่พบ npm — ติดตั้ง Node.js ก่อน' }

    # ให้ log ลงไฟล์เพื่อตรวจย้อนหลังได้
    $logDir = Join-Path $ProjectRoot 'logs'
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory $logDir | Out-Null }

    # เรียกผ่านไฟล์ .cmd แทนการส่งคำสั่งยาว ๆ เข้า powershell -Command
    # เพราะพาธโปรเจกต์มีช่องว่าง ("Air4 News Scrap") ทำให้เครื่องหมายคำพูดซ้อนกันแล้วพัง
    $runner = Join-Path $PSScriptRoot 'run-daily.cmd'
    if (-not (Test-Path $runner)) { throw "ไม่พบไฟล์ $runner" }
    $action = New-ScheduledTaskAction -Execute $runner -WorkingDirectory $ProjectRoot

    $trigger = New-ScheduledTaskTrigger -Daily -At $Time

    # AllowStartIfOnBatteries / DontStopIfGoingOnBatteries จำเป็นมากบนโน้ตบุ๊ก
    # ค่าเริ่มต้นของ Windows คือ "ห้ามรันเมื่อใช้แบตเตอรี่" ซึ่งจะทำให้งานค้างสถานะ
    # Queued แล้วไม่รันเลยแบบเงียบ ๆ ทุกวันที่ไม่ได้เสียบปลั๊ก
    #
    # WakeToRun: ปลุกเครื่องจาก sleep/hibernate มารันตอน 08:00 เอง
    # (ใช้ได้เฉพาะ sleep/hibernate — ถ้าปิดเครื่องสนิทยังต้องเปิดเอง
    #  แล้ว StartWhenAvailable จะรันให้ทันทีที่เปิด)
    $settings = New-ScheduledTaskSettingsSet `
                  -StartWhenAvailable `
                  -DontStopOnIdleEnd `
                  -AllowStartIfOnBatteries `
                  -DontStopIfGoingOnBatteries `
                  -WakeToRun `
                  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
                  -RestartCount 2 `
                  -RestartInterval (New-TimeSpan -Minutes 10)

    try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop } catch {}

    $register = @{
        TaskName    = $TaskName
        Action      = $action
        Trigger     = $trigger
        Settings    = $settings
        Description = 'Air4 Daily Automotive Intelligence - ดึงและวิเคราะห์ข่าวประจำวัน'
    }
    if ($Elevated) {
        # รันได้แม้ไม่ได้ล็อกอิน (ต้องใส่รหัสผ่านบัญชี หรือใช้บัญชีระบบ)
        $register.RunLevel = 'Highest'
    } else {
        # งานระดับผู้ใช้: รันเมื่อผู้ใช้ล็อกอินอยู่ ไม่ต้องใช้สิทธิ์ Administrator
        $register.Principal = New-ScheduledTaskPrincipal `
            -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
            -LogonType Interactive -RunLevel Limited
    }
    Register-ScheduledTask @register | Out-Null

    $task = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Output "ติดตั้งงานตามกำหนดเวลาเรียบร้อย: $TaskName (ทุกวัน $Time น.)"
    Write-Output "โหมด      : $(if ($Elevated) { 'ระดับระบบ (รันได้แม้ไม่ล็อกอิน)' } else { 'ระดับผู้ใช้ (ต้องล็อกอินค้างไว้)' })"
    Write-Output "รันครั้งถัดไป: $($task.NextRunTime)"
    Write-Output "Log       : $logDir\daily.log"
    Write-Output ''
    Write-Output 'ถ้าเครื่องปิดอยู่ตอน 08:00 ระบบจะรันให้ทันทีที่เปิดเครื่อง (StartWhenAvailable)'
    Write-Output 'ใส่ ANTHROPIC_API_KEY ใน .env เพื่อใช้ AI — ถ้าไม่ใส่จะวิเคราะห์ด้วยกฎอัตโนมัติ'
}
elseif ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "ถอนการติดตั้งงาน $TaskName เรียบร้อย"
}
elseif ($RunNow) {
    Start-ScheduledTask -TaskName $TaskName
    Write-Output "สั่งรัน $TaskName แล้ว — ดูผลได้ที่ logs\daily.log"
}
elseif ($Status) {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -eq $task) {
        Write-Output "ยังไม่ได้ติดตั้งงาน $TaskName"
    } else {
        $info = Get-ScheduledTaskInfo -TaskName $TaskName
        Write-Output "งาน          : $TaskName"
        Write-Output "สถานะ        : $($task.State)"
        Write-Output "รันครั้งล่าสุด : $($info.LastRunTime)  (ผลลัพธ์: $($info.LastTaskResult))"
        Write-Output "รันครั้งถัดไป : $($info.NextRunTime)"
    }
}
else {
    Get-Help $PSCommandPath -Detailed
}
