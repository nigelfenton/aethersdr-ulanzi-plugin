# Build-Release.ps1
#
# Builds the operator-facing distributable ZIP for a GitHub Release.
# Reads version from com.g0jkn.aethersdr.ulanziPlugin/manifest.json so the
# version is a single source of truth (bump manifest, rerun build).
#
# Output:
#   release/aethersdr-ulanzi-plugin-v{version}.zip
#   contains:
#     com.g0jkn.aethersdr.ulanziPlugin/   (plugin source — drop into Studio's Plugins dir)
#     profiles/                           (bundled device-default profiles)
#     README-INSTALL.txt                  (4-step install instructions)
#
# Excludes: node_modules/, .git, .DS_Store, Thumbs.db
#
# Usage:
#   pwsh scripts/Build-Release.ps1

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent $scriptDir
$pluginDir = Join-Path $repoRoot 'com.g0jkn.aethersdr.ulanziPlugin'
$profileDir = Join-Path $repoRoot 'profiles'
$relDir    = Join-Path $repoRoot 'release'
$stageDir  = Join-Path $relDir   'stage'

# ── Read version from manifest.json ──────────────────────────────────────
$manifest = Get-Content (Join-Path $pluginDir 'manifest.json') -Raw | ConvertFrom-Json
$version  = $manifest.Version
if (-not $version) { throw "Could not read Version from manifest.json" }
$zipName = "aethersdr-ulanzi-plugin-v$version.zip"
$zipPath = Join-Path $relDir $zipName

"Building $zipName ..."

# ── Prep clean stage directory ──────────────────────────────────────────
if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
New-Item -ItemType Directory -Path $stageDir | Out-Null

# ── Mirror plugin source into stage, excluding node_modules ─────────────
$stagePlugin = Join-Path $stageDir 'com.g0jkn.aethersdr.ulanziPlugin'
robocopy $pluginDir $stagePlugin /E /XD node_modules .git /XF .DS_Store Thumbs.db /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null

# ── Mirror profiles into stage ───────────────────────────────────────────
$stageProfiles = Join-Path $stageDir 'profiles'
robocopy $profileDir $stageProfiles /E /XF .DS_Store Thumbs.db /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null

# ── Write README-INSTALL.txt with operator-facing instructions ──────────
$installTxt = @"
AetherSDR Ulanzi Studio Plugin — v$version

INSTALL
=======

1. Enable TCI in AetherSDR:
   Settings → Autostart TCI with AetherSDR

2. Quit Ulanzi Studio fully (system tray → Quit).

3. Copy the com.g0jkn.aethersdr.ulanziPlugin folder from this archive into
   Ulanzi Studio's Plugins directory:

   Windows:  %APPDATA%\Ulanzi\UlanziDeck\Plugins\
   macOS:    ~/Library/Application Support/Ulanzi/UlanziDeck/Plugins/

4. Launch Ulanzi Studio.

5. Drag AetherSDR actions onto your device's keys.

6. (Optional, D100H operators) Studio → Profile menu → Import →
   profiles/aethersdr-d100h-default.ulanziDeckProfile
   for a ready-made dial + 6-key layout.

7. Make sure AetherSDR is running so the TCI server is listening on
   ws://127.0.0.1:40001 — button presses are silently dropped otherwise.


SUPPORT
=======
GitHub:    https://github.com/nigelfenton/aethersdr-ulanzi-plugin
Author:    Nigel Fenton (G0JKN/W3)
License:   Apache-2.0
"@

Set-Content -Path (Join-Path $stageDir 'README-INSTALL.txt') -Value $installTxt -Encoding utf8

# ── Build the ZIP ────────────────────────────────────────────────────────
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

# Use Compress-Archive — built into PS, no extra tooling needed.  -Path with
# trailing \* zips the *contents* of stage rather than stage itself.
Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

# ── Clean stage but keep the zip ─────────────────────────────────────────
Remove-Item -Recurse -Force $stageDir

# ── Report ───────────────────────────────────────────────────────────────
$zip = Get-Item $zipPath
"  Wrote: $($zip.FullName)"
"  Size:  $([Math]::Round($zip.Length / 1KB, 1)) KB"

"`nVerify ZIP contents:"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $archive.Entries |
    Sort-Object FullName |
    Select-Object -First 30 |
    ForEach-Object { "  $($_.FullName)" }
  $total = $archive.Entries.Count
  "  ... ($total entries total)"
} finally {
  $archive.Dispose()
}

"`nReady for: gh release create v$version $zipPath"
