$ErrorActionPreference = 'Stop'

$repo = 'C:\Users\Mac Mini\Desktop\Website Host\Streaming_Website\streamvault'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $repo "deploy-backup-mac-monitor-$stamp"
$server = Join-Path $repo 'server.js'
$route = Join-Path $repo 'routes\system-stats.js'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Stop-Safely([string]$message) {
  Write-Host ""
  Write-Host "STOPPED SAFELY: $message" -ForegroundColor Red
  exit 1
}

function Get-Port3000Owner {
  $pids = @()

  try {
    $pids += @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop |
      Select-Object -ExpandProperty OwningProcess)
  } catch {}

  if (-not $pids.Count) {
    $lines = @(netstat -ano -p tcp 2>$null | Select-String ':3000\s+.*LISTENING\s+(\d+)
function Restore-Files {
  Copy-Item (Join-Path $backup 'server.js') $server -Force
  if (Test-Path (Join-Path $backup 'system-stats.js')) {
    Copy-Item (Join-Path $backup 'system-stats.js') $route -Force
  } else {
    Remove-Item $route -Force -ErrorAction SilentlyContinue
  }
}

function Start-SV {
  $logDir = Join-Path $repo 'logs'
  New-Item -ItemType Directory -Force $logDir | Out-Null
  $log = Join-Path $logDir "mac-monitor-startup-$stamp.log"
  $safeRepo = $repo.Replace("'", "''")
  $safeLog = $log.Replace("'", "''")
  $startCmd = "Set-Location '$safeRepo'; npm start *>> '$safeLog'"
  Start-Process powershell.exe -WorkingDirectory $repo -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-Command',$startCmd) -WindowStyle Hidden | Out-Null
  return $log
}

Write-Host "=== StreamVault Mac Mini monitor safe install ===" -ForegroundColor Cyan

if (-not (Test-Path $repo)) { Stop-Safely "StreamVault folder not found." }
Set-Location $repo
& git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) { Stop-Safely "StreamVault folder is not a Git repository." }
if (-not (Test-Path $server)) { Stop-Safely "server.js not found." }

Write-Host "1/7 Backing up current production files..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force $backup | Out-Null
Copy-Item $server (Join-Path $backup 'server.js') -Force
if (Test-Path $route) { Copy-Item $route (Join-Path $backup 'system-stats.js') -Force }
& git status --short | Out-File (Join-Path $backup 'git-status.txt') -Encoding utf8
& git diff -- server.js | Out-File (Join-Path $backup 'server-before.patch') -Encoding utf8
Write-Host "Backup: $backup" -ForegroundColor Green

Write-Host "2/7 Fetching only the new monitor code; no merge..." -ForegroundColor Cyan
& git fetch origin master
if ($LASTEXITCODE -ne 0) { Stop-Safely "git fetch failed. Existing site was not changed." }

$routeLines = & git show origin/master:routes/system-stats.js 2>&1
if ($LASTEXITCODE -ne 0) { Stop-Safely "Could not get the monitor file from GitHub." }
$routeText = ($routeLines -join [Environment]::NewLine) + [Environment]::NewLine
[System.IO.Directory]::CreateDirectory((Split-Path $route -Parent)) | Out-Null
[System.IO.File]::WriteAllText($route, $routeText, $utf8)

Write-Host "3/7 Adding two monitor connections to the existing server.js..." -ForegroundColor Cyan
$text = [System.IO.File]::ReadAllText($server)
$requireAnchor = "const dashboardRoutes = require('./routes/dashboard');"
$requireLine = "const createSystemStatsRouter = require('./routes/system-stats');"
$mountAnchor = "app.use('/api/dashboard', dashboardRoutes);"
$mountBlock = "app.use('/internal/mac-mini-stats', createSystemStatsRouter({" + [Environment]::NewLine + "  token: process.env.MAC_MINI_STATS_TOKEN || process.env.STRESS_TELEMETRY_TOKEN || ''" + [Environment]::NewLine + "}));"

if (-not $text.Contains($requireLine)) {
  if ([regex]::Matches($text,[regex]::Escape($requireAnchor)).Count -ne 1) {
    Restore-Files
    Stop-Safely "Could not find the safe require location. Original files restored."
  }
  $text = $text.Replace($requireAnchor, $requireAnchor + [Environment]::NewLine + $requireLine)
}

if (-not $text.Contains("app.use('/internal/mac-mini-stats'")) {
  if ([regex]::Matches($text,[regex]::Escape($mountAnchor)).Count -ne 1) {
    Restore-Files
    Stop-Safely "Could not find the safe route location. Original files restored."
  }
  $text = $text.Replace($mountAnchor, $mountAnchor + [Environment]::NewLine + $mountBlock)
}

[System.IO.File]::WriteAllText($server, $text, $utf8)

Write-Host "4/7 Checking code before stopping anything..." -ForegroundColor Cyan
& node --check $route
if ($LASTEXITCODE -ne 0) {
  Restore-Files
  Stop-Safely "Monitor file check failed. Original files restored; running site was never stopped."
}
& node --check $server
if ($LASTEXITCODE -ne 0) {
  Restore-Files
  Stop-Safely "server.js check failed. Original files restored; running site was never stopped."
}
Write-Host "Code checks passed." -ForegroundColor Green

Write-Host "5/7 Finding the exact StreamVault process on port 3000..." -ForegroundColor Cyan
try {
  $old = @(Get-SVNode)
} catch {
  Restore-Files
  Stop-Safely "$($_.Exception.Message) Files were restored and nothing was stopped."
}

if ($old.Count -gt 1) {
  $old | Select-Object ProcessId,Name,CommandLine | Format-List
  Restore-Files
  Stop-Safely "More than one process is listening for StreamVault on port 3000. Nothing was stopped and files were restored."
}

if ($old.Count -eq 1) {
  Write-Host "Confirmed StreamVault on port 3000." -ForegroundColor Green
  Write-Host "Stopping only PID $($old[0].ProcessId) ($($old[0].Name))..." -ForegroundColor Yellow
  Stop-Process -Id $old[0].ProcessId -Force
  Start-Sleep 2

  $stillListening = @(Get-Port3000Owner)
  if ($stillListening.Count -gt 0) {
    Restore-Files
    Stop-Safely "Port 3000 is still in use after stopping the confirmed StreamVault PID. Files were restored."
  }
} else {
  Write-Host "Nothing is listening on port 3000. No process will be killed." -ForegroundColor Yellow
}

Write-Host "6/7 Starting updated StreamVault..." -ForegroundColor Cyan
$startupLog = Start-SV

$stats = $null
$lastError = ''
for ($i=0; $i -lt 15; $i++) {
  Start-Sleep 2
  try {
    $headers = @{}
    $token = [string]$env:MAC_MINI_STATS_TOKEN
    if ([string]::IsNullOrWhiteSpace($token)) { $token = [string]$env:STRESS_TELEMETRY_TOKEN }
    if (-not [string]::IsNullOrWhiteSpace($token)) { $headers['Authorization'] = "Bearer $token" }
    $stats = Invoke-RestMethod 'http://127.0.0.1:3000/internal/mac-mini-stats' -Headers $headers -TimeoutSec 5
    if ($stats.ok) { break }
  } catch {
    $lastError = $_.Exception.Message
  }
}

if (-not $stats -or -not $stats.ok) {
  Write-Host "New startup did not pass the monitor test. Rolling back..." -ForegroundColor Red
  try {
    @(Get-Port3000Owner) | Where-Object { [string]$_.Name -ieq 'node.exe' } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  } catch {}

  Restore-Files
  $rollbackLog = Start-SV

  $rollbackOk = $false
  for ($j=0; $j -lt 15; $j++) {
    Start-Sleep 2
    if (Test-LocalStreamVault) {
      $rollbackOk = $true
      break
    }
  }

  Write-Host "ROLLED BACK: previous production files restored." -ForegroundColor Yellow
  if ($rollbackOk) {
    Write-Host "Previous StreamVault server is responding again." -ForegroundColor Green
  } else {
    Write-Host "WARNING: Previous files were restored, but the local StreamVault health check did not respond yet." -ForegroundColor Red
  }
  Write-Host "Reason: $lastError"
  Write-Host "Startup log: $startupLog"
  Write-Host "Rollback log: $rollbackLog"
  exit 1
}

Write-Host "7/7 Monitor is working locally." -ForegroundColor Green
$stats | ConvertTo-Json -Depth 6

try {
  $headers = @{}
  $token = [string]$env:MAC_MINI_STATS_TOKEN
  if ([string]::IsNullOrWhiteSpace($token)) { $token = [string]$env:STRESS_TELEMETRY_TOKEN }
  if (-not [string]::IsNullOrWhiteSpace($token)) { $headers['Authorization'] = "Bearer $token" }
  $public = Invoke-RestMethod 'https://backend.streamvault.fit/internal/mac-mini-stats' -Headers $headers -TimeoutSec 8
  Write-Host "Public backend monitor: WORKING" -ForegroundColor Green
} catch {
  Write-Host "Local monitor works. Public Cloudflare route could not be confirmed yet." -ForegroundColor Yellow
  Write-Host $_.Exception.Message
}

Write-Host ""
Write-Host "SUCCESS: StreamVault is running with Mac Mini monitoring." -ForegroundColor Green
Write-Host "Backup kept at: $backup"
Write-Host "Startup log: $startupLog"
)
    foreach ($line in $lines) {
      if ($line.Matches.Count -gt 0) {
        $pids += [int]$line.Matches[0].Groups[1].Value
      }
    }
  }

  $pids = @($pids | Where-Object { $_ } | Sort-Object -Unique)
  if ($pids.Count -eq 0) { return @() }

  @($pids | ForEach-Object {
    Get-CimInstance Win32_Process -Filter "ProcessId=$_" -ErrorAction SilentlyContinue
  } | Where-Object { $_ })
}

