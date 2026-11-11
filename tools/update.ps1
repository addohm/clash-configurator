<#
.SYNOPSIS
    Builds and tests Clash Configurator on this PC. It asks what to do; there are no options
    to remember. Start it with tools\update (the .cmd next to this file).

.DESCRIPTION
    The menu:
      1  Update: get the latest commits from GitHub, check the tools, install the packages,
         run the checks and build the app. Then it offers to start it.
      2  The same without getting anything from GitHub (builds what's here).
      3  Run the checks only (type checks and unit tests).
      4  Start the app in development mode: the page reloads as files change.
      5  Nothing (quit).

    Getting the latest is fast-forward only. It stops before changing anything if the checkout
    has uncommitted changes, is in the middle of a merge, or has diverged from GitHub, so it
    can't leave conflicts behind.

    Packages come from package-lock.json with `npm ci`; .npmrc stops them running install
    scripts. The build is unsigned (PLAN.md Q17): the built app is at
    src-tauri\target\release\clash-configurator.exe and the installer is in
    src-tauri\target\release\bundle\nsis\.
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
# Any error: print just its message (not PowerShell's script positions) and exit with code 1.
trap {
    Write-Host ''
    Write-Host "    [x] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$appExe = Join-Path $root 'src-tauri\target\release\clash-configurator.exe'
$bundleDir = Join-Path $root 'src-tauri\target\release\bundle\nsis'
$LINE = '=' * 78

# ---- Output helpers (the same look as revtunnel's scripts) ---------------------------------
function Say([string]$Text) { Write-Host "    $Text" }
function Dim([string]$Text) { Write-Host "    $Text" -ForegroundColor DarkGray }
function Ok([string]$Text) { Write-Host '    [ok] ' -ForegroundColor Green -NoNewline; Write-Host $Text }
function Warn([string]$Text) { Write-Host '    [!] ' -ForegroundColor Yellow -NoNewline; Write-Host $Text }
function Bad([string]$Text) { Write-Host '    [x] ' -ForegroundColor Red -NoNewline; Write-Host $Text }

$script:StepNo = 0
$script:Steps = 0
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

# Asks a question with a default; Enter keeps the default.
function Ask([string]$Question, [string]$Default) {
    $answer = Read-Host "    $Question [$Default]"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    return $answer.Trim()
}

# Asks until the answer is a whole number from $Min to $Max.
function Ask-Int([string]$Question, [int]$Default, [int]$Min, [int]$Max) {
    while ($true) {
        $answer = Ask $Question "$Default"
        $n = 0
        if ([int]::TryParse($answer, [ref]$n) -and $n -ge $Min -and $n -le $Max) { return $n }
        Warn "Type a number from $Min to $Max."
    }
}

# A yes/no question; $DefaultYes picks what Enter means.
function Ask-YN([string]$Question, [bool]$DefaultYes) {
    $hint = if ($DefaultYes) { 'Y/n' } else { 'y/N' }
    $answer = Read-Host "    $Question [$hint]"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $DefaultYes }
    return $answer.Trim().ToLower().StartsWith('y')
}

# ---- Running programs ----------------------------------------------------------------------

# Runs git in the repository and returns its output as text lines; stops the script if git
# fails, unless -AllowFail (then it returns $null).
#
# Windows PowerShell 5.1 turns a program's error output into script errors when it's
# redirected, and with $ErrorActionPreference = 'Stop' the first one would end the script,
# even for progress messages (git fetch writes those to stderr). So the preference is relaxed
# around the call, and git's exit code decides instead.
function Invoke-Git([string[]]$GitArgs, [switch]$AllowFail) {
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = @(& git -C $root @GitArgs 2>&1 | ForEach-Object { "$_" })
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $saved
    }
    if ($code -ne 0) {
        if ($AllowFail) { return $null }
        throw "git $($GitArgs -join ' ') failed:`n$($out -join "`n")"
    }
    return $out
}

# Runs a program in the repository folder with its output shown as it goes; stops the script
# with $Failure if it exits with an error.
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

# The first line a program prints for --version, or $null if it isn't installed.
function Get-Version([string]$Program) {
    if (-not (Get-Command $Program -ErrorAction SilentlyContinue)) { return $null }
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $v = @(& $Program --version 2>&1 | ForEach-Object { "$_" }) }
    finally { $ErrorActionPreference = $saved }
    if ($v.Count -eq 0) { return $null }
    return $v[0].Trim()
}

# ---- The steps -----------------------------------------------------------------------------

function Get-Latest {
    Step 'Get the latest from GitHub' @('Fast-forward only: nothing here is merged or overwritten.')
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'git was not found. Install it (winget install Git.Git), open a new terminal, and run this again.'
    }
    if (Test-Path (Join-Path $root '.git\MERGE_HEAD')) {
        throw 'This checkout is in the middle of a merge: finish it (resolve and commit) or abort it (git merge --abort) first.'
    }
    # Only changes to tracked files count; new files nobody added don't.
    $dirty = Invoke-Git @('status', '--porcelain', '--untracked-files=no')
    if ($dirty) {
        throw "This checkout has uncommitted changes, so it can't be updated safely:`n$($dirty -join "`n")`nCommit them or stash them (git stash), then run this again."
    }
    Invoke-Git @('fetch', '--prune', 'origin') | Out-Null
    $current = (Invoke-Git @('rev-parse', '--abbrev-ref', 'HEAD')) -join ''
    $upstream = (Invoke-Git @('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}') -AllowFail) -join ''
    if (-not $upstream) {
        throw "Branch $current has no branch on GitHub to follow (set one with: git branch -u origin/$current)."
    }
    $incoming = @(Invoke-Git @('log', '--oneline', "HEAD..$upstream"))
    $outgoing = @(Invoke-Git @('log', '--oneline', "$upstream..HEAD"))
    if ($incoming.Count -gt 0 -and $outgoing.Count -gt 0) {
        throw "$current and $upstream have diverged: $($incoming.Count) commits on GitHub aren't here, and $($outgoing.Count) here aren't on GitHub. Nothing was changed. Merge by hand (git merge $upstream) and resolve any conflicts."
    }
    if ($incoming.Count -eq 0) {
        Ok "Already up to date with $upstream."
    } else {
        Say "New on ${upstream}:"
        $incoming | ForEach-Object { Dim "  $_" }
        Invoke-Git @('merge', '--ff-only', $upstream) | Out-Null
        Ok "Updated to $((Invoke-Git @('log', '-1', '--format=%h %s')) -join '')"
    }
    if ($outgoing.Count -gt 0) {
        Warn "$($outgoing.Count) local commits aren't on GitHub."
    }
}

# Checks for Node.js and, unless -NodeOnly (the checks need nothing else), Rust and the C++
# build tools. Stops with the commands to install whatever is missing.
function Test-Tools([switch]$NodeOnly) {
    $what = if ($NodeOnly) { 'Node.js.' } else { 'Node.js, Rust and the Microsoft C++ build tools.' }
    Step 'Check the tools' @($what)
    $missing = $false

    $node = Get-Version 'node'
    if (-not $node) {
        Bad 'Node.js is not installed. Install it with: winget install OpenJS.NodeJS.LTS'
        $missing = $true
    } else {
        $major = 0
        [void][int]::TryParse(($node -replace '^v(\d+).*$', '$1'), [ref]$major)
        if ($major -lt 22) {
            Bad "Node.js $node is too old (22 or newer). Update it with: winget upgrade OpenJS.NodeJS.LTS"
            $missing = $true
        } else {
            Ok "Node.js $node"
        }
    }

    if ($NodeOnly) {
        if ($missing) { throw 'Install what is missing above, open a new terminal, and run this again.' }
        return
    }

    $cargo = Get-Version 'cargo'
    if (-not $cargo) {
        Bad 'Rust is not installed. Install it with: winget install Rustlang.Rustup'
        $missing = $true
    } else {
        Ok $cargo
    }

    # The C++ build tools come with Visual Studio or its Build Tools; vswhere finds them.
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    $vc = $null
    if (Test-Path $vswhere) {
        $vc = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property displayName
    }
    if (-not $vc) {
        Bad 'The Microsoft C++ build tools are missing. Install them with:'
        Say '  winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"'
        $missing = $true
    } else {
        Ok "C++ build tools ($vc)"
    }

    if ($missing) {
        throw 'Install what is missing above, open a new terminal, and run this again.'
    }
}

function Install-Packages {
    Step 'Install the packages' @('Exactly the versions in package-lock.json; no install scripts run.')
    Invoke-Tool 'npm' @('ci') 'Installing the packages failed (see above).'
    Ok 'Packages installed.'
}

function Invoke-Checks {
    Step 'Run the checks' @('Type checks on the page and core, then the unit tests.')
    Invoke-Tool 'npm' @('run', 'check') 'The type checks failed (see above).'
    Invoke-Tool 'npm' @('test') 'Some tests failed (see above).'
    Ok 'All checks passed.'
}

function Build-App {
    Step 'Build the app' @('The first build compiles every Rust package and takes several minutes; later ones are quicker.')
    Invoke-Tool 'npm' @('run', 'tauri', 'build') 'The build failed (see above).'
    $installer = Get-ChildItem -Path $bundleDir -Filter '*-setup.exe' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $lines = @("App:       $appExe")
    if ($installer) { $lines += "Installer: $($installer.FullName)" }
    $lines += 'Both are unsigned, so Windows may warn: More info, then Run anyway.'
    Banner 'DONE' $lines
    if ((Test-Path $appExe) -and (Ask-YN 'Start the app now?' $true)) {
        Start-Process -FilePath $appExe -WorkingDirectory $root
        Ok 'Started.'
    }
}

function Start-Dev {
    Step 'Start the app in development mode' @('Edits to the page show up straight away. Close the app window (or press Ctrl+C) to stop.')
    Invoke-Tool 'npm' @('run', 'tauri', 'dev') 'Development mode stopped with an error (see above).'
}

function Show-Status {
    $branch = (Invoke-Git @('rev-parse', '--abbrev-ref', 'HEAD') -AllowFail) -join ''
    $commit = (Invoke-Git @('log', '-1', '--format=%h %s') -AllowFail) -join ''
    $dirty = Invoke-Git @('status', '--porcelain', '--untracked-files=no') -AllowFail
    Say "Branch:     $branch"
    Say "Commit:     $commit"
    if ($dirty) { Warn 'There are uncommitted changes here.' }
    if (Test-Path $appExe) {
        Say "Last build: $((Get-Item $appExe).LastWriteTime.ToString('yyyy-MM-dd HH:mm'))"
    } else {
        Say 'Last build: none yet'
    }
}

# ---- Menu ----------------------------------------------------------------------------------
Write-Host ''
Write-Host 'clash-configurator - build and test Clash Configurator on this PC' -ForegroundColor Cyan
Write-Host ''
if (Get-Command git -ErrorAction SilentlyContinue) { Show-Status }
Write-Host ''
Say 'What would you like to do?'
Say '  1  Update: get the latest from GitHub, check, build, run'
Say '  2  Build and run what is here (nothing from GitHub)'
Say '  3  Run the checks only'
Say '  4  Start the app in development mode'
Say '  5  Nothing (quit)'
$choice = Ask-Int 'Choice' 5 1 5

switch ($choice) {
    1 { $script:Steps = 5; Get-Latest; Test-Tools; Install-Packages; Invoke-Checks; Build-App }
    2 { $script:Steps = 4; Test-Tools; Install-Packages; Invoke-Checks; Build-App }
    3 { $script:Steps = 3; Test-Tools -NodeOnly; Install-Packages; Invoke-Checks; Banner 'DONE' @('All checks passed.') }
    4 { $script:Steps = 3; Test-Tools; Install-Packages; Start-Dev }
    5 { exit 0 }
}
