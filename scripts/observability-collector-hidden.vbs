' observability-collector-hidden.vbs
'
' Runs scripts\observability-status.mjs through Git Bash's node with NO
' visible console window. Same pattern as lexicon-watch-hidden.vbs /
' studio-sync-watch-hidden.vbs — see those files' own headers for why this
' goes through wscript.exe + WshShell.Run(0) instead of bash.exe directly
' (the scheduled task's own -Hidden setting only hides the TASK from Task
' Scheduler's list, not a launched .exe's own window).
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
    Set logFile = fso.OpenTextFile(shell.ExpandEnvironmentStrings("%USERPROFILE%") & "\observability.log", 8, True)
    logFile.WriteLine Now & " bash.exe not found at the usual Git install paths - edit bashExe in observability-collector-hidden.vbs"
    logFile.Close
    WScript.Quit 1
End If

cmd = Chr(34) & bashExe & Chr(34) & " -lc " & Chr(34) & _
      "cd '" & repoRoot & "' && node scripts/observability-status.mjs >> ~/observability.log 2>&1" & Chr(34)

shell.Run cmd, 0, False
