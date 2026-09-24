' observability-widget-hidden.vbs
'
' Runs scripts\observability-widget.ps1 through Windows PowerShell with NO
' visible console window -- ever, not even a brief flash. Same pattern as
' observability-collector-hidden.vbs / lexicon-watch-hidden.vbs /
' studio-sync-watch-hidden.vbs: WshShell.Run(cmd, 0, False) hides the
' launched process's own window outright, which is more reliable than
' relying on `powershell.exe -WindowStyle Hidden` alone (that flag is known
' to still flash a window briefly on some Windows/PowerShell builds -- the
' exact reason this project's other watchers already go through wscript.exe
' instead of trusting -WindowStyle Hidden by itself).
'
' fieldy, 2026-09-24: "its launching a terminal window that must stay open,
' i dont like that" -- after running observability-widget.ps1 "directly"
' (per that file's own dev/debug instructions) to verify a fix, and not
' wanting to keep a console open just to keep the widget alive. Double-click
' THIS file instead (or a shortcut to it, e.g. dropped in your Startup
' folder so it launches at logon without needing the scheduled task at
' all) -- no console ever appears, and there's nothing to accidentally
' close that would kill the widget with it.
'
' setup-observability-task.ps1 also registers the 'bldbible observability
' widget' scheduled task to launch through this same file, so a normal
' logon gets the exact same no-console behavior automatically once that
' setup script has been run (elevated) at least once.
'
' fieldy, 2026-09-24: first real run of this via Task Scheduler didn't pop
' up at all, with nothing anywhere saying why -- a launcher that fails (or
' that simply refuses to open a second window, see observability-widget.ps1's
' own single-instance mutex check) completely silently is useless to debug.
' Every attempt now writes ONE line to ~\observability.log (same log file
' the collector and its own vbs already use) before doing anything else, so
' "did this even run" is always answerable, and the two most likely reasons
' powershell.exe/the widget script might not be found are checked and logged
' explicitly instead of just failing to launch with no trace.
Option Explicit
Dim shell, fso, scriptDir, widgetScript, powershellExe, cmd, logPath, logFile

Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")

scriptDir    = fso.GetParentFolderName(WScript.ScriptFullName)   ' ...\paleo-studio\scripts
widgetScript = scriptDir & "\observability-widget.ps1"
logPath      = shell.ExpandEnvironmentStrings("%USERPROFILE%") & "\observability.log"

powershellExe = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"

Sub LogLine(msg)
    On Error Resume Next
    Set logFile = fso.OpenTextFile(logPath, 8, True)
    logFile.WriteLine Now & " observability-widget-hidden.vbs: " & msg
    logFile.Close
    On Error Goto 0
End Sub

If Not fso.FileExists(powershellExe) Then
    LogLine "powershell.exe not found at " & powershellExe & " -- widget NOT launched"
    WScript.Quit 1
End If

If Not fso.FileExists(widgetScript) Then
    LogLine "widget script not found at " & widgetScript & " -- widget NOT launched"
    WScript.Quit 1
End If

LogLine "launching " & widgetScript & " (if nothing appears after this, the widget's OWN single-instance mutex is refusing to open a second window -- check the system tray, including hidden icons, for an already-running crowned-lion icon, or Task Manager for a leftover powershell.exe to end)"

cmd = Chr(34) & powershellExe & Chr(34) & _
      " -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & widgetScript & Chr(34)

shell.Run cmd, 0, False
