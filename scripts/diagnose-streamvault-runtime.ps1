$ErrorActionPreference = 'SilentlyContinue'

Write-Host '=== StreamVault runtime check ===' -ForegroundColor Cyan
Write-Host 'This check is read-only. It will not stop or change anything.' -ForegroundColor DarkGray
Write-Host ''

$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)
$processes = @{}
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
  $processes[[int]$_.ProcessId] = $_
}

$rows = @()

foreach ($listener in $listeners) {
  $pidValue = [int]$listener.OwningProcess
  if (-not $pidValue) { continue }

  $proc = $processes[$pidValue]
  if (-not $proc) { continue }

  $name = [string]$proc.Name
  if ($name -ine 'node.exe') { continue }

  $port = [int]$listener.LocalPort
  $isStreamVault = $false
  $version = ''
  $answer = ''

  try {
    $r = Invoke-RestMethod ("http://127.0.0.1:" + $port + "/api/version") -TimeoutSec 3
    if ($r) {
      $answer = ($r | ConvertTo-Json -Compress -Depth 3)
      if ($r.ok -eq $true) {
        $isStreamVault = $true
        $version = [string]$r.version
      }
    }
  } catch {}

  $rows += [pscustomobject]@{
    PID = $pidValue
    Port = $port
    StreamVault = $isStreamVault
    Version = $version
    Command = [string]$proc.CommandLine
    Response = $answer
  }
}

if ($rows.Count -eq 0) {
  Write-Host 'No listening Node.js server was found.' -ForegroundColor Yellow
} else {
  Write-Host 'Listening Node.js servers:' -ForegroundColor Cyan
  $rows | Sort-Object Port | Format-Table PID,Port,StreamVault,Version -AutoSize
  Write-Host ''
  foreach ($row in ($rows | Sort-Object Port)) {
    Write-Host ("PID " + $row.PID + " / port " + $row.Port) -ForegroundColor White
    Write-Host ("Command: " + $row.Command)
    if ($row.Response) { Write-Host ("api/version: " + $row.Response) }
    Write-Host ''
  }
}

Write-Host 'Port 3000 owner:' -ForegroundColor Cyan
$port3000 = @($listeners | Where-Object { [int]$_.LocalPort -eq 3000 })
if ($port3000.Count -eq 0) {
  Write-Host 'Nothing is listening on port 3000.'
} else {
  foreach ($x in $port3000) {
    $p = $processes[[int]$x.OwningProcess]
    Write-Host ("PID: " + $x.OwningProcess)
    Write-Host ("Name: " + $p.Name)
    Write-Host ("Command: " + $p.CommandLine)
  }
}

Write-Host ''
Write-Host 'Cloudflare tunnel process:' -ForegroundColor Cyan
$cf = @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue)
if ($cf.Count -eq 0) {
  Write-Host 'cloudflared.exe was not found.'
} else {
  $cf | Select-Object ProcessId,CommandLine | Format-List
}

Write-Host ''
$found = @($rows | Where-Object { $_.StreamVault -eq $true })
if ($found.Count -eq 1) {
  Write-Host ("FOUND STREAMVAULT: PID " + $found[0].PID + " on port " + $found[0].Port) -ForegroundColor Green
} elseif ($found.Count -gt 1) {
  Write-Host 'More than one server answered like StreamVault. Do not restart anything yet.' -ForegroundColor Yellow
} else {
  Write-Host 'STREAMVAULT PORT NOT FOUND YET. No changes were made.' -ForegroundColor Yellow
}
