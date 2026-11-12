<#
.SYNOPSIS
    Makes a release of Clash Configurator on this PC and, when you say so, publishes it on
    GitHub. It asks for everything; there are no options to remember. Start it with
    tools\release (the .cmd next to this file).

.DESCRIPTION
    What it does, asking before anything leaves this PC:
      1  Checks: on main, no uncommitted changes, the same as GitHub; Node, Rust, the GitHub
         CLI (gh), signed in.
      2  The signing key for updates (PLAN.md Q20). It lives only on this PC, in
         %USERPROFILE%\.clash-configurator\, never on GitHub. The first time, it makes one
         (you choose a password) and puts its public half in src-tauri\tauri.conf.json, so
         the app can check that an update really comes from you. Keep a copy of the key
         somewhere safe: without it, new versions can't be installed as updates.
      3  The version: suggested, or type your own. The notes are CHANGELOG.md's Unreleased
         section, which becomes this version's.
      4  The checks (as tools\update runs them).
      5  The signed build.
      6  The files, in release\v<version>\ (git ignores it): the installer and its
         signature, a portable zip, latest.json (what the app's update check reads),
         SHA256SUMS.txt and its signature.
      7  Commit "Release v<version>", tag it, push, and create the GitHub release with the
         files (gh release create). Asked first; say no to keep it all on this PC.

    The repository must be public for the app's update check to see releases (PLAN.md Q15).
    This script uses its own copies of tools\update.ps1's helpers, so each runs on its own.
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
trap {
    Write-Host ''
    Write-Host "    [x] $($_.Exception.Message)" -ForegroundColor Red
    Clear-SigningEnv
    exit 1
}

$repo = 'addohm/clash-configurator'
$keyDir = Join-Path $env:USERPROFILE '.clash-configurator'
$keyFile = Join-Path $keyDir 'updater.key'
$pubFile = "$keyFile.pub"
$confFile = Join-Path $root 'src-tauri\tauri.conf.json'
$cargoFile = Join-Path $root 'src-tauri\Cargo.toml'
$changelog = Join-Path $root 'CHANGELOG.md'
$releaseConf = Join-Path $root 'src-tauri\tauri.release.conf.json'
$bundleDir = Join-Path $root 'src-tauri\target\release\bundle\nsis'
$appExe = Join-Path $root 'src-tauri\target\release\clash-configurator.exe'
$LINE = '=' * 78
$utf8 = New-Object System.Text.UTF8Encoding($false)

# ---- Output helpers (the same look as revtunnel's scripts) ---------------------------------
function Say([string]$Text) { Write-Host "    $Text" }
function Dim([string]$Text) { Write-Host "    $Text" -ForegroundColor DarkGray }
function Ok([string]$Text) { Write-Host '    [ok] ' -ForegroundColor Green -NoNewline; Write-Host $Text }
function Warn([string]$Text) { Write-Host '    [!] ' -ForegroundColor Yellow -NoNewline; Write-Host $Text }
function Bad([string]$Text) { Write-Host '    [x] ' -ForegroundColor Red -NoNewline; Write-Host $Text }

$script:StepNo = 0
$script:Steps = 7
function Step([string]$Title, [string[]]$Detail = @()) {
    $script:StepNo++
    Write-Host ''
    Write-Host "Step $($script:StepNo) of $($script:Steps): $Title" -ForegroundColor Cyan
    foreach ($d in $Detail) { Dim $d }
}

function Banner([string]$Title, [string[]]$Lines = @()) {
    Write-Host ''
    Write-Host $LINE -ForegroundColor Yellow
    Write-Host "  $Title" -ForegroundColor Yellow
    foreach ($l in $Lines) { Write-Host "  $l" -ForegroundColor Yellow }
    Write-Host $LINE -ForegroundColor Yellow
}

function Ask([string]$Question, [string]$Default) {
    $answer = Read-Host "    $Question [$Default]"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    return $answer.Trim()
}

function Ask-YN([string]$Question, [bool]$DefaultYes) {
    $hint = if ($DefaultYes) { 'Y/n' } else { 'y/N' }
    $answer = Read-Host "    $Question [$hint]"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $DefaultYes }
    return $answer.Trim().ToLower().StartsWith('y')
}

