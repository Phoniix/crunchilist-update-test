# Manual Crunchilist update, for when Update now in Settings can't finish. Double-click update.cmd in the
# Crunchilist folder. Your list and settings are kept by Chrome, not in this folder, so they stay.
# Must stay plain ASCII: Windows PowerShell 5.1 reads scripts without a BOM as the local code page.
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$Zip = "",
  [switch]$Force,
  [switch]$NoPause,
  [int]$SettleMs = 1500,
  [string]$Repo = "Phoniix/crunchilist-update-test",
  [string]$ApiBase = "https://api.github.com",
  [string]$ZipBase = "https://codeload.github.com"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
# Same lists as PACKAGE_FOLDERS and PACKAGE_ROOT_FILES in lib/update-files.js (tests/manual-update.test.js checks).
$Folders = @("app", "background", "fonts", "icons", "lib", "options", "popup", "tools", "ui")
$RootFiles = @("update.cmd")
$Latin1 = [Text.Encoding]::GetEncoding(28591)
$Utf8 = New-Object Text.UTF8Encoding $false

function Finish([int]$code) {
  if (-not $NoPause) { Write-Host ""; [void](Read-Host "Press Enter to close") }
  exit $code
}

function Local([string]$base, [string]$file) { Join-Path $base ($file.Replace("/", "\")) }

function ReadManifest([string]$path) { [IO.File]::ReadAllText($path, $Utf8) | ConvertFrom-Json }

function ContentFiles($manifest) {
  $out = @()
  foreach ($entry in @($manifest.content_scripts)) {
    if ($entry) { $out += @($entry.js) + @($entry.css) }
  }
  @($out | Where-Object { $_ } | Select-Object -Unique)
}

function IsPackagePath([string]$file, $content) {
  if ($file -cnotmatch '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$') { return $false }
  $parts = $file -split "/"
  if ($parts -contains "." -or $parts -contains "..") { return $false }
  if ($file -eq "manifest.json" -or $RootFiles -contains $file -or $content -contains $file) { return $true }
  if ($file.EndsWith(".test.js")) { return $false }
  foreach ($folder in $Folders) { if ($file.StartsWith("$folder/")) { return $true } }
  $false
}

function Text([string]$path) { $Latin1.GetString([IO.File]::ReadAllBytes($path)) }

# Git on Windows checks files out with CRLF while GitHub stores LF, so line endings alone don't count as a change.
function SameFile([string]$a, [string]$b) {
  if (-not (Test-Path -LiteralPath $a -PathType Leaf) -or -not (Test-Path -LiteralPath $b -PathType Leaf)) { return $false }
  (Text $a).Replace("`r`n", "`n") -ceq (Text $b).Replace("`r`n", "`n")
}

function Version([string]$text) {
  $parts = @(($text -replace '^v', '') -split '\.' | ForEach-Object { [int]($_ -replace '\D.*$', '0') })
  while ($parts.Count -lt 4) { $parts += 0 }
  New-Object Version $parts[0], $parts[1], $parts[2], $parts[3]
}

function GitHubFailure($record) {
  $status = 0
  try { $status = [int]$record.Exception.Response.StatusCode } catch { }
  if ($status -eq 403 -or $status -eq 429) { return "GitHub is limiting requests from your connection right now. Try again in an hour. Nothing was changed." }
  if ($status -gt 0) { return "GitHub answered $status. Try again later. Nothing was changed." }
  "Couldn't reach GitHub. Check your connection and try again. Nothing was changed."
}

function LatestRef {
  try {
    $release = Invoke-RestMethod -Uri "$ApiBase/repos/$Repo/releases/latest" -UseBasicParsing -Headers @{ "User-Agent" = "Crunchilist-update" }
    if ($release.tag_name) { return [string]$release.tag_name }
  } catch {
    $status = 0
    try { $status = [int]$_.Exception.Response.StatusCode } catch { }
    if ($status -ne 404) { throw (GitHubFailure $_) }
  }
  "master"
}

function Blocked([string]$file) {
  "Your antivirus blocked $file, so nothing was changed. This is a false alarm on Crunchilist's own files. Allow the Crunchilist folder in your antivirus (Windows Security > Virus & threat protection > Exclusions) and run update.cmd again, or get the zip from https://github.com/$Repo/releases."
}

function WriteFailure([string]$file, $record) {
  $error0 = $record.Exception
  while ($error0.InnerException) { $error0 = $error0.InnerException }
  # 225 / 226: Windows refused the file because an antivirus flagged it.
  if (($error0.HResult -band 0xFFFF) -in 225, 226) { return Blocked $file }
  if (($error0.HResult -band 0xFFFF) -in 39, 112) { return "Your disk is full, so $file couldn't be written. Nothing was changed. Free up some space and run update.cmd again." }
  "Couldn't write $file ($($error0.Message.Trim())). Nothing was changed. Close anything using the Crunchilist folder and run update.cmd again."
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("crunchilist-update-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  Add-Type -AssemblyName System.IO.Compression.FileSystem

  $Root = (Resolve-Path -LiteralPath $Root).ProviderPath
  $manifestPath = Join-Path $Root "manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw "There's no Crunchilist in $Root. Put update.cmd back in your Crunchilist folder and run it from there." }
  $installed = ReadManifest $manifestPath
  if ($installed.name -ne "Crunchilist") { throw "$Root isn't a Crunchilist folder. Run update.cmd from your Crunchilist folder." }
  if (Test-Path -LiteralPath (Join-Path $Root ".git")) { throw "This Crunchilist folder is a git checkout. Update it with git pull instead." }
  Write-Host "Crunchilist $($installed.version) in $Root"

  New-Item -ItemType Directory -Path $work | Out-Null
  $archive = Join-Path $work "crunchilist.zip"
  if ($Zip) {
    Copy-Item -LiteralPath $Zip -Destination $archive
  } else {
    Write-Host "Checking GitHub for the newest version..."
    $ref = LatestRef
    Write-Host "Downloading $ref..."
    try {
      Invoke-WebRequest -Uri "$ZipBase/$Repo/zip/$ref" -OutFile $archive -UseBasicParsing -Headers @{ "User-Agent" = "Crunchilist-update" }
    } catch { throw (GitHubFailure $_) }
  }

  # Read what the zip holds before unpacking, so a file the antivirus removes on the way out is noticed.
  try {
    $reader = [IO.Compression.ZipFile]::OpenRead($archive)
    try { $entries = @($reader.Entries | Where-Object { $_.Name } | ForEach-Object { [pscustomobject]@{ Path = $_.FullName.Replace("\", "/"); Size = $_.Length } }) }
    finally { $reader.Dispose() }
  } catch { throw "The download is damaged. Run update.cmd again. Nothing was changed." }
  $prefix = ""
  if (-not ($entries | Where-Object { $_.Path -eq "manifest.json" })) {
    $top = @($entries | ForEach-Object { ($_.Path -split "/")[0] } | Select-Object -Unique)
    if ($top.Count -ne 1) { throw "The download doesn't look like Crunchilist. Nothing was changed." }
    $prefix = "$($top[0])/"
  }

  $stage = Join-Path $work "files"
  [IO.Compression.ZipFile]::ExtractToDirectory($archive, $stage)
  Start-Sleep -Milliseconds $SettleMs
  # Reading each file back is what makes an antivirus decide on it, so a flagged file shows up here, before anything changes.
  foreach ($entry in $entries) {
    $size = -1
    try { $size = [IO.File]::ReadAllBytes((Local $stage $entry.Path)).Length } catch { }
    if ($size -ne $entry.Size) { throw (Blocked $entry.Path.Substring($prefix.Length)) }
  }
  $source = Local $stage $prefix

  $nextManifestPath = Join-Path $source "manifest.json"
  if (-not (Test-Path -LiteralPath $nextManifestPath)) { throw "The download doesn't look like Crunchilist. Nothing was changed." }
  $next = ReadManifest $nextManifestPath
  if ($next.name -ne "Crunchilist") { throw "The download doesn't look like Crunchilist. Nothing was changed." }
  if (-not $Force -and (Version $next.version) -le (Version $installed.version)) {
    Write-Host "You already have the newest version ($($installed.version))."
    Finish 0
  }

  $content = ContentFiles $next
  $files = @($entries | ForEach-Object { $_.Path.Substring($prefix.Length) } | Where-Object { $_ -ne "manifest.json" -and (IsPackagePath $_ $content) } | Sort-Object)
  $changed = @($files | Where-Object { -not (SameFile (Local $source $_) (Local $Root $_)) })

  $present = @()
  foreach ($folder in $Folders) {
    $dir = Join-Path $Root $folder
    if (Test-Path -LiteralPath $dir -PathType Container) {
      $present += @(Get-ChildItem -LiteralPath $dir -Recurse -File -Force | ForEach-Object { $_.FullName.Substring($Root.TrimEnd("\").Length + 1).Replace("\", "/") })
    }
  }
  $present += @(@($RootFiles) + @(ContentFiles $installed) | Where-Object { Test-Path -LiteralPath (Local $Root $_) -PathType Leaf })
  $keep = @{}
  foreach ($file in $files) { $keep[$file.ToLowerInvariant()] = $true }
  $stale = @($present | Select-Object -Unique | Where-Object { -not $keep[$_.ToLowerInvariant()] -and $_ -ne "manifest.json" -and (IsPackagePath $_ $content) })

  # The localhost bridge only serves the dev mockup (storeManifest in lib/update-files.js).
  $manifestBytes = [IO.File]::ReadAllBytes($nextManifestPath)
  if ($next.PSObject.Properties.Name -contains "externally_connectable") {
    $next.PSObject.Properties.Remove("externally_connectable")
    $manifestBytes = $Utf8.GetBytes(($next | ConvertTo-Json -Depth 32) + "`n")
  }

  Write-Host "Installing $($next.version): $($changed.Count) changed, $($stale.Count) removed..."
  $backup = Join-Path $work "backup"
  $saved = @{}
  $created = New-Object Collections.ArrayList
  $removed = New-Object Collections.ArrayList
  $file = ""
  try {
    foreach ($file in @($changed) + @($stale) + @("manifest.json")) {
      $path = Local $Root $file
      if (Test-Path -LiteralPath $path -PathType Leaf) {
        $copy = Local $backup $file
        New-Item -ItemType Directory -Path (Split-Path -Parent $copy) -Force | Out-Null
        [IO.File]::Copy($path, $copy, $true)
        $saved[$file] = $copy
      }
    }
    foreach ($file in $changed) {
      $path = Local $Root $file
      New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
      if (-not $saved.ContainsKey($file)) { [void]$created.Add($file) }
      [IO.File]::Copy((Local $source $file), $path, $true)
    }
    Start-Sleep -Milliseconds $SettleMs
    foreach ($file in $changed) {
      $path = Local $Root $file
      $same = $false
      try { $same = (Text $path) -ceq (Text (Local $source $file)) } catch { }
      if (-not $same) { throw (Blocked $file) }
    }
    foreach ($file in $stale) {
      Remove-Item -LiteralPath (Local $Root $file) -Force
      [void]$removed.Add($file)
    }
    $file = "manifest.json"
    [IO.File]::WriteAllBytes($manifestPath, $manifestBytes)
  } catch {
    $reason = if ($_.Exception -is [Management.Automation.RuntimeException] -and $_.Exception.WasThrownFromThrowStatement) { $_.Exception.Message } else { WriteFailure $file $_ }
    foreach ($file in @($changed) + @($removed) + @("manifest.json")) {
      try { if ($saved.ContainsKey($file)) { [IO.File]::Copy($saved[$file], (Local $Root $file), $true) } } catch { }
    }
    foreach ($file in $created) {
      try { Remove-Item -LiteralPath (Local $Root $file) -Force -ErrorAction SilentlyContinue } catch { }
    }
    throw $reason
  }

  Write-Host ""
  Write-Host "Crunchilist is updated to $($next.version)."
  Write-Host "Open Crunchilist and it restarts itself on the new version, or press reload on Crunchilist in chrome://extensions."
  Finish 0
} catch {
  Write-Host ""
  Write-Host $_.Exception.Message -ForegroundColor Yellow
  Finish 1
} finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
