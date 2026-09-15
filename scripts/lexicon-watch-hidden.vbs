' lexicon-watch-hidden.vbs
'
' Runs lexicon-watch.sh through Git Bash with NO visible console window.
' Same wscript.exe + WshShell.Run(0) pattern as studio-sync-watch-hidden.vbs
' - see that file's own header for why the task's own -Hidden setting alone
' does not suppress bash.exe's console window.
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
    Set logFile = fso.OpenTextFile(shell.ExpandEnvironmentStrings("%USERPROFILE%") & "\lexicon-watch.log", 8, True)
    logFile.WriteLine Now & " bash.exe not found at the usual Git install paths - edit bashExe in lexicon-watch-hidden.vbs"
    logFile.Close
    WScript.Quit 1
End If

cmd = Chr(34) & bashExe & Chr(34) & " -lc " & Chr(34) & _
      "cd '" & repoRoot & "' && ./lexicon-watch.sh >> ~/lexicon-watch.log 2>&1" & Chr(34)

shell.Run cmd, 0, False
