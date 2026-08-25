@echo off
REM Double-click button for sync-prod-data.ps1 — pulls prod's live databases
REM down over your local copies. See the comments at the top of that file
REM for what it does and how to configure it (one-time setup: fill in your
REM server address near the top of sync-prod-data.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-prod-data.ps1" %*
pause
