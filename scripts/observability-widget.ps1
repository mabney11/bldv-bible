# observability-widget.ps1
#
# Small always-on-top desktop widget showing paleo-studio's sync/uptime
# status: local<->GitHub, GitHub<->prod, lexicon/studio sync health, and
# the live site's reachability. Reads server\.observability\status.json,
# written every ~20s by scripts\observability-status.mjs.
#
# fieldy, 2026-09-18: "can we make it managable from here? eg i just closed
# it, i want to be able to re-open it from here" -> system tray icon, close
# just hides. Then, on the look: "make it 1 window with the 'x' within it,
# no need for the 'paleo studio' title ... the 'x' would be in the place of
# the <-->" and "if we can make this widget more transparent" -> borderless,
# semi-transparent window; the close control replaces the "<->" glyph in the
# first status line instead of a titlebar.
#
# fieldy, 2026-09-22, after a stale .git/HEAD.lock left lexicon-sync stuck
# for over an hour with nothing here able to fix it except dropping to a
# terminal: "i want to make things more robust and give myself more ability
# to resolve and manage from my desktop. I dont only want to see whats
# going on, i want it to be a one stop shop in getting everything up to
# date" -- and, when offered a narrower set of reactive "fix now" buttons
# instead: "less 'fix now' and more 'one stop shop' of all the git actions
# i may need to do for my app." Added the Actions panel below: Pull, Push,
# Sync Lexicon, Sync Studio, Catch Up (prod), Deploy, Clear Locks, Logs --
# the actual set of git/sync/deploy operations this project's own scripts
# already support, wired to run on demand instead of waiting on a poll
# interval or a terminal window. Every action here shells out to the SAME
# scripts the automated watchers already run unattended (lexicon-sync.sh,
# studio-sync.sh, deploy-blue-green.sh) or to plain git -- nothing new was
# invented, this just gives them a one-click front door. Also see
# scripts/observability-status.mjs's 2026-09-22 change, which widened
# stale-lock auto-resolve from just .git/index.lock to any .git/*.lock --
# HEAD.lock (this incident) was never covered before.
#
# Run directly to try it:
#     powershell -ExecutionPolicy Bypass -File scripts\observability-widget.ps1
# scripts\setup-observability-task.ps1 registers it to start at logon.
# The collector (observability-status.mjs) must ALSO be running (same
# setup script registers it too) or this just shows "waiting for data".

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Windows.Forms, System.Drawing

# Single-instance guard. fieldy, 2026-09-22: found TWO copies of this widget
# (and separately, two copies of observability-status.mjs -- see that
# file's own 2026-09-22 note) running at once after a Stop-ScheduledTask /
# Start-ScheduledTask cycle didn't actually kill the previous process first.
# A second copy now just exits immediately instead of opening a duplicate
# window / registering a second tray icon. Named per-machine (not just
# per-session) via the "Global\" prefix so this catches a duplicate however
# it was started -- the scheduled task, or a manual
# `powershell -File observability-widget.ps1` left running from testing.
$script:SingleInstanceMutex = New-Object System.Threading.Mutex($false, "Global\PaleoStudioObservabilityWidget")
if (-not $script:SingleInstanceMutex.WaitOne(0)) {
    exit 0
}

$RepoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$StatusFile = Join-Path $RepoRoot 'server\.observability\status.json'