function Test-LocalStreamVault {
  try {
    $r = Invoke-RestMethod 'http://127.0.0.1:3000/api/version' -TimeoutSec 4
    return [bool]($r -and $r.ok -eq $true)
  } catch {
    return $false
  }
}

function Get-SVNode {
  $owners = @(Get-Port3000Owner)
  if ($owners.Count -eq 0) { return @() }

  if (-not (Test-LocalStreamVault)) {
    throw "Port 3000 is in use, but the service did not identify itself as StreamVault."
  }

  $nodeOwners = @($owners | Where-Object { [string]$_.Name -ieq 'node.exe' })
  if ($nodeOwners.Count -ne $owners.Count) {
    throw "Port 3000 is serving StreamVault, but its listener is not a Node process. Refusing to stop it automatically."
  }

  return $nodeOwners
}

function Restore-Files {
  Copy-Item (Join-Path $backup 'server.js') $server -Force
  if (Test-Path (Join-Path $backup 'system-stats.js')) {
    Copy-Item (Join-Path $backup 'system-stats.js') $route -Force
  } else {
    Remove-Item $route -Force -ErrorAction SilentlyContinue
  }
}

function Start-SV {
  $logDir = Join-Path $repo 'logs'
  New-Item -ItemType Directory -Force $logDir | Out-Null
  $log = Join-Path $logDir "mac-monitor-startup-$stamp.log"
  $safeRepo = $repo.Replace("'", "''")
  $safeLog = $log.Replace("'", "''")
  $startCmd = "Set-Location '$safeRepo'; npm start *>> '$safeLog'"
  Start-Process powershell.exe -WorkingDirectory $repo -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-Command',$startCmd) -WindowStyle Hidden | Out-Null
  return $log
}

