# setup-observability-task.ps1
#
# Registers TWO Windows Scheduled Tasks for the observability widget
# (2026-09-18, fieldy: "the observability of my app needs to be improved" —
# wants to see local<->GitHub<->prod sync drift and site uptime the moment
# things come out of line, with safe issues fixed automatically):
#
#   'bldbible observability collector' — hidden, starts at logon, keeps
#   scripts\observability-status.mjs running forever (polls every ~20s,
#   writes server\.observability\status.json, auto-clears a stale
#   .git\index.lock). Same hidden-window pattern as the lexicon/studio
#   watchers — see observability-collector-hidden.vbs.
#
#   'bldbible observability widget' — VISIBLE (that's the point), starts at
#   logon, shows the small always-on-top window in the top-right of your
#   screen. Its own console is hidden (-WindowStyle Hidden); the WPF window
#   itself is not a console and stays visible.
#
# Must run elevated (Register-ScheduledTask needs an Administrator session
# even for a task that itself runs at your normal, non-elevated logon) -
# right-click PowerShell, "Run as administrator", then:
#     powershell -ExecutionPolicy Bypass -File scripts\setup-observability-task.ps1
#
# Safe to re-run any time - Register-ScheduledTask -Force overwrites these
# two tasks' own definitions and does not touch any of the lexicon/studio
# sync tasks.

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path "$PSScriptRoot\..").Path

$BashExe = (Get-Command bash.exe -ErrorAction SilentlyContinue).Source
if (-not $BashExe) { $BashExe = "$env:ProgramFiles\Git\bin\bash.exe" }
if (-not (Test-Path $BashExe)) {
    throw "bash.exe not found (looked at '$BashExe'). Install Git for Windows, or edit bashExe in scripts\observability-collector-hidden.vbs to its actual path, then re-run."
}

$PowershellExe = (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source
if (-not $PowershellExe) { $PowershellExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" }

# ── Collector (hidden) ──────────────────────────────────────────────────
$CollectorTaskName = 'bldbible observability collector'
$VbsPath    = Join-Path $PSScriptRoot 'observability-collector-hidden.vbs'
$WscriptExe = Join-Path $env:SystemRoot 'System32\wscript.exe'

$CollectorAction   = New-ScheduledTaskAction -Execute $WscriptExe -Argument "`"$VbsPath`""
$CollectorTrigger  = New-ScheduledTaskTrigger -AtLogOn
$CollectorSettings = New-ScheduledTaskSettingsSet `
    -Hidden `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $CollectorTaskName -Action $CollectorAction -Trigger $CollectorTrigger -Settings $CollectorSettings -Force | Out-Null

# ── Widget (visible window, hidden console) ─────────────────────────────
$WidgetTaskName = 'bldbible observability widget'
$WidgetScript   = Join-Path $PSScriptRoot 'observability-widget.ps1'

$WidgetAction   = New-ScheduledTaskAction -Execute $PowershellExe `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$WidgetScript`""
$WidgetTrigger  = New-ScheduledTaskTrigger -AtLogOn
$WidgetSettings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $WidgetTaskName -Action $WidgetAction -Trigger $WidgetTrigger -Settings $WidgetSettings -Force | Out-Null

Write-Host "Registered '$CollectorTaskName' and '$WidgetTaskName' - both start at your next logon."
Write-Host ""
Write-Host "To start both right now, without logging out/in:"
Write-Host "    Start-ScheduledTask -TaskName '$CollectorTaskName'"
Write-Host "    Start-ScheduledTask -TaskName '$WidgetTaskName'"
Write-Host ""
Write-Host "To check the collector is alive:"
Write-Host "    Get-ScheduledTask -TaskName '$CollectorTaskName' | Get-ScheduledTaskInfo"
Write-Host "    Get-Content ~\observability.log -Tail 20"
Write-Host ""
Write-Host "To stop either (e.g. before uninstalling):"
Write-Host "    Stop-ScheduledTask -TaskName '$CollectorTaskName'; Unregister-ScheduledTask -TaskName '$CollectorTaskName' -Confirm:`$false"
Write-Host "    Stop-ScheduledTask -TaskName '$WidgetTaskName'; Unregister-ScheduledTask -TaskName '$WidgetTaskName' -Confirm:`$false"
Write-Host ""
Write-Host "If the widget window is already open from an earlier run and you just changed"
Write-Host "observability-widget.ps1, close that window and re-run:"
Write-Host "    Start-ScheduledTask -TaskName '$WidgetTaskName'"
