# setup-studio-sync-watch-task.ps1
#
# Registers a Windows Scheduled Task that starts studio-sync-watch.sh at
# logon and keeps it running in the background, restarting it automatically
# if it ever dies. This is the "trigger-based" half of studio sync
# (2026-09-15): it polls translation.db's mtime on prod every ~15s (cheap,
# no docker run) and only runs the full studio-sync.sh round trip when
# something actually changed, instead of waiting up to 5 minutes for the
# existing scheduled task.
#
# Runs through studio-sync-watch-hidden.vbs (wscript.exe) rather than
# bash.exe directly, so no console window is ever visible - the task's own
# -Hidden setting below only hides the TASK from Task Scheduler's list, it
# does nothing about a launched .exe's own window, which is why running
# bash.exe as the action directly pops a visible Git Bash window.
#
# Must run elevated (Register-ScheduledTask needs an Administrator session
# even for a task that itself runs at your normal, non-elevated logon) -
# right-click PowerShell, "Run as administrator", then:
#     powershell -ExecutionPolicy Bypass -File scripts\setup-studio-sync-watch-task.ps1
#
# Safe to re-run any time - Register-ScheduledTask -Force overwrites this
# task's own definition and does not touch the separate, older
# "bldbible studio sync" (5-minute) task, which is kept on purpose as a
# backstop for whenever this watcher isn't running. If the task is already
# running under the OLD (visible-window) action when you re-run this after
# an update, stop and restart it to pick up the change:
#     Stop-ScheduledTask -TaskName 'bldbible studio sync watch'
#     Start-ScheduledTask -TaskName 'bldbible studio sync watch'

$ErrorActionPreference = 'Stop'
$TaskName = 'bldbible studio sync watch'
$RepoRoot = (Resolve-Path "$PSScriptRoot\..").Path

# Preflight check only (the actual launch path is the .vbs, which does its
# own bash.exe detection at run time) - fail loudly now rather than have the
# hidden task silently do nothing later.
$BashExe = (Get-Command bash.exe -ErrorAction SilentlyContinue).Source
if (-not $BashExe) { $BashExe = "$env:ProgramFiles\Git\bin\bash.exe" }
if (-not (Test-Path $BashExe)) {
    throw "bash.exe not found (looked at '$BashExe'). Install Git for Windows, or edit bashExe in scripts\studio-sync-watch-hidden.vbs to its actual path, then re-run."
}

$VbsPath   = Join-Path $PSScriptRoot 'studio-sync-watch-hidden.vbs'
$WscriptExe = Join-Path $env:SystemRoot 'System32\wscript.exe'

$Action   = New-ScheduledTaskAction -Execute $WscriptExe -Argument "`"$VbsPath`""
$Trigger  = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
    -Hidden `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' - it will start at your next logon, with no visible window."
Write-Host ""
Write-Host "If it's already running from an earlier setup, restart it to pick up the hidden-window change:"
Write-Host "    Stop-ScheduledTask -TaskName '$TaskName'"
Write-Host "    Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "To start it right now, without logging out/in:"
Write-Host "    Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "To check it's alive:"
Write-Host "    Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
Write-Host "    Get-Content ~\studio-sync-watch.log -Tail 20"
Write-Host ""
Write-Host "To stop it (e.g. before uninstalling):"
Write-Host "    Stop-ScheduledTask -TaskName '$TaskName'; Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
Write-Host ""
Write-Host "The existing 5-minute 'bldbible studio sync' task is untouched and stays as a backstop."
