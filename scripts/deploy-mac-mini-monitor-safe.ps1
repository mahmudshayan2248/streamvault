$ErrorActionPreference = 'Stop'

$repo = 'C:\Users\Mac Mini\Desktop\Website Host\Streaming_Website\streamvault'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $repo ('deploy-backup-mac-monitor-' + $stamp)
$server = Join-Path $repo 'server.js'
$route = Join-Path $repo 'routes\system-stats.js'
$logDir = Join-Path $repo 'logs'
$log = Join-Path $logDir ('mac-monitor-startup-' + $stamp + '.log')
$startup = 'C:\Users\Mac Mini\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\StreamVault Node Server.cmd'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Stop-Safe($message) {
  Write-Host ''
  Write-Host ('STOPPED SAFELY: ' + $message) -ForegroundColor Red
  exit 1
}

function Get-Port3000Pid {
  try {
    $p = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop |
      Select-Object -First 1 -ExpandProperty OwningProcess
    if ($p) { return [int]$p }
  } catch {}

  $line = netstat -ano -p tcp 2>$null |
    Select-String ':3000' |
    Select-String 'LISTENING' |
    Select-Object -First 1

  if (-not $line) { return $null }

  $parts = ($line.ToString().Trim() -split '\s+')
  if ($parts.Count -lt 5) { return $null }

  return [int]$parts[$parts.Count - 1]
}

function Test-StreamVault {
  try {
    $v = Invoke-RestMethod 'http://127.0.0.1:3000/api/version' -TimeoutSec 4
    return [bool]($v -and $v.ok -eq $true)
  } catch {
    return $false
  }
}

function Get-MonitorHeaders {
  $h = @{}
  $token = [string]$env:MAC_MINI_STATS_TOKEN
  if ([string]::IsNullOrWhiteSpace($token)) {
    $token = [string]$env:STRESS_TELEMETRY_TOKEN
  }
  if (-not [string]::IsNullOrWhiteSpace($token)) {
    $h['Authorization'] = 'Bearer ' + $token
  }
  return $h
}

function Restore-Files {
  Copy-Item (Join-Path $backup 'server.js') $server -Force
  $savedRoute = Join-Path $backup 'system-stats.js'
  if (Test-Path $savedRoute) {
    Copy-Item $savedRoute $route -Force
  } else {
    Remove-Item $route -Force -ErrorAction SilentlyContinue
  }
}

function Start-StreamVault {
  New-Item -ItemType Directory -Force $logDir | Out-Null
  if (-not (Test-Path $startup)) {
    throw 'Normal StreamVault Startup script was not found.'
  }
  $cmd = 'call "' + $startup + '" >> "' + $log + '" 2>&1'
  Start-Process 'cmd.exe' -ArgumentList '/d','/c',$cmd -WorkingDirectory $repo -WindowStyle Hidden | Out-Null
}

function Wait-Monitor {
  $headers = Get-MonitorHeaders
  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 2
    try {
      $m = Invoke-RestMethod 'http://127.0.0.1:3000/internal/mac-mini-stats' -Headers $headers -TimeoutSec 5
      if ($m -and $m.ok -eq $true) { return $m }
    } catch {}
  }
  return $null
}

Write-Host '=== StreamVault Mac Mini monitor safe install ===' -ForegroundColor Cyan

if (-not (Test-Path $repo)) { Stop-Safe 'StreamVault folder not found.' }
Set-Location $repo

& git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) { Stop-Safe 'StreamVault folder is not a Git repository.' }
if (-not (Test-Path $server)) { Stop-Safe 'server.js not found.' }
if (-not (Test-Path $startup)) { Stop-Safe 'Normal StreamVault Startup script was not found. Nothing was changed.' }

Write-Host '1/7 Backing up current production files...' -ForegroundColor Cyan
New-Item -ItemType Directory -Force $backup | Out-Null
Copy-Item $server (Join-Path $backup 'server.js') -Force
if (Test-Path $route) {
  Copy-Item $route (Join-Path $backup 'system-stats.js') -Force
}
& git status --short | Out-File (Join-Path $backup 'git-status.txt') -Encoding utf8
& git diff -- server.js | Out-File (Join-Path $backup 'server-before.patch') -Encoding utf8
Write-Host ('Backup: ' + $backup) -ForegroundColor Green

Write-Host '2/7 Fetching monitor file only; no merge...' -ForegroundColor Cyan
& git fetch origin master
if ($LASTEXITCODE -ne 0) { Stop-Safe 'git fetch failed.' }

$routeLines = & git show origin/master:routes/system-stats.js 2>&1
if ($LASTEXITCODE -ne 0) {
  Restore-Files
  Stop-Safe 'Could not read routes/system-stats.js from origin/master.'
}
$routeText = ($routeLines -join [Environment]::NewLine) + [Environment]::NewLine
[System.IO.Directory]::CreateDirectory((Split-Path $route -Parent)) | Out-Null
[System.IO.File]::WriteAllText($route, $routeText, $utf8)

Write-Host '3/7 Adding monitor route to current server.js...' -ForegroundColor Cyan
$text = [System.IO.File]::ReadAllText($server)

