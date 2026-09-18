# observability-widget.ps1
#
# Small always-on-top desktop widget showing paleo-studio's sync/uptime
# status: local<->GitHub, GitHub<->prod, lexicon/studio sync health, and
# the live site's reachability. Reads server\.observability\status.json,
# written every ~20s by scripts\observability-status.mjs (see that file's
# own header for why this exists — fieldy, 2026-09-18: "the observability
# of my app needs to be improved").
#
# Run directly to try it:
#     powershell -ExecutionPolicy Bypass -File scripts\observability-widget.ps1
# scripts\setup-observability-task.ps1 registers it to start at logon.
# The collector (observability-status.mjs) must ALSO be running (same
# setup script registers it too) or this just shows "waiting for data".

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$RepoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$StatusFile = Join-Path $RepoRoot 'server\.observability\status.json'

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="Paleo Studio" Height="260" Width="320"
        WindowStyle="ToolWindow" ResizeMode="CanMinimize"
        Topmost="True" ShowInTaskbar="False"
        Background="#1e1e1e">
  <Grid Margin="12">
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="*"/>
      <RowDefinition Height="Auto"/>
    </Grid.RowDefinitions>
    <TextBlock Grid.Row="0" Text="Paleo Studio -- Sync and Uptime" FontWeight="Bold" Foreground="White" FontSize="13" Margin="0,0,0,10"/>
    <TextBlock Grid.Row="1" Name="LocalGitText" Foreground="White" FontSize="12" Margin="0,3"/>
    <TextBlock Grid.Row="2" Name="LexiconText" Foreground="White" FontSize="12" Margin="0,3"/>
    <TextBlock Grid.Row="3" Name="StudioText" Foreground="White" FontSize="12" Margin="0,3"/>
    <TextBlock Grid.Row="4" Name="ProdText" Foreground="White" FontSize="12" Margin="0,3" TextWrapping="Wrap"/>
    <TextBlock Grid.Row="5" Name="SiteText" Foreground="White" FontSize="12" Margin="0,3"/>
    <TextBlock Grid.Row="6" Name="AutoFixText" Foreground="#88ccff" FontSize="11" Margin="0,6,0,0" TextWrapping="Wrap"/>
    <TextBlock Grid.Row="7" Name="LastCheckedText" Foreground="Gray" FontSize="10" Margin="0,8,0,0"/>
  </Grid>
</Window>
"@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)

$LocalGitText    = $window.FindName("LocalGitText")
$LexiconText     = $window.FindName("LexiconText")
$StudioText      = $window.FindName("StudioText")
$ProdText        = $window.FindName("ProdText")
$SiteText        = $window.FindName("SiteText")
$AutoFixText     = $window.FindName("AutoFixText")
$LastCheckedText = $window.FindName("LastCheckedText")

function Get-Brush([Nullable[bool]]$ok) {
    if ($ok -eq $true)  { return [System.Windows.Media.Brushes]::LightGreen }
    if ($ok -eq $false) { return [System.Windows.Media.Brushes]::OrangeRed }
    return [System.Windows.Media.Brushes]::Gray
}

function Set-Waiting([string]$msg) {
    $LocalGitText.Text = $msg
    $LocalGitText.Foreground = [System.Windows.Media.Brushes]::Gray
    $LexiconText.Text = ""; $StudioText.Text = ""; $ProdText.Text = ""; $SiteText.Text = ""; $AutoFixText.Text = ""
    $LastCheckedText.Text = ""
}

function Update-Widget {
    if (-not (Test-Path $StatusFile)) {
        Set-Waiting "Waiting for first status..."
        $LastCheckedText.Text = "No data yet -- is 'bldbible observability' task running?"
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
    $LocalGitText.Text = "Local <-> GitHub: $ahead ahead / $behind behind"
    $LocalGitText.Foreground = Get-Brush $gitOk

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

    if ($s.auto_resolved -and $s.auto_resolved.Count -gt 0) {
        $actions = ($s.auto_resolved | ForEach-Object { $_.action }) -join ', '
        $AutoFixText.Text = "Auto-fixed just now: $actions"
    } else {
        $AutoFixText.Text = ""
    }

    $LastCheckedText.Text = "Checked: $($s.generated_at)"
}

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
$window.ShowDialog() | Out-Null