# ---- Running programs ----------------------------------------------------------------------

function ConvertTo-Text($Line) {
    if ($Line -is [System.Management.Automation.ErrorRecord]) {
        if ($Line.TargetObject -is [string]) { return $Line.TargetObject }
        return $Line.Exception.Message
    }
    return "$Line"
}

# Runs a program and returns its output as text lines; stops the script if it fails, unless
# -AllowFail (then $null). Error output doesn't stop it: the exit code decides (as in update.ps1).
function Invoke-Quiet([string]$Program, [string[]]$ToolArgs, [switch]$AllowFail) {
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location $root
    try {
        $out = @(& $Program @ToolArgs 2>&1 | ForEach-Object { ConvertTo-Text $_ } |
            Where-Object { $_ -and $_ -ne 'System.Management.Automation.RemoteException' })
        $code = $LASTEXITCODE
    }
    finally {
        Pop-Location
        $ErrorActionPreference = $saved
    }
    if ($code -ne 0) {
        if ($AllowFail) { return $null }
        throw "$Program $($ToolArgs -join ' ') failed:`n$($out -join "`n")"
    }
    return $out
}

function Invoke-Git([string[]]$GitArgs, [switch]$AllowFail) {
    if ($AllowFail) { return Invoke-Quiet 'git' $GitArgs -AllowFail }
    return Invoke-Quiet 'git' $GitArgs
}

# Runs a program with its output shown as it goes; stops with $Failure if it fails.
function Invoke-Tool([string]$Program, [string[]]$ToolArgs, [string]$Failure) {
    Dim "> $Program $($ToolArgs -join ' ')"
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location $root
    try {
        & $Program @ToolArgs
        $code = $LASTEXITCODE
    }
    finally {
        Pop-Location
        $ErrorActionPreference = $saved
    }
    if ($code -ne 0) { throw $Failure }
}

function Read-Text([string]$Path) { return [System.IO.File]::ReadAllText($Path) }
# UTF-8 without a byte-order mark, as the repository's files are.
function Write-Text([string]$Path, [string]$Text) { [System.IO.File]::WriteAllText($Path, $Text, $utf8) }

# The signing key and its password are only ever in these two variables, for the build and
# signing, and cleared straight after.
function Clear-SigningEnv {
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
}

# ---- The steps -----------------------------------------------------------------------------

function Test-Ready {
    Step 'Check this checkout and the tools' @('A release is made from main, exactly as it is on GitHub.')
    foreach ($tool in @('git', 'node', 'npm', 'cargo', 'gh')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            if ($tool -eq 'gh') { throw 'The GitHub CLI (gh) is not installed. Install it with: winget install GitHub.cli, then sign in: gh auth login' }
            throw "$tool is not installed: run tools\update first, which says how to install what's missing."
        }
    }
    Ok 'git, Node, Rust and the GitHub CLI are installed.'
    if ($null -eq (Invoke-Quiet 'gh' @('auth', 'status') -AllowFail)) {
        throw 'The GitHub CLI is not signed in. Run: gh auth login'
    }
    Ok 'The GitHub CLI is signed in.'
    $branch = (Invoke-Git @('rev-parse', '--abbrev-ref', 'HEAD')) -join ''
    if ($branch -ne 'main') { throw "This checkout is on ${branch}: switch to main (git checkout main) first." }
    $dirty = Invoke-Git @('status', '--porcelain', '--untracked-files=no')
    if ($dirty) { throw "There are uncommitted changes:`n$($dirty -join "`n")`nCommit or stash them first." }
    Invoke-Git @('fetch', '--prune', '--tags', 'origin') | Out-Null
    $incoming = @(Invoke-Git @('log', '--oneline', 'HEAD..origin/main'))
    $outgoing = @(Invoke-Git @('log', '--oneline', 'origin/main..HEAD'))
    if ($incoming.Count -gt 0) { throw "GitHub has $($incoming.Count) commits that aren't here: run tools\update first." }
    if ($outgoing.Count -gt 0) { throw "$($outgoing.Count) commits here aren't on GitHub yet: push them first (git push)." }
    Ok 'On main, clean, and the same as GitHub.'
}

# The public key line in tauri.conf.json ("pubkey": "...").
function Get-ConfPubkey {
    $m = [regex]::Match((Read-Text $confFile), '"pubkey":\s*"([^"]*)"')
    if (-not $m.Success) { throw 'src-tauri\tauri.conf.json has no updater "pubkey" line.' }
    return $m.Groups[1].Value
}

function Set-ConfPubkey([string]$Pubkey) {
    $text = [regex]::Replace((Read-Text $confFile), '"pubkey":\s*"[^"]*"', "`"pubkey`": `"$Pubkey`"")
    Write-Text $confFile $text
}

