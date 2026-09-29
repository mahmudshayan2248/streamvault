$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = Join-Path $PSScriptRoot "out"
New-Item -ItemType Directory -Force $outDir | Out-Null

$stdout = Join-Path $env:TEMP "sv-details-shadow-all-safe-stdout-$stamp.txt"
$stderr = Join-Path $env:TEMP "sv-details-shadow-all-safe-stderr-$stamp.txt"
$out = Join-Path $outDir "details-shadow-all-safe-$stamp.txt"

$p = Start-Process -FilePath "cmd.exe" -ArgumentList "/d","/c","npm run details:shadow:all" -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr

"STDOUT:" | Set-Content -Encoding UTF8 $out
Get-Content $stdout -ErrorAction SilentlyContinue | Add-Content -Encoding UTF8 $out
"`nSTDERR_CAPTURED:" | Add-Content -Encoding UTF8 $out
Get-Content $stderr -ErrorAction SilentlyContinue | Add-Content -Encoding UTF8 $out
"`nEXIT_CODE=$($p.ExitCode)" | Add-Content -Encoding UTF8 $out

Get-Content $out
exit $p.ExitCode
