# restart-observability-collector.ps1
#
# Reliably restarts the "bldbible observability collector" scheduled task.
#
# fieldy, 2026-09-22: Stop-ScheduledTask + Start-ScheduledTask alone are NOT
# enough here, and it took a genuine live incident to prove it -- a fix to
# observability-status.mjs sat completely inert for 3+ hours (the widget's
# pending-files list kept showing a corrupted path and failing Commit &
# Push) across a PowerShell Stop/Start-ScheduledTask attempt AND a manual
# restart from the Task Scheduler GUI, neither of which actually killed
# the running collector process.
#
# Why: the task's action launches observability-collector-hidden.vbs,
# which spawns bash.exe DETACHED (shell.Run(cmd, 0, False) -- the "False"
# means wscript.exe doesn't wait for or track it), which in turn spawns
# node.exe. Task Scheduler's Stop only reaches the process it directly
# launched (wscript.exe); the detached bash.exe/node.exe grandchildren
# aren't in its job object and just keep running through every stop/start
# cycle. From Stop-ScheduledTask's caller's point of view this looks like
# nothing happened, because nothing did -- the old node.exe silently won
# every restart race afterward too, via its own single-instance lock
# (acquireSingleInstanceLock in observability-status.mjs) correctly
# refusing to let a second copy take over.
#
# That single-instance lock is also the fix: it's the collector process
# itself, not Task Scheduler, that writes the one authoritative PID
# (server\.observability\collector.pid) -- ground truth, independent of
# whatever process tree Task Scheduler thinks it's tracking. This script
# kills THAT pid directly (via taskkill /T /F, in case bash.exe is still
# hanging around as its parent too), confirms it's actually gone, starts
# the task fresh, and polls collector.pid until a NEW pid takes over --
# printing each step explicitly so a run of this script is never another
# "did that actually do anything?" moment.
#
# Run directly:
#     powershell -ExecutionPolicy Bypass -File scripts\restart-observability-collector.ps1
#
# The widget's new "Restart Collector" button (observability-widget.ps1)
# runs this exact same logic in-process for a one-click version.

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$PidFile  = Join-Path $RepoRoot 'server\.observability\collector.pid'
$TaskName = 'bldbible observability collector'

function Get-CollectorPid {
    if (-not (Test-Path $PidFile)) { return $null }
    $raw = (Get-Content $PidFile -Raw -ErrorAction SilentlyContinue)
    if ($null -eq $raw) { return $null }
    $raw = $raw.Trim()
    if ($raw -match '^\d+$') { return [int]$raw }
    return $null
}

Write-Host "== Restarting '$TaskName' =="

$oldPid = Get-CollectorPid
if ($oldPid) {
    $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "Found running collector: pid $oldPid ($($proc.ProcessName), started $($proc.StartTime))."
        Write-Host "Killing pid $oldPid (and any of its own children) via taskkill /T /F..."
        & taskkill /PID $oldPid /T /F 2>&1 | ForEach-Object { Write-Host "  $_" }
        Start-Sleep -Milliseconds 500
        if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {
            Write-Warning "pid $oldPid is STILL alive after taskkill. If this keeps happening, the scheduled task may need 'Run with highest privileges' -- re-run this script from an elevated PowerShell."
        } else {
            Write-Host "pid $oldPid is confirmed gone."
        }
    } else {
        Write-Host "collector.pid says $oldPid, but nothing's running there -- already dead, nothing to kill."
    }
} else {
    Write-Host "No collector.pid found -- nothing to kill."
}

Write-Host "Starting '$TaskName'..."
Start-ScheduledTask -TaskName $TaskName

Write-Host "Waiting for the collector to report a fresh pid..."
$newPid = $null
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    $candidate = Get-CollectorPid
    if ($candidate -and $candidate -ne $oldPid -and (Get-Process -Id $candidate -ErrorAction SilentlyContinue)) {
        $newPid = $candidate
        break
    }
}

if ($newPid) {
    Write-Host "Collector is back up as pid $newPid. Done."
} else {
    Write-Warning "Didn't see a new pid take over collector.pid within 10s. Check ~\observability.log, or that Git Bash's bash.exe is where observability-collector-hidden.vbs expects it."
}