Write-Host "=== StreamVault Mac Mini monitor safe install ===" -ForegroundColor Cyan

if (-not (Test-Path $repo)) { Stop-Safely "StreamVault folder not found." }
Set-Location $repo
& git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) { Stop-Safely "StreamVault folder is not a Git repository." }
if (-not (Test-Path $server)) { Stop-Safely "server.js not found." }

Write-Host "1/7 Backing up current production files..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force $backup | Out-Null
Copy-Item $server (Join-Path $backup 'server.js') -Force
if (Test-Path $route) { Copy-Item $route (Join-Path $backup 'system-stats.js') -Force }
& git status --short | Out-File (Join-Path $backup 'git-status.txt') -Encoding utf8
& git diff -- server.js | Out-File (Join-Path $backup 'server-before.patch') -Encoding utf8
Write-Host "Backup: $backup" -ForegroundColor Green

Write-Host "2/7 Fetching only the new monitor code; no merge..." -ForegroundColor Cyan
& git fetch origin master
if ($LASTEXITCODE -ne 0) { Stop-Safely "git fetch failed. Existing site was not changed." }

$routeLines = & git show origin/master:routes/system-stats.js 2>&1
if ($LASTEXITCODE -ne 0) { Stop-Safely "Could not get the monitor file from GitHub." }
$routeText = ($routeLines -join [Environment]::NewLine) + [Environment]::NewLine
[System.IO.Directory]::CreateDirectory((Split-Path $route -Parent)) | Out-Null
[System.IO.File]::WriteAllText($route, $routeText, $utf8)

Write-Host "3/7 Adding two monitor connections to the existing server.js..." -ForegroundColor Cyan
$text = [System.IO.File]::ReadAllText($server)
$requireAnchor = "const dashboardRoutes = require('./routes/dashboard');"
$requireLine = "const createSystemStatsRouter = require('./routes/system-stats');"
$mountAnchor = "app.use('/api/dashboard', dashboardRoutes);"
$mountBlock = "app.use('/internal/mac-mini-stats', createSystemStatsRouter({" + [Environment]::NewLine + "  token: process.env.MAC_MINI_STATS_TOKEN || process.env.STRESS_TELEMETRY_TOKEN || ''" + [Environment]::NewLine + "}));"