function Test-SigningKey {
    Step 'The signing key for updates' @("Kept only on this PC: $keyDir")
    if (-not (Test-Path $keyFile)) {
        Say 'There is no signing key on this PC yet. Every release is signed with it, and the app'
        Say 'installs an update only if its signature matches. Keep a copy of the key file and its'
        Say 'password somewhere safe (not GitHub): without them, people would have to download'
        Say 'new versions by hand.'
        if (-not (Ask-YN 'Make the key now? (You choose its password.)' $true)) { throw 'No signing key: nothing was changed.' }
        New-Item -ItemType Directory -Force -Path $keyDir | Out-Null
        Invoke-Tool 'npx' @('tauri', 'signer', 'generate', '-w', $keyFile) 'Making the key failed (see above).'
        Ok "Key made: $keyFile"
    }
    if (-not (Test-Path $pubFile)) { throw "The public half of the key is missing: $pubFile" }
    $pub = (Read-Text $pubFile).Trim()
    $conf = Get-ConfPubkey
    if ($conf -eq $pub) {
        Ok 'The app checks updates against this key.'
    } elseif ($conf -eq '') {
        Set-ConfPubkey $pub
        Ok 'Put the public key in src-tauri\tauri.conf.json (it goes in the release commit).'
    } else {
        Warn 'src-tauri\tauri.conf.json has a different public key. Copies of the app that are already'
        Warn "installed only accept updates signed with that one, so they won't update to this release."
        if (-not (Ask-YN 'Use this PC''s key from now on anyway?' $false)) { throw 'Nothing was changed. Copy the original key to this PC to keep updates working.' }
        Set-ConfPubkey $pub
        Ok 'Switched to this PC''s key.'
    }
}

# CHANGELOG.md's Unreleased section, trimmed.
function Get-UnreleasedNotes {
    $text = Read-Text $changelog
    $m = [regex]::Match($text, '(?s)## \[Unreleased\]\s*(.*?)(?=\r?\n## \[|\z)')
    if (-not $m.Success) { throw 'CHANGELOG.md has no "## [Unreleased]" section.' }
    return $m.Groups[1].Value.Trim()
}

function Get-NextVersion {
    $current = ([regex]::Match((Read-Text (Join-Path $root 'package.json')), '"version":\s*"([^"]+)"')).Groups[1].Value
    $tagged = Invoke-Git @('tag', '--list', "v$current")
    if (-not $tagged) { return $current }
    $parts = $current.Split('-')[0].Split('.')
    return "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)"
}

