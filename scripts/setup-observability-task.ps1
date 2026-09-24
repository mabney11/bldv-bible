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
#   watchers — see observability-collector-hidden.vbs. UNCHANGED below —
#   this half was never the problem.
#
#   'bldbible observability widget' — VISIBLE (that's the point), starts at
#   logon, shows the small always-on-top window in the top-right of your
#   screen, with NO console ever.
#
# fieldy, 2026-09-24: the widget used to be observability-widget.ps1
# (WPF/PowerShell), launched through a vbs wrapper (wscript.exe +
# WshShell.Run(0)) to hide its console. Three separate PowerShell/WPF-only
# bugs in five days later — a literal `--` inside an XAML comment breaking
# the XML parse, a console window that had to stay open when run directly,
# and finally a genuinely missing closing quote on the Bake ToolTip line
# that made PowerShell fail to parse the WHOLE script at load time, before
# any of its own logging ever ran, so the failure was completely silent —
# rewritten in Python instead (scripts\observability_widget.pyw). Every
# failure path in that file logs to ~\observability.log BEFORE doing
# anything else. pythonw.exe has NO console window by construction, so
# there's no vbs wrapper needed for the widget any more either.
#
# One-time setup before this will work: pip install pystray pillow
#
# Must run elevated (Register-ScheduledTask needs an Administrator session
# even for a task that itself runs at your normal, non-elevated logon) -
# right-click PowerShell, "Run as administrator", then:
#     powershell -ExecutionPolicy Bypass -File scripts\setup-observability-task.ps1
#
# Safe to re-run any time - Register-ScheduledTask -Force overwrites these
# two tasks' own definitions and does not touch any of the lexicon/studio
# sync tasks.
#
# observability-widget.ps1 and observability-widget-hidden.vbs are no
# longer used by this script and are safe to delete once the Python widget
# has been running happily for a while.

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path "$PSScriptRoot\..").Path

$BashExe = (Get-Command bash.exe -ErrorAction SilentlyContinue).Source
if (-not $BashExe) { $BashExe = "$env:ProgramFiles\Git\bin\bash.exe" }
if (-not (Test-Path $BashExe)) {
    throw "bash.exe not found (looked at '$BashExe'). Install Git for Windows, or edit bashExe in scripts\observability-collector-hidden.vbs to its actual path, then re-run."
}

$WscriptExe = Join-Path $env:SystemRoot 'System32\wscript.exe'

$PythonwExe = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $PythonwExe) {
    throw "pythonw.exe not found on PATH. Install Python from python.org (check 'Add python.exe to PATH' during install) so pythonw.exe sits right next to it, then re-run this script. Once Python is on PATH, also run: pip install pystray pillow"
}

# ── Collector (hidden) ──────────────────────────────────────────────────
$CollectorTaskName = 'bldbible observability collector'
$CollectorVbsPath  = Join-Path $PSScriptRoot 'observability-collector-hidden.vbs'

$CollectorAction   = New-ScheduledTaskAction -Execute $WscriptExe -Argument "`"$CollectorVbsPath`""
$CollectorTrigger  = New-ScheduledTaskTrigger -AtLogOn
$CollectorSettings = New-ScheduledTaskSettingsSet `
    -Hidden `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $CollectorTaskName -Action $CollectorAction -Trigger $CollectorTrigger -Settings $CollectorSettings -Force | Out-Null

# ── Widget (visible window, NO console — pythonw.exe never has one) ────
$WidgetTaskName   = 'bldbible observability widget'
$WidgetScriptPath = Join-Path $PSScriptRoot 'observability_widget.pyw'

$WidgetAction   = New-ScheduledTaskAction -Execute $PythonwExe -Argument "`"$WidgetScriptPath`""
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
Write-Host "First time only, if you haven't already:"
Write-Host "    pip install pystray pillow"
Write-Host ""
Write-Host "To start both right now, without logging out/in:"
Write-Host "    Start-ScheduledTask -TaskName '$CollectorTaskName'"
Write-Host "    Start-ScheduledTask -TaskName '$WidgetTaskName'"
Write-Host ""
Write-Host "To check either is alive:"
Write-Host "    Get-ScheduledTask -TaskName '$CollectorTaskName' | Get-ScheduledTaskInfo"
Write-Host "    Get-Content ~\observability.log -Tail 20"
Write-Host "    Select-String -Path ~\observability.log -Pattern 'observability_widget'"
Write-Host ""
Write-Host "To stop either (e.g. before uninstalling):"
Write-Host "    Stop-ScheduledTask -TaskName '$CollectorTaskName'; Unregister-ScheduledTask -TaskName '$CollectorTaskName' -Confirm:`$false"
Write-Host "    Stop-ScheduledTask -TaskName '$WidgetTaskName'; Unregister-ScheduledTask -TaskName '$WidgetTaskName' -Confirm:`$false"
Write-Host ""
Write-Host "If the widget window is already open from an earlier run and you just changed"
Write-Host "observability_widget.pyw, close that window (tray icon -> Exit) and re-run:"
Write-Host "    Start-ScheduledTask -TaskName '$WidgetTaskName'"
Write-Host ""
Write-Host "Don't want to re-run this right now? Just double-click"
Write-Host "scripts\observability_widget.pyw directly -- Windows normally opens .pyw files"
Write-Host "with pythonw.exe automatically, so still no console."
