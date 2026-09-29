$ErrorActionPreference = 'SilentlyContinue'

$targets = @(
  @{ Name='Local StreamVault'; Url='http://127.0.0.1:3000/api/version' },
  @{ Name='Local monitor'; Url='http://127.0.0.1:3000/internal/mac-mini-stats' },
  @{ Name='Public StreamVault'; Url='https://backend.streamvault.fit/api/version' },
  @{ Name='Public monitor'; Url='https://backend.streamvault.fit/internal/mac-mini-stats' },
  @{ Name='Control Center proxy'; Url='https://firebrick-zebra-431609.hostingersite.com/api/mac-mini' }
)

Write-Host '=== MAC MINI PATH CHECK ===' -ForegroundColor Cyan
Write-Host 'Read-only: nothing will be changed or restarted.' -ForegroundColor DarkGray
Write-Host ''

for ($round = 1; $round -le 3; $round++) {
  Write-Host ('--- Round ' + $round + ' ---') -ForegroundColor Cyan

  foreach ($t in $targets) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri $t.Url -TimeoutSec 10
      $sw.Stop()
      $body = [string]$r.Content
      if ($body.Length -gt 280) { $body = $body.Substring(0,280) + '...' }
      Write-Host ($t.Name + ': OK ' + $r.StatusCode + ' in ' + $sw.ElapsedMilliseconds + ' ms') -ForegroundColor Green
      Write-Host ('  ' + $body)
    } catch {
      $sw.Stop()
      $status = ''
      if ($_.Exception.Response) {
        try { $status = ' HTTP ' + [int]$_.Exception.Response.StatusCode } catch {}
      }
      Write-Host ($t.Name + ': FAILED' + $status + ' after ' + $sw.ElapsedMilliseconds + ' ms') -ForegroundColor Red
      Write-Host ('  ' + $_.Exception.Message)
    }
  }

  Write-Host ''
  if ($round -lt 3) { Start-Sleep -Seconds 3 }
}