function Select-Version {
    Step 'The version and its notes' @('Versions are major.minor.patch (Semantic Versioning); 0.x means an early version.')
    $notes = Get-UnreleasedNotes
    if (-not $notes) { throw "CHANGELOG.md's Unreleased section is empty: say what changed first." }
    while ($true) {
        $v = Ask 'Version' (Get-NextVersion)
        if ($v -notmatch '^\d+\.\d+\.\d+$') { Warn 'Type it as three numbers, like 0.2.0.'; continue }
        if (Invoke-Git @('tag', '--list', "v$v")) { Warn "v$v already exists."; continue }
        break
    }
    Say 'The notes (CHANGELOG.md, Unreleased):'
    ($notes -split "`n") | Select-Object -First 12 | ForEach-Object { Dim "  $_" }
    if (($notes -split "`n").Count -gt 12) { Dim '  ...' }
    if (-not (Ask-YN "Release these as v$v?" $true)) { throw 'Stopped: nothing was changed.' }
    $script:Version = $v
    $script:Notes = $notes
}

function Set-Version {
    $v = $script:Version
    Invoke-Quiet 'npm' @('version', $v, '--no-git-tag-version', '--allow-same-version') | Out-Null
    $cargo = [regex]::new('(?m)^version = "[^"]*"').Replace((Read-Text $cargoFile), "version = `"$v`"", 1)
    Write-Text $cargoFile $cargo
    $conf = [regex]::new('"version":\s*"[^"]*"').Replace((Read-Text $confFile), "`"version`": `"$v`"", 1)
    Write-Text $confFile $conf
    $date = (Get-Date).ToString('yyyy-MM-dd')
    $log = [regex]::new('## \[Unreleased\]').Replace((Read-Text $changelog), "## [Unreleased]`n`n## [$v] - $date", 1)
    Write-Text $changelog $log
    Ok "Version $v set in package.json, src-tauri\Cargo.toml, src-tauri\tauri.conf.json and CHANGELOG.md."
}

function Invoke-Checks {
    Step 'Run the checks' @('The same checks as tools\update.')
    Invoke-Tool 'npm' @('ci') 'Installing the packages failed (see above).'
    Invoke-Tool 'npm' @('run', 'check') 'The type checks failed (see above).'
    Invoke-Tool 'npm' @('test') 'Some tests failed (see above). Run tools\update, check 3, to get mihomo for the tests.'
    Invoke-Tool 'cargo' @('test', '--quiet', '--manifest-path', (Join-Path $root 'fetcher\Cargo.toml')) 'The fetcher tests failed (see above).'
    Invoke-Tool 'cargo' @('test', '--quiet', '--manifest-path', (Join-Path $root 'sharer\Cargo.toml')) 'The sharer tests failed (see above).'
    Ok 'All checks passed.'
}

function Build-Signed {
    Step 'Build and sign' @('The installer is signed for the update check; this takes a few minutes.')
    $open = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'Clash Configurator' })
    if ($open.Count -gt 0) { throw 'Clash Configurator is open: close it first, so the build can replace it.' }
    $secure = Read-Host '    The signing key''s password' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    # The key's text (not its path): the build and `tauri signer sign` both read it that way.
    $env:TAURI_SIGNING_PRIVATE_KEY = (Read-Text $keyFile).Trim()
    Invoke-Tool 'npm' @('run', 'tauri', 'build', '--', '--config', $releaseConf) 'The build failed (see above). A wrong password fails here too.'
    Ok 'Built and signed.'
}