$requireAnchor = "const dashboardRoutes = require('./routes/dashboard');"
$requireLine = "const createSystemStatsRouter = require('./routes/system-stats');"

if (-not $text.Contains($requireLine)) {
  if (-not $text.Contains($requireAnchor)) {
    Restore-Files
    Stop-Safe 'Safe require location not found. Original files restored.'
  }
  $text = $text.Replace(
    $requireAnchor,
    $requireAnchor + [Environment]::NewLine + $requireLine
  )
}

$mountAnchor = "app.use('/api/dashboard', dashboardRoutes);"
$mountNeedle = "app.use('/internal/mac-mini-stats'"

if (-not $text.Contains($mountNeedle)) {
  if (-not $text.Contains($mountAnchor)) {
    Restore-Files
    Stop-Safe 'Safe route location not found. Original files restored.'
  }

  $mountBlock = "app.use('/internal/mac-mini-stats', createSystemStatsRouter({" +
    [Environment]::NewLine +
    "  token: process.env.MAC_MINI_STATS_TOKEN || process.env.STRESS_TELEMETRY_TOKEN || ''" +
    [Environment]::NewLine +
    "}));"

  $text = $text.Replace(
    $mountAnchor,
    $mountAnchor + [Environment]::NewLine + $mountBlock
  )
}

[System.IO.File]::WriteAllText($server, $text, $utf8)

Write-Host '4/7 Checking code before stopping anything...' -ForegroundColor Cyan
& node --check $route
if ($LASTEXITCODE -ne 0) {
  Restore-Files
  Stop-Safe 'Monitor syntax check failed. Original files restored; running site was not stopped.'
}

& node --check $server
if ($LASTEXITCODE -ne 0) {
  Restore-Files
  Stop-Safe 'server.js syntax check failed. Original files restored; running site was not stopped.'
}

Write-Host 'Code checks passed.' -ForegroundColor Green

Write-Host '5/7 Identifying StreamVault on port 3000...' -ForegroundColor Cyan
$pid3000 = Get-Port3000Pid

if ($pid3000) {
  if (-not (Test-StreamVault)) {
    Restore-Files
    Stop-Safe 'Port 3000 is in use but did not answer as StreamVault. Nothing was stopped.'
  }

  $proc = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $pid3000) -ErrorAction SilentlyContinue
  if (-not $proc -or [string]$proc.Name -ine 'node.exe') {
    Restore-Files
    Stop-Safe 'StreamVault port 3000 is not owned by node.exe. Nothing was stopped.'
  }

  Write-Host ('Confirmed StreamVault PID ' + $pid3000 + ' on port 3000.') -ForegroundColor Green
  Stop-Process -Id $pid3000 -Force
  Start-Sleep -Seconds 2

  if (Get-Port3000Pid) {
    Restore-Files
    Stop-Safe 'Port 3000 is still busy after stopping the confirmed StreamVault process.'
  }
} else {
  Write-Host 'Nothing is listening on port 3000. No process will be killed.' -ForegroundColor Yellow
}

Write-Host '6/7 Starting updated StreamVault...' -ForegroundColor Cyan
Start-StreamVault
$stats = Wait-Monitor

if (-not $stats) {
  Write-Host 'Monitor test failed. Rolling back automatically...' -ForegroundColor Red

  $newPid = Get-Port3000Pid
  if ($newPid) {
    $newProc = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $newPid) -ErrorAction SilentlyContinue
    if ($newProc -and [string]$newProc.Name -ieq 'node.exe') {
      Stop-Process -Id $newPid -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
    }
  }

  Restore-Files
  Start-StreamVault

  $restored = $false
  for ($j = 0; $j -lt 45; $j++) {
    Start-Sleep -Seconds 2
    if (Test-StreamVault) {
      $restored = $true
      break
    }
  }

  Write-Host 'ROLLED BACK: previous production files restored.' -ForegroundColor Yellow
  if ($restored) {
    Write-Host 'Previous StreamVault server is responding again.' -ForegroundColor Green
  } else {
    Write-Host 'WARNING: files were restored but StreamVault has not answered yet.' -ForegroundColor Red
  }
  Write-Host ('Startup log: ' + $log)
  exit 1
}

Write-Host '7/7 Local monitor is working.' -ForegroundColor Green
$stats | ConvertTo-Json -Depth 6

try {
  $headers = Get-MonitorHeaders
  $public = Invoke-RestMethod 'https://backend.streamvault.fit/internal/mac-mini-stats' -Headers $headers -TimeoutSec 8
  if ($public -and $public.ok -eq $true) {
    Write-Host 'Public backend monitor: WORKING' -ForegroundColor Green
  }
} catch {
  Write-Host 'Local monitor works; public Cloudflare route could not be confirmed yet.' -ForegroundColor Yellow
  Write-Host $_.Exception.Message
}

Write-Host ''
Write-Host 'SUCCESS: StreamVault is running with Mac Mini monitoring.' -ForegroundColor Green
Write-Host ('Backup kept at: ' + $backup)
Write-Host ('Startup log: ' + $log)