# Borderless + AllowsTransparency: no titlebar, no "Paleo Studio" caption, no
# system close/min/max buttons -- the rounded semi-transparent Border below
# is the whole window chrome. Dragging and closing are both handled by hand
# (MouseLeftButtonDown -> DragMove; the "x" TextBlock -> Hide) since removing
# the titlebar removes those for free.
[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="Paleo Studio" Height="540" Width="340"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        ResizeMode="NoResize" Topmost="True" ShowInTaskbar="False">
  <Border Name="RootBorder" CornerRadius="10" Background="#CC1A1A1A" BorderBrush="#40FFFFFF" BorderThickness="1">
    <Grid Margin="14">
      <Grid.RowDefinitions>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="*"/>
        <RowDefinition Height="Auto"/>
      </Grid.RowDefinitions>

      <!-- Row 0: "Local  x  GitHub" - the close control stands in for the "less-than dash greater-than" glyph -->
      <Grid Grid.Row="0" Margin="0,0,0,8">
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="Auto"/>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <TextBlock Grid.Column="0" Text="Local" FontWeight="Bold" Foreground="White" FontSize="13" VerticalAlignment="Center"/>
        <TextBlock Grid.Column="2" Name="CloseButton" Text="&#x2715;" Foreground="#AAAAAA" FontSize="13"
                   HorizontalAlignment="Center" VerticalAlignment="Center" Cursor="Hand" Margin="6,0"/>
        <TextBlock Grid.Column="4" Text="GitHub" FontWeight="Bold" Foreground="White" FontSize="13" VerticalAlignment="Center"/>
      </Grid>

      <TextBlock Grid.Row="1" Name="LocalGitText" Foreground="White" FontSize="12" Margin="0,3"/>
      <TextBlock Grid.Row="2" Name="LocksWarningText" Foreground="OrangeRed" FontSize="11" Margin="0,0,0,3" TextWrapping="Wrap" Visibility="Collapsed"/>
      <TextBlock Grid.Row="3" Name="LexiconText" Foreground="White" FontSize="12" Margin="0,3"/>
      <TextBlock Grid.Row="4" Name="StudioText" Foreground="White" FontSize="12" Margin="0,3"/>
      <TextBlock Grid.Row="5" Name="ProdText" Foreground="White" FontSize="12" Margin="0,3" TextWrapping="Wrap"/>
      <TextBlock Grid.Row="6" Name="SiteText" Foreground="White" FontSize="12" Margin="0,3"/>

      <!-- Row 7: Actions, the "one stop shop" panel. Plain underlined
           text links (same visual language as the old Catch-up link), laid
           out in a WrapPanel so it flows to further lines at this width
           without any manual row-counting. -->
      <StackPanel Grid.Row="7" Margin="0,8,0,0">
        <TextBlock Text="ACTIONS" Foreground="#777777" FontSize="10" Margin="0,0,0,4"/>
        <WrapPanel Name="ActionsPanel">
          <TextBlock Name="PullBtn"      Text="Pull"      Foreground="#88ccff" FontSize="11" TextDecorations="Underline" Cursor="Hand" Margin="0,0,12,6"/>
          <TextBlock Name="PushBtn"      Text="Push"      Foreground="#88ccff" FontSize="11" TextDecorations="Underline" Cursor="Hand" Margin="0,0,12,6"/>
          <TextBlock Name="SyncLexBtn"   Text="Lexicon"   Foreground="#88ccff" FontSize="11" TextDecorations="Underline" Cursor="Hand" Margin="0,0,12,6"/>
          <TextBlock Name="SyncStuBtn"   Text="Studio"    Foreground="#88ccff" FontSize="11" TextDecorations="Underline" Cursor="Hand" Margin="0,0,12,6"/>
          <TextBlock Name="CatchUpBtn"   Text="Catch Up"  Foreground="#88ccff" FontSize="11" TextDecorations="Underline" Cursor="Hand" Margin="0,0,12,6"/>
          <TextBlock Name="ClearLocksBtn" Text="Locks"    Foreground="#88ccff" FontSize="11" TextDecorations="Underline" Cursor="Hand" Margin="0,0,12,6"/>
          <TextBlock Name="DeployBtn"    Text="Deploy"    Foreground="#88ccff" FontSize="11" TextDecorations="Underline" Cursor="Hand" Margin="0,0,12,6"/>
          <TextBlock Name="LogsBtn"      Text="Logs"      Foreground="#88ccff" FontSize="11" TextDecorations="Underline" Cursor="Hand" Margin="0,0,12,6"/>
        </WrapPanel>
      </StackPanel>

      <StackPanel Grid.Row="8">
        <TextBlock Name="AutoFixText" Foreground="#88ccff" FontSize="11" Margin="0,2,0,0" TextWrapping="Wrap"/>
        <TextBlock Name="LastCheckedText" Foreground="Gray" FontSize="10" Margin="0,6,0,0"/>
      </StackPanel>

      <!-- Row 9 + 10, at the bottom as asked: everything modified/untracked
           outside server/lexicon and server/studio-data (those two already
           have their own status lines and their own automation), as a
           per-file checkbox list, with the commit box underneath it.
           fieldy, 2026-09-22: "i need the ability to add and commit and be
           informed of where things currently are" -> then, seeing a single
           summary line: "I'd like a list of files touched that can be
           checked off per commit/push ... when the selected items are
           commit and pushed, it disappears from the list." The checkboxes
           are rebuilt from status.json on every poll (Update-FileChecklist,
           below) but selections persist across rebuilds in $script:SelectedFiles
           until a file actually leaves git status (i.e. really committed),
           at which point it's just no longer in the list, no separate
           "remove" step needed. A file flagged "stale" has been sitting
           this way (by its own mtime) longer than PALEO_OBS_STALE_FILE_MS
           (default 24h) in observability-status.mjs, purely a reminder,
           never touched or discarded automatically. -->
      <StackPanel Grid.Row="9" Margin="0,10,0,0">
        <TextBlock Text="PENDING FILES" Foreground="#777777" FontSize="10" Margin="0,0,0,4"/>
        <TextBlock Name="NoFilesText" Text="Nothing pending outside lexicon/studio-data" Foreground="Gray" FontSize="11" Visibility="Collapsed"/>
        <ScrollViewer MaxHeight="130" VerticalScrollBarVisibility="Auto">
          <StackPanel Name="FileChecklistPanel"/>
        </ScrollViewer>
      </StackPanel>

      <Grid Grid.Row="10" Margin="0,8,0,0">
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <TextBox Grid.Column="0" Name="CommitMsgBox" FontSize="11" Padding="4,3"
                  Background="#22FFFFFF" Foreground="White" BorderBrush="#40FFFFFF" BorderThickness="1" Margin="0,0,6,0"/>
        <TextBlock Grid.Column="1" Name="CommitBtn" Text="Commit &amp; Push" Foreground="#88ccff" FontSize="11"
                   TextDecorations="Underline" Cursor="Hand" VerticalAlignment="Center"/>
      </Grid>
    </Grid>
  </Border>
</Window>
"@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)

$RootBorder         = $window.FindName("RootBorder")
$CloseButton        = $window.FindName("CloseButton")
$LocalGitText       = $window.FindName("LocalGitText")
$LocksWarningText   = $window.FindName("LocksWarningText")
$LexiconText        = $window.FindName("LexiconText")
$StudioText         = $window.FindName("StudioText")
$ProdText           = $window.FindName("ProdText")
$SiteText           = $window.FindName("SiteText")
$AutoFixText        = $window.FindName("AutoFixText")
$LastCheckedText    = $window.FindName("LastCheckedText")
$NoFilesText        = $window.FindName("NoFilesText")
$FileChecklistPanel = $window.FindName("FileChecklistPanel")
$CommitMsgBox       = $window.FindName("CommitMsgBox")
$CommitBtn          = $window.FindName("CommitBtn")

$CommitMsgIdleBorder = $CommitMsgBox.BorderBrush

# Tracks which pending files are currently checked, keyed by git-relative
# path, so a checkbox's state survives Update-FileChecklist rebuilding the
# whole list on every ~5s timer tick (the underlying WPF controls themselves
# are thrown away and recreated each time -- this HashSet is what persists).
$script:SelectedFiles = New-Object "System.Collections.Generic.HashSet[string]"

$PullBtn        = $window.FindName("PullBtn")
$PushBtn        = $window.FindName("PushBtn")
$SyncLexBtn     = $window.FindName("SyncLexBtn")
$SyncStuBtn     = $window.FindName("SyncStuBtn")
$CatchUpBtn     = $window.FindName("CatchUpBtn")
$ClearLocksBtn  = $window.FindName("ClearLocksBtn")
$DeployBtn      = $window.FindName("DeployBtn")
$LogsBtn        = $window.FindName("LogsBtn")

# Drag the borderless window by its background (any row/column with no more
# specific handler -- WPF hit-tests the Border first, so this covers the
# whole widget except the clickable text controls above).
$RootBorder.Add_MouseLeftButtonDown({ $window.DragMove() })

function Get-Brush([Nullable[bool]]$ok) {
    if ($ok -eq $true)  { return [System.Windows.Media.Brushes]::LightGreen }
    if ($ok -eq $false) { return [System.Windows.Media.Brushes]::OrangeRed }
    return [System.Windows.Media.Brushes]::Gray
}

function Set-Waiting([string]$msg) {
    $LocalGitText.Text = $msg
    $LocalGitText.Foreground = [System.Windows.Media.Brushes]::Gray
    $LocksWarningText.Visibility = 'Collapsed'
    $LexiconText.Text = ""; $StudioText.Text = ""; $ProdText.Text = ""; $SiteText.Text = ""; $AutoFixText.Text = ""
    $LastCheckedText.Text = ""
}

# Rebuilds the pending-files checkbox list from the latest status.json every
# tick. The controls themselves are thrown away and recreated each time (WPF
# has no cheap in-place diff here and this list is short), but a checkbox's
# checked state survives because it's driven FROM $script:SelectedFiles, not
# the other way around -- and a path that's no longer in $files (because it
# actually got committed, or the change was reverted by hand) is pruned from
# that set here too, which is what makes a file just quietly vanish from the
# list once it's really gone, with no separate "remove it" step anywhere.
function Update-FileChecklist($files) {
    $currentPaths = @($files | ForEach-Object { $_.path })
    $stale = @($script:SelectedFiles) | Where-Object { $currentPaths -notcontains $_ }
    foreach ($p in $stale) { [void]$script:SelectedFiles.Remove($p) }

    $FileChecklistPanel.Children.Clear()
    if (@($files).Count -eq 0) {
        # Always reassert the canonical empty-state message/color here (not
        # just Visibility) -- Invoke-CommitAndPush borrows this same control
        # to flash a validation warning ("check at least one file first"),
        # and this is what clears that back to normal on the very next poll
        # rather than leaving it stuck.
        $NoFilesText.Text = "Nothing pending outside lexicon/studio-data"
        $NoFilesText.Foreground = [System.Windows.Media.Brushes]::Gray
        $NoFilesText.Visibility = 'Visible'
        return
    }
    $NoFilesText.Visibility = 'Collapsed'
    foreach ($f in $files) {
        $cb = New-Object System.Windows.Controls.CheckBox
        $label = "$($f.status)  $($f.path)"
        if ($f.stale) {
            $hrs = if ($f.age_s) { [Math]::Round($f.age_s / 3600, 1) } else { "?" }
            $label += "  (${hrs}h)"
            $cb.Foreground = [System.Windows.Media.Brushes]::Orange
        } else {
            $cb.Foreground = [System.Windows.Media.Brushes]::White
        }
        $cb.Content = $label
        $cb.FontSize = 11
        $cb.Margin = "0,0,0,4"
        $cb.Tag = $f.path
        $cb.IsChecked = $script:SelectedFiles.Contains($f.path)
        $cb.Add_Checked({ param($s2, $e2) [void]$script:SelectedFiles.Add($s2.Tag) })
        $cb.Add_Unchecked({ param($s2, $e2) [void]$script:SelectedFiles.Remove($s2.Tag) })
        [void]$FileChecklistPanel.Children.Add($cb)
    }
}

function Update-Widget {
    if (-not (Test-Path $StatusFile)) {
        Set-Waiting "Waiting for first status..."
        $LastCheckedText.Text = "No data yet -- is 'bldbible observability collector' task running?"
        return
    }

    try {
        $raw = Get-Content $StatusFile -Raw -ErrorAction Stop
        if ([string]::IsNullOrWhiteSpace($raw)) { return }
        $s = $raw | ConvertFrom-Json -ErrorAction Stop
    } catch {
        # status.json is written via write-then-rename, so a mid-write read
        # should be rare, but never let a transient parse failure blank the
        # widget out -- just skip this tick and retry on the next timer.
        return
    }

    $ahead  = $s.local.git.ahead
    $behind = $s.local.git.behind
    $gitOk  = $s.local.git.fetch_ok -and ($behind -eq 0)
    $LocalGitText.Text = "$ahead ahead / $behind behind"
    $LocalGitText.Foreground = Get-Brush $gitOk

    $locks = @($s.local.git_locks)
    if ($locks.Count -gt 0) {
        $names = ($locks | ForEach-Object { $_.path }) -join ', '
        $LocksWarningText.Text = "$($locks.Count) git lock(s) held: $names -- use Locks below if this sits for more than a minute or two"
        $LocksWarningText.Visibility = 'Visible'
    } else {
        $LocksWarningText.Visibility = 'Collapsed'
    }

    Update-FileChecklist @($s.local.other_changes.files)

    $lexFailing = $s.local.lexicon_sync_failing.present
    if ($lexFailing) {
        $LexiconText.Text = "Lexicon sync: STUCK since $($s.local.lexicon_sync_failing.since)"
    } else {
        $LexiconText.Text = "Lexicon sync: OK"
    }
    $LexiconText.Foreground = Get-Brush (-not $lexFailing)

    $stuFailing = $s.local.studio_sync_failing.present
    if ($stuFailing) {
        $StudioText.Text = "Studio sync: STUCK since $($s.local.studio_sync_failing.since)"
    } else {
        $StudioText.Text = "Studio sync: OK"
    }
    $StudioText.Foreground = Get-Brush (-not $stuFailing)

    if ($s.prod.reachable) {
        $pBehind = $s.prod.git_behind_origin
        $containers = if ($s.prod.containers) { ($s.prod.containers -join ',') } else { "none" }
        $ProdText.Text = "Prod: $pBehind behind GitHub | $containers"
        $ProdText.Foreground = Get-Brush ($pBehind -eq 0)
    } else {
        $ProdText.Text = "Prod: UNREACHABLE via ssh"
        $ProdText.Foreground = Get-Brush $false
    }

    if ($s.site.reachable) {
        $upH = if ($s.site.uptime_s) { [Math]::Round($s.site.uptime_s / 3600, 1) } else { "?" }
        $SiteText.Text = "Site: up ($($s.site.latency_ms)ms, ${upH}h)"
        $SiteText.Foreground = Get-Brush $true
    } else {
        $SiteText.Text = "Site: DOWN or unreachable"
        $SiteText.Foreground = Get-Brush $false
    }

    if ($s.auto_resolved -and @($s.auto_resolved).Count -gt 0) {
        $actions = (@($s.auto_resolved) | ForEach-Object { $_.action }) -join ', '
        $AutoFixText.Text = "Auto-fixed just now: $actions"
    } else {
        $AutoFixText.Text = ""
    }

    $LastCheckedText.Text = "Checked: $($s.generated_at)"
}

# ── Actions panel ────────────────────────────────────────────────────────
# Every action below shells out to a script this project already runs
# unattended (lexicon-sync.sh, studio-sync.sh, deploy-blue-green.sh) or to
# plain git -- nothing new was invented, this just gives them a one-click
# front door instead of a terminal window. All fire-and-forget (background,
# hidden bash.exe process) with a short cosmetic "Running..." label, same
# pattern the original Catch-up button already used -- the REAL result
# shows up in the status rows above on the collector's next ~20s poll, or
# in the relevant log file (Logs button opens the folder they all live in).

function Get-BashExe {
    $bashExe = (Get-Command bash.exe -ErrorAction SilentlyContinue).Source
    if (-not $bashExe) { $bashExe = "$env:ProgramFiles\Git\bin\bash.exe" }
    return $bashExe
}

function Get-ProdSshTarget {
    [PSCustomObject]@{
        BashExe   = Get-BashExe
        HostAlias = if ($env:PALEO_PROD_HOST) { $env:PALEO_PROD_HOST } else { 'paleo-prod' }
        RRepo     = if ($env:PALEO_PROD_REPO) { $env:PALEO_PROD_REPO } else { '/root/paleo-studio' }
    }
}

# Stages and commits ONLY the currently-checked files from the pending-files
# list above -- never server/lexicon or server/studio-data (those two have
# their own dedicated, evidence-sourced commit messages from lexicon-sync.sh
# / studio-sync.sh; a generic message typed here should never touch them,
# and they're excluded from the pending list itself for the same reason).
# fieldy, 2026-09-22: "I'd like a list of files touched that can be checked
# off per commit/push ... when the selected items are commit and pushed, it
# disappears from the list" -- an UNchecked file is left completely alone,
# so a partial commit (some files now, the rest later) is the normal case,
# not a special one.
#
# Each path is quoted and escaped on its own (paths can contain spaces);
# the message uses the standard sh idiom for a literal single-quote inside
# a single-quoted string: close the quote, insert an escaped literal quote,
# reopen it.
function Invoke-CommitAndPush {
    $msg = $CommitMsgBox.Text.Trim()
    $paths = @($script:SelectedFiles)
    $bad = $false
    if ([string]::IsNullOrWhiteSpace($msg)) {
        $CommitMsgBox.BorderBrush = [System.Windows.Media.Brushes]::OrangeRed
        $bad = $true
    } else {
        $CommitMsgBox.BorderBrush = $CommitMsgIdleBorder
    }
    if ($paths.Count -eq 0) {
        $NoFilesText.Text = "Check at least one file above first"
        $NoFilesText.Foreground = [System.Windows.Media.Brushes]::OrangeRed
        $NoFilesText.Visibility = 'Visible'
        $bad = $true
    }
    if ($bad) { return }

    $CommitBtn.Text = "Committing..."
    $CommitBtn.IsEnabled = $false
    $CommitMsgBox.IsEnabled = $false
    $bashExe = Get-BashExe
    $escapedMsg = $msg -replace "'", "'\''"
    $quotedPaths = ($paths | ForEach-Object { "'" + ($_ -replace "'", "'\''") + "'" }) -join ' '
    $cmd = "git add -- $quotedPaths && git commit -m '$escapedMsg' && git push origin main"
    $wrapped = "cd '$RepoRoot' && ($cmd) >> ~/paleo-widget-actions.log 2>&1"
    Start-Process -FilePath $bashExe -ArgumentList @('-lc', $wrapped) -WindowStyle Hidden
    Start-Sleep -Seconds 2
    $CommitBtn.Text = "Commit & Push"
    $CommitBtn.IsEnabled = $true
    $CommitMsgBox.IsEnabled = $true
    $CommitMsgBox.Text = ""
    # Optimistic clear -- the real confirmation is these paths dropping out
    # of the next poll's pending list once they're actually committed+pushed.
    # If the push failed (see ~/paleo-widget-actions.log), git status will
    # still show them and they'll simply reappear, unchecked, on next poll.
    $script:SelectedFiles.Clear()
}

# Runs a command locally (in $RepoRoot, via Git-Bash), appended to a log
# file in the user's home dir, with a brief "Running..." label on the
# clicked control while it starts.
function Start-PaleoLocalAction {
    param(
        [System.Windows.Controls.TextBlock]$Button,
        [string]$RunningText,
        [string]$IdleText,
        [string]$Command,
        [string]$LogFile,
        [int]$CosmeticSeconds = 2
    )
    $Button.Text = $RunningText
    $Button.IsEnabled = $false
    $bashExe = Get-BashExe
    $logPath = "~/$LogFile"
    $wrapped = "cd '$RepoRoot' && ($Command) >> $logPath 2>&1"
    Start-Process -FilePath $bashExe -ArgumentList @('-lc', $wrapped) -WindowStyle Hidden
    Start-Sleep -Seconds $CosmeticSeconds
    $Button.Text = $IdleText
    $Button.IsEnabled = $true
}

$CommitBtn.Add_MouseLeftButtonDown({ Invoke-CommitAndPush })
$CommitMsgBox.Add_KeyDown({
    param($s, $e)
    if ($e.Key -eq [System.Windows.Input.Key]::Return) { Invoke-CommitAndPush }
})

$PullBtn.Add_MouseLeftButtonDown({
    Start-PaleoLocalAction -Button $PullBtn -RunningText "Pulling..." -IdleText "Pull" `
        -Command "git pull --rebase origin main" -LogFile "paleo-widget-actions.log"
})

$PushBtn.Add_MouseLeftButtonDown({
    Start-PaleoLocalAction -Button $PushBtn -RunningText "Pushing..." -IdleText "Push" `
        -Command "git push origin main" -LogFile "paleo-widget-actions.log"
})

$SyncLexBtn.Add_MouseLeftButtonDown({
    Start-PaleoLocalAction -Button $SyncLexBtn -RunningText "Syncing..." -IdleText "Lexicon" `
        -Command "./lexicon-sync.sh" -LogFile "paleo-widget-actions.log"
})

$SyncStuBtn.Add_MouseLeftButtonDown({
    Start-PaleoLocalAction -Button $SyncStuBtn -RunningText "Syncing..." -IdleText "Studio" `
        -Command "./studio-sync.sh" -LogFile "paleo-widget-actions.log" -CosmeticSeconds 3
})

# Manual override removes any lock older than 1 minute (vs. the collector's
# own 2-minute auto-resolve threshold) -- faster than waiting, but still
# leaves a real, actively-forming lock (a git process that started in the
# last minute) alone rather than yanking it out from under a live operation.
$ClearLocksBtn.Add_MouseLeftButtonDown({
    Start-PaleoLocalAction -Button $ClearLocksBtn -RunningText "Clearing..." -IdleText "Locks" `
        -Command "find .git -maxdepth 4 -iname '*.lock' -not -path '*/objects/*' -mmin +1 -print -delete" `
        -LogFile "paleo-widget-actions.log" -CosmeticSeconds 1
})

# "Catch up" -- ssh's to prod and re-triggers lexicon-sync.sh directly
# (fieldy, 2026-09-18: "i want to make catching up a part of this flow").
# Safe/idempotent: it's the exact same command lexicon-pull-watch.sh already
# runs on its own every ~15s; this just fires it immediately on demand
# instead of waiting, and surfaces the result right in the widget.
$CatchUpBtn.Add_MouseLeftButtonDown({
    $CatchUpBtn.Text = "Syncing..."
    $CatchUpBtn.IsEnabled = $false
    $target = Get-ProdSshTarget
    $remoteCmd = "sudo -n bash -c 'cd $($target.RRepo) && ./lexicon-sync.sh'"
    $sshCmd = "ssh -o BatchMode=yes -o ConnectTimeout=15 -o ControlMaster=no $($target.HostAlias) `"$remoteCmd`" >> ~/observability.log 2>&1"
    Start-Process -FilePath $target.BashExe -ArgumentList @('-lc', $sshCmd) -WindowStyle Hidden
    Start-Sleep -Seconds 2
    $CatchUpBtn.Text = "Catch Up"
    $CatchUpBtn.IsEnabled = $true
})

# Deploy is the one action here with real, harder-to-undo consequences (it
# swaps the live containers on prod), so it needs a deliberate second click
# rather than firing on the first one. First click arms it for 4 seconds
# (shown in orange); a second click within that window actually fires
# deploy-blue-green.sh on prod over ssh -- the exact same script/flow
# ~/deploy.sh already runs there. If nothing follows within 4s it quietly
# disarms itself back to "Deploy".
$script:DeployArmed = $false
$script:DeployArmTimer = $null
$DeployIdleBrush = $DeployBtn.Foreground

$DeployBtn.Add_MouseLeftButtonDown({
    if (-not $script:DeployArmed) {
        $script:DeployArmed = $true
        $DeployBtn.Text = "Confirm?"
        $DeployBtn.Foreground = [System.Windows.Media.Brushes]::OrangeRed
        if ($script:DeployArmTimer) { $script:DeployArmTimer.Stop() }
        $script:DeployArmTimer = New-Object System.Windows.Threading.DispatcherTimer
        $script:DeployArmTimer.Interval = [TimeSpan]::FromSeconds(4)
        $script:DeployArmTimer.Add_Tick({
            $script:DeployArmed = $false
            $DeployBtn.Text = "Deploy"
            $DeployBtn.Foreground = $DeployIdleBrush
            $script:DeployArmTimer.Stop()
        })
        $script:DeployArmTimer.Start()
        return
    }

    if ($script:DeployArmTimer) { $script:DeployArmTimer.Stop() }
    $script:DeployArmed = $false
    $DeployBtn.IsEnabled = $false
    $target = Get-ProdSshTarget
    $remoteCmd = "sudo -n bash -c 'cd $($target.RRepo) && ./deploy-blue-green.sh'"
    $sshCmd = "ssh -o BatchMode=yes -o ConnectTimeout=15 -o ControlMaster=no $($target.HostAlias) `"$remoteCmd`" >> ~/deploy.log 2>&1"
    Start-Process -FilePath $target.BashExe -ArgumentList @('-lc', $sshCmd) -WindowStyle Hidden
    $DeployBtn.Text = "Deploying (~5m)..."
    $DeployBtn.Foreground = [System.Windows.Media.Brushes]::OrangeRed
    Start-Sleep -Seconds 3
    $DeployBtn.Text = "Deploy"
    $DeployBtn.Foreground = $DeployIdleBrush
    $DeployBtn.IsEnabled = $true
})

# Opens the folder holding every log these actions (and the watchers) write
# to -- lexicon-watch.log, studio-sync-watch.log, observability.log,
# paleo-widget-actions.log, deploy.log all live directly under %USERPROFILE%.
$LogsBtn.Add_MouseLeftButtonDown({
    Start-Process explorer.exe $env:USERPROFILE
})

# ── System tray icon ────────────────────────────────────────────────────
# Same crowned-lion mark as the web app's own favicon (favicon.svg, rasterized
# to scripts/paleo-studio.ico at build time -- .NET's Icon type can't load an
# SVG directly) -- fieldy, 2026-09-18: "can we give my system tray icon the
# same icon my my web app." Falls back to the generic system icon if the .ico
# is ever missing (e.g. an old checkout mid-update) rather than erroring out.
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$IconPath = Join-Path $RepoRoot 'scripts\paleo-studio.ico'
if (Test-Path $IconPath) {
    $notifyIcon.Icon = New-Object System.Drawing.Icon($IconPath)
} else {
    $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
}
$notifyIcon.Text = "Paleo Studio observability"
$notifyIcon.Visible = $true

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$openItem = $contextMenu.Items.Add("Open")
[void]$contextMenu.Items.Add("-")
$exitItem = $contextMenu.Items.Add("Exit")
$notifyIcon.ContextMenuStrip = $contextMenu

$script:exiting = $false

function Show-Widget {
    $window.Show()
    $window.WindowState = 'Normal'
    $window.Activate()
}

$openItem.add_Click({ Show-Widget })
$notifyIcon.add_MouseClick({
    param($s, $e)
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Show-Widget }
})
$exitItem.add_Click({
    $script:exiting = $true
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    $window.Close()
})

$CloseButton.Add_MouseLeftButtonDown({ $window.Hide() })

# Closing the window (Alt+F4 etc, since there's no X button chrome anymore)
# hides it instead of quitting -- the tray icon is what keeps the
# collector-independent widget reachable. Only the tray menu's "Exit" item
# actually ends the process.
$window.Add_Closing({
    param($s, $e)
    if (-not $script:exiting) {
        $e.Cancel = $true
        $window.Hide()
    }
})
$window.Add_Closed({
    [System.Windows.Threading.Dispatcher]::CurrentDispatcher.InvokeShutdown()
})

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds(5)
$timer.Add_Tick({ Update-Widget })
$timer.Start()

Set-Waiting "Loading..."
$window.Add_Loaded({
    $window.Left = [System.Windows.SystemParameters]::WorkArea.Width - $window.Width - 20
    $window.Top = 20
    Update-Widget
})
Show-Widget

# Non-modal message loop -- lets the window Hide()/Show() freely (ShowDialog
# expects a real close to unblock, which fights the hide-to-tray behavior
# above) while still servicing the NotifyIcon's Win32 messages.
[System.Windows.Threading.Dispatcher]::Run()
