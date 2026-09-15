' studio-sync-watch-hidden.vbs
'
' Runs studio-sync-watch.sh through Git Bash with NO visible console window.
'
' The scheduled task's own -Hidden setting (see setup-studio-sync-watch-task.ps1)
' only hides the TASK from Task Scheduler's own list - it has no effect on the
' console window a launched .exe opens, which is why running bash.exe directly
' as the task's action popped up a visible Git Bash window. wscript.exe running
' THIS script shows nothing itself, and WshShell.Run's window-style argument
' (0 = hidden) keeps the bash.exe window it launches hidden too.
Option Explicit
Dim shell, fso, scriptDir, repoRoot, bashExe, cmd, logFile

Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)    ' ...\paleo-studio\scripts
repoRoot  = fso.GetParentFolderName(scriptDir)                 ' ...\paleo-studio
repoRoot  = Replace(repoRoot, "\", "/")

bashExe = shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Git\bin\bash.exe"
If Not fso.FileExists(bashExe) Then
    bashExe = shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Git\bin\bash.exe"
End If

If Not fso.FileExists(bashExe) Then
    ' Nothing safe to pop up from a hidden script - leave a trail instead of
    ' failing silently forever.
    Set logFile = fso.OpenTextFile(shell.ExpandEnvironmentStrings("%USERPROFILE%") & "\studio-sync-watch.log", 8, True)
    logFile.WriteLine Now & " bash.exe not found at the usual Git install paths - edit bashExe in studio-sync-watch-hidden.vbs"
    logFile.Close
    WScript.Quit 1
End If

cmd = Chr(34) & bashExe & Chr(34) & " -lc " & Chr(34) & _
      "cd '" & repoRoot & "' && ./studio-sync-watch.sh >> ~/studio-sync-watch.log 2>&1" & Chr(34)

shell.Run cmd, 0, False