function New-ReleaseFiles {
    Step 'Gather the files' @("In release\v$($script:Version)\ (git ignores it).")
    $v = $script:Version
    $out = Join-Path $root "release\v$v"
    if (Test-Path $out) { Remove-Item $out -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $out | Out-Null

    $installer = Get-ChildItem -Path $bundleDir -Filter "*_${v}_x64-setup.exe" | Select-Object -First 1
    if (-not $installer) { throw "No installer for $v in $bundleDir." }
    $sig = "$($installer.FullName).sig"
    if (-not (Test-Path $sig)) { throw "The installer wasn't signed ($sig is missing)." }
    # No spaces: GitHub renames them, and latest.json must name the file exactly.
    $setupName = "Clash-Configurator_${v}_x64-setup.exe"
    Copy-Item $installer.FullName (Join-Path $out $setupName)
    Copy-Item $sig (Join-Path $out "$setupName.sig")

    $portable = Join-Path $out "Clash-Configurator_${v}_x64-portable.zip"
    $stage = Join-Path $out 'portable'
    New-Item -ItemType Directory -Force -Path $stage | Out-Null
    Copy-Item $appExe (Join-Path $stage 'Clash Configurator.exe')
    Write-Text (Join-Path $stage 'README.txt') ("Clash Configurator $v, portable: run Clash Configurator.exe, no install needed.`r`n" +
        "It needs Microsoft Edge WebView2, which Windows 10 and 11 already have.`r`n" +
        "The installer version checks for updates and installs them; this one only says when there's a new version.`r`n" +
        "https://github.com/$repo`r`n")
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $portable)
    Remove-Item $stage -Recurse -Force

    $latest = [ordered]@{
        version   = $v
        notes     = $script:Notes
        pub_date  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        platforms = [ordered]@{
            'windows-x86_64' = [ordered]@{
                signature = (Read-Text $sig).Trim()
                url       = "https://github.com/$repo/releases/download/v$v/$setupName"
            }
        }
    }
    Write-Text (Join-Path $out 'latest.json') ($latest | ConvertTo-Json -Depth 5)

    $sums = Get-ChildItem -Path $out -File | Sort-Object Name | ForEach-Object {
        "$((Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.Name)"
    }
    $sumsFile = Join-Path $out 'SHA256SUMS.txt'
    Write-Text $sumsFile (($sums -join "`n") + "`n")
    Invoke-Tool 'npx' @('tauri', 'signer', 'sign', $sumsFile) 'Signing SHA256SUMS.txt failed (see above).'
    Clear-SigningEnv
    Write-Text (Join-Path $out 'notes.md') ($script:Notes + "`n`n---`n`nSHA256SUMS.txt lists every file's SHA-256; SHA256SUMS.txt.sig is its signature (Tauri's minisign format, base64), made with the key whose public half is in src-tauri/tauri.conf.json.`n")
    $script:OutDir = $out
    Get-ChildItem -Path $out -File | ForEach-Object { Ok $_.Name }
}

function Publish-Release {
    Step 'Commit, tag and publish' @('Nothing has left this PC yet.')
    $v = $script:Version
    Invoke-Git @('add', 'package.json', 'package-lock.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json', 'CHANGELOG.md') | Out-Null
    Invoke-Git @('commit', '-m', "Release v$v") | Out-Null
    Invoke-Git @('tag', '-a', "v$v", '-m', "Clash Configurator $v") | Out-Null
    Ok "Committed and tagged v$v here."
    if (-not (Ask-YN "Push v$v to GitHub and publish the release with these files?" $true)) {
        Banner 'MADE, NOT PUBLISHED' @("The files: $($script:OutDir)", "To publish later: git push origin main --follow-tags, then run this script's last step by hand:", "  gh release create v$v <the files> --title ""Clash Configurator $v"" --notes-file notes.md")
        return
    }
    Invoke-Git @('push', 'origin', 'main', '--follow-tags') | Out-Null
    Ok 'Pushed.'
    $files = @(Get-ChildItem -Path $script:OutDir -File | Where-Object { $_.Name -ne 'notes.md' } | ForEach-Object { $_.FullName })
    $ghArgs = @('release', 'create', "v$v") + $files + @('--repo', $repo, '--title', "Clash Configurator $v", '--notes-file', (Join-Path $script:OutDir 'notes.md'))
    Invoke-Tool 'gh' $ghArgs 'Creating the GitHub release failed (see above). The tag is pushed: try the gh command again.'
    Banner 'RELEASED' @("https://github.com/$repo/releases/tag/v$v", 'Installed copies see it at their next start (once the repository is public).')
}

# ---- Start ---------------------------------------------------------------------------------

Write-Host ''
Write-Host 'clash-configurator - make a release' -ForegroundColor Cyan
Say 'It asks before anything leaves this PC. Ctrl+C stops it at any question.'

Test-Ready
Test-SigningKey
Select-Version
Set-Version
Invoke-Checks
Build-Signed
New-ReleaseFiles
Publish-Release
