param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [int]$Port = 4318
)

$ErrorActionPreference = 'Stop'
$testRoot = Join-Path $env:TEMP ('streamvault-catalog-restart-' + [guid]::NewGuid().ToString('N'))
$moviesDir = Join-Path $testRoot 'movies'
$seriesDir = Join-Path $testRoot 'series'
$indexFile = Join-Path $testRoot 'file-index.json'
$stdout = Join-Path $testRoot 'server.out.log'
$stderr = Join-Path $testRoot 'server.err.log'
New-Item -ItemType Directory -Force $moviesDir, (Join-Path $seriesDir 'Restart Show\Season 1') | Out-Null
Set-Content -LiteralPath (Join-Path $moviesDir 'Restart.Movie.2024.mkv') -Value 'fixture'
Set-Content -LiteralPath (Join-Path $seriesDir 'Restart Show\Season 1\Restart.Show.S01E01.mkv') -Value 'fixture'
Set-Content -LiteralPath (Join-Path $seriesDir 'Restart Show\Season 1\Restart.Show.S01E02.mkv') -Value 'fixture'

$previous = @{}
foreach ($name in 'PORT','MOVIES_DIR','SERIES_DIR','CATALOG_INDEX_FILE','FTP_CATALOG_FILE','MASSIVE_CATALOG_FILE','SV_DISABLE_LIVE_PREWARM') {
  $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$env:PORT = [string]$Port
$env:MOVIES_DIR = $moviesDir
$env:SERIES_DIR = $seriesDir
$env:CATALOG_INDEX_FILE = $indexFile
$env:FTP_CATALOG_FILE = Join-Path $testRoot 'missing-ftp.json'
$env:MASSIVE_CATALOG_FILE = Join-Path $testRoot 'missing-massive.json'
$env:SV_DISABLE_LIVE_PREWARM = '1'

function Start-TestBackend {
  Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue
  $process = Start-Process node -ArgumentList 'server.js' -WorkingDirectory $ProjectRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if ($process.HasExited) { throw "Test backend exited: $(Get-Content $stderr -Raw -ErrorAction SilentlyContinue)" }
    try {
      Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/catalog/status" -TimeoutSec 2 | Out-Null
      return $process
    } catch {}
  }
  throw 'Test backend did not become ready'
}

function Stop-TestBackend($process) {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit()
  }
}

function Wait-Status([scriptblock]$predicate) {
  for ($i = 0; $i -lt 80; $i++) {
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/catalog/status" -TimeoutSec 3
    if (& $predicate $status) { return $status }
    Start-Sleep -Milliseconds 500
  }
  throw 'Catalog status predicate timed out'
}

function Read-SeriesSample {
  $list = @(Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/series" -TimeoutSec 10)
  $show = $list | Where-Object { $_.name -eq 'Restart Show' } | Select-Object -First 1
  if (-not $show) { throw 'Restart Show missing from API' }
  $episodes = @($show.seasons.'1')
  [pscustomobject]@{
    shows = $list.Count
    seasons = @($show.seasons.PSObject.Properties).Count
    episodes = $episodes.Count
    ids = @($episodes | ForEach-Object { $_.id })
  }
}

$process = $null
try {
  $process = Start-TestBackend
  $firstStatus = Wait-Status { param($s) $s.localCounts.episodes -eq 2 -and -not $s.scanInProgress }
  $first = Read-SeriesSample
  Stop-TestBackend $process
  $process = $null

  Rename-Item -LiteralPath $seriesDir -NewName 'series.offline'
  $process = Start-TestBackend
  $offlineStatus = Wait-Status { param($s) $s.ready -and -not $s.seriesRootAvailable -and $s.localCounts.episodes -eq 2 -and -not $s.scanInProgress }
  $offline = Read-SeriesSample

  Rename-Item -LiteralPath (Join-Path $testRoot 'series.offline') -NewName 'series'
  Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$Port/api/catalog/rescan" -TimeoutSec 3 | Out-Null
  $recoveredStatus = Wait-Status { param($s) $s.seriesRootAvailable -and $s.localCounts.episodes -eq 2 -and -not $s.usingPersistedCatalog -and -not $s.scanInProgress }
  $recovered = Read-SeriesSample

  [pscustomobject]@{
    initial = $first
    unavailable = $offline
    recovered = $recovered
    idsStable = (@(Compare-Object $first.ids $offline.ids).Count -eq 0) -and (@(Compare-Object $first.ids $recovered.ids).Count -eq 0)
    unavailableError = $offlineStatus.lastScanError
    recoveredAt = $recoveredStatus.lastSuccessfulScan
  } | ConvertTo-Json -Depth 8
} finally {
  Stop-TestBackend $process
  foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
