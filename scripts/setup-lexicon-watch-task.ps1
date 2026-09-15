# setup-lexicon-watch-task.ps1
#
# Registers a Windows Scheduled Task that starts lexicon-watch.sh at logon
# and keeps it running in the background, restarting it automatically if it
# ever dies - the local half of the lexicon-sync system (2026-09-15):
# lexicon-sync.sh already commits/pulls/pushes server/lexicon and runs on a
# 5-minute cron on the Lightsail box; this gives fieldy's own machine the
# same automatic commit+push, on a ~15s poll of the local working tree, so a
# lexicon edit made here never needs a manual `git push` again. Same
# hidden-window pattern as scripts/setup-studio-sync-watch-task.ps1 - see
# that file's own comments for why it goes through the .vbs instead of
# bash.exe directly.
#
# Must run elevated (Register-ScheduledTask needs an Administrator session
# even for a task that itself runs at your normal, non-elevated logon) -
# right-click PowerShell, "Run as administrator", then:
#     powershell -ExecutionPolicy Bypass -File scripts\setup-lexicon-watch-task.ps1
#
# Safe to re-run any time - Register-ScheduledTask -Force overwrites this
# task's own definition and does not touch 'bldbible studio sync watch' or
# the older 5-minute 'bldbible studio sync' task.

$ErrorActionPreference = 'Stop'
$TaskName = 'bldbible lexicon watch'
$RepoRoot = (Resolve-Path "$PSScriptRoot\..").Path

$BashExe = (Get-Command bash.exe -ErrorAction SilentlyContinue).Source
if (-not $BashExe) { $BashExe = "$env:ProgramFiles\Git\bin\bash.exe" }
if (-not (Test-Path $BashExe)) {
    throw "bash.exe not found (looked at '$BashExe'). Install Git for Windows, or edit bashExe in scripts\lexicon-watch-hidden.vbs to its actual path, then re-run."
}

$VbsPath    = Join-Path $PSScriptRoot 'lexicon-watch-hidden.vbs'
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
Write-Host "To start it right now, without logging out/in:"
Write-Host "    Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "To check it's alive:"
Write-Host "    Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
Write-Host "    Get-Content ~\lexicon-watch.log -Tail 20"
Write-Host ""
Write-Host "To stop it (e.g. before uninstalling):"
Write-Host "    Stop-ScheduledTask -TaskName '$TaskName'; Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
Write-Host ""
Write-Host "The box-side 5-minute lexicon-sync cron and studio-sync-watch are untouched."
