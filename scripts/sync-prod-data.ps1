<#
sync-prod-data.ps1 — pulls LIVE production SQLite data DOWN over your local
dev copies, so local never silently drifts from what's actually serving
bldbible.com. This is ONE-WAY, prod -> local, on purpose: prod is the
source of truth for this data (people edit verses live through Translation
Studio), so local copies should never be pushed back up. See
DEPLOY-LIGHTSAIL.md for where these files live on the server
(/mnt/paleo-data, bind-mounted into the running container at /data).

USAGE
  Fill in the three variables under "fill these in once" below, then just
  run it (or double-click sync-prod-data.bat next to this file) whenever
  you want server/*.db to match prod.

    .\sync-prod-data.ps1
    .\sync-prod-data.ps1 -Include translation.db,corpus.db,bible.db

  Default -Include is just translation.db (39MB) — the one file that
  actually gets live-edited through the app's admin UI, so it's the one
  most likely to drift. corpus.db (~1GB) and bible.db (~1.4GB) are safe to
  add if you want them too. concordance.db (~8.5GB) and surface-index.db
  (~400MB) are deliberately NOT in the default list — those are built by
  scripts (build-concordance.py, build-surface-index.js), not live-edited,
  so keeping them in lockstep with prod isn't the same kind of concern, and
  concordance.db in particular is large enough to be a real bandwidth/time
  cost every time you'd run this. Pass them via -Include explicitly if you
  ever do want them.

Every synced file gets a timestamped local backup first
(server\<file>.pre-sync-backup-<timestamp>) so a bad pull never destroys a
local copy you still wanted, and a failed scp leaves the existing local
file untouched (it downloads to a .downloading temp name first, and only
replaces the real file on success).
#>

param(
    [string[]]$Include = @('translation.db')
)

# ── Fill these in once ──────────────────────────────────────────────────────
# Whatever you type after "ssh " to connect right now (no quotes needed here) —
# e.g. "ubuntu@52.1.2.3". If you normally add a key with -i, put ONLY the
# "-i C:\path\to\your-key.pem" part in $SshKeyArgs below; leave it as @() if
# a plain `ssh ubuntu@<ip>` with no -i flag already works for you.
$RemoteHost    = "ubuntu@<static-ip>"
$SshKeyArgs    = @()   # e.g. @('-i', 'C:\Users\fieldy\.ssh\your-key.pem')
$RemoteDataDir = "/mnt/paleo-data"
# ─────────────────────────────────────────────────────────────────────────────

$LocalServerDir = Join-Path $PSScriptRoot "..\server"
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"

if ($RemoteHost -eq "ubuntu@<static-ip>") {
    Write-Host "Edit sync-prod-data.ps1 first — set `$RemoteHost (and `$SshKeyArgs if you use a key file) near the top, then run this again." -ForegroundColor Yellow
    exit 1
}

Write-Host "Pulling from prod ($RemoteHost`:$RemoteDataDir) into $LocalServerDir`n"

foreach ($file in $Include) {
    $remote      = "${RemoteHost}:${RemoteDataDir}/$file"
    $localTarget = Join-Path $LocalServerDir $file
    $localBackup = Join-Path $LocalServerDir "$file.pre-sync-backup-$stamp"
    $tmpTarget   = "$localTarget.downloading"

    Write-Host "==> $file"

    if (Test-Path $localTarget) {
        Copy-Item $localTarget $localBackup
        Write-Host "    backed up existing local copy -> $(Split-Path $localBackup -Leaf)"
    }

    Remove-Item $tmpTarget -ErrorAction SilentlyContinue
    & scp @SshKeyArgs $remote $tmpTarget

    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tmpTarget)) {
        Write-Host "    FAILED to pull $file — local copy left untouched." -ForegroundColor Red
        Remove-Item $tmpTarget -ErrorAction SilentlyContinue
        continue
    }

    Move-Item $tmpTarget $localTarget -Force
    $size = (Get-Item $localTarget).Length
    Write-Host "    done — $([math]::Round($size/1MB, 1)) MB, now matches prod" -ForegroundColor Green
}

Write-Host "`nSync complete."