if (-not $text.Contains($requireLine)) {
  if ([regex]::Matches($text,[regex]::Escape($requireAnchor)).Count -ne 1) {
    Restore-Files
    Stop-Safely "Could not find the safe require location. Original files restored."
  }
  $text = $text.Replace($requireAnchor, $requireAnchor + [Environment]::NewLine + $requireLine)
}

if (-not $text.Contains("app.use('/internal/mac-mini-stats'")) {
  if ([regex]::Matches($text,[regex]::Escape($mountAnchor)).Count -ne 1) {
    Restore-Files
    Stop-Safely "Could not find the safe route location. Original files restored."
  }
  $text = $text.Replace($mountAnchor, $mountAnchor + [Environment]::NewLine + $mountBlock)
}

[System.IO.File]::WriteAllText($server, $text, $utf8)

Write-Host "4/7 Checking code before stopping anything..." -ForegroundColor Cyan
& node --check $route
if ($LASTEXITCODE -ne 0) {
  Restore-Files
  Stop-Safely "Monitor file check failed. Original files restored; running site was never stopped."
}
& node --check $server
if ($LASTEXITCODE -ne 0) {
  Restore-Files
  Stop-Safely "server.js check failed. Original files restored; running site was never stopped."
}
Write-Host "Code checks passed." -ForegroundColor Green

Write-Host "5/7 Finding only the StreamVault Node process..." -ForegroundColor Cyan
$old = Get-SVNode
if ($old.Count -gt 1) {
  $old | Select-Object ProcessId,CommandLine | Format-List
  Restore-Files
  Stop-Safely "More than one StreamVault process matched. Nothing was stopped and files were restored."
}

if ($old.Count -eq 1) {
  Write-Host "Stopping StreamVault PID $($old[0].ProcessId) only..." -ForegroundColor Yellow
  Stop-Process -Id $old[0].ProcessId -Force
  Start-Sleep 2
} else {
  Write-Host "No matching StreamVault Node process found; no other Node process will be killed." -ForegroundColor Yellow
}

Write-Host "6/7 Starting updated StreamVault..." -ForegroundColor Cyan
$startupLog = Start-SV

$stats = $null
$lastError = ''
for ($i=0; $i -lt 15; $i++) {
  Start-Sleep 2
  try {
    $headers = @{}
    $token = [string]$env:MAC_MINI_STATS_TOKEN
    if ([string]::IsNullOrWhiteSpace($token)) { $token = [string]$env:STRESS_TELEMETRY_TOKEN }
    if (-not [string]::IsNullOrWhiteSpace($token)) { $headers['Authorization'] = "Bearer $token" }
    $stats = Invoke-RestMethod 'http://127.0.0.1:3000/internal/mac-mini-stats' -Headers $headers -TimeoutSec 5
    if ($stats.ok) { break }
  } catch {
    $lastError = $_.Exception.Message
  }
}

if (-not $stats -or -not $stats.ok) {
  Write-Host "New startup did not pass the monitor test. Rolling back..." -ForegroundColor Red
  Get-SVNode | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Restore-Files
  $rollbackLog = Start-SV
  Start-Sleep 8
  Write-Host "ROLLED BACK: previous production files restored and StreamVault started again." -ForegroundColor Yellow
  Write-Host "Reason: $lastError"
  Write-Host "Startup log: $startupLog"
  exit 1
}

Write-Host "7/7 Monitor is working locally." -ForegroundColor Green
$stats | ConvertTo-Json -Depth 6

try {
  $headers = @{}
  $token = [string]$env:MAC_MINI_STATS_TOKEN
  if ([string]::IsNullOrWhiteSpace($token)) { $token = [string]$env:STRESS_TELEMETRY_TOKEN }
  if (-not [string]::IsNullOrWhiteSpace($token)) { $headers['Authorization'] = "Bearer $token" }
  $public = Invoke-RestMethod 'https://backend.streamvault.fit/internal/mac-mini-stats' -Headers $headers -TimeoutSec 8
  Write-Host "Public backend monitor: WORKING" -ForegroundColor Green
} catch {
  Write-Host "Local monitor works. Public Cloudflare route could not be confirmed yet." -ForegroundColor Yellow
  Write-Host $_.Exception.Message
}

Write-Host ""
Write-Host "SUCCESS: StreamVault is running with Mac Mini monitoring." -ForegroundColor Green
Write-Host "Backup kept at: $backup"
Write-Host "Startup log: $startupLog"
