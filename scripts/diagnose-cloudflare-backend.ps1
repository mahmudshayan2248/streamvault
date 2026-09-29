$ErrorActionPreference = 'SilentlyContinue'

Write-Host '=== CLOUDFLARED PROCESSES ===' -ForegroundColor Cyan
Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" |
  Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine |
  Format-List

Write-Host ''
Write-Host '=== WINDOWS CLOUDFLARED SERVICE ===' -ForegroundColor Cyan
Get-CimInstance Win32_Service |
  Where-Object { $_.Name -match 'cloudflared' -or $_.DisplayName -match 'cloudflared' } |
  Select-Object Name,State,StartMode,PathName |
  Format-List

Write-Host ''
Write-Host '=== SYSTEMPROFILE CONFIG ===' -ForegroundColor Cyan
$systemConfig='C:\Windows\System32\config\systemprofile\.cloudflared\config.yml'
if (Test-Path $systemConfig) {
  Get-Content $systemConfig
} else {
  Write-Host 'Not found'
}

Write-Host ''
Write-Host '=== USER CONFIG ===' -ForegroundColor Cyan
$userConfig='C:\Users\Mac Mini\.cloudflared\config.yml'
if (Test-Path $userConfig) {
  Get-Content $userConfig
} else {
  Write-Host 'Not found'
}

Write-Host ''
Write-Host '=== CLOUDFLARED VERSION ===' -ForegroundColor Cyan
$cf = @(
  'C:\Cloudflared\bin\cloudflared.exe',
  'C:\Users\Mac Mini\.cloudflared\cloudflared.exe'
)
foreach ($exe in $cf) {
  if (Test-Path $exe) {
    Write-Host $exe
    & $exe --version
  }
}

Write-Host ''
Write-Host '=== LOCAL STREAMVAULT ===' -ForegroundColor Cyan
curl.exe -i --max-time 5 http://127.0.0.1:3000/api/version

Write-Host ''
Write-Host '=== PUBLIC BACKEND ===' -ForegroundColor Cyan
curl.exe -i --max-time 10 https://backend.streamvault.fit/api/version

Write-Host ''
Write-Host '=== RECENT CLOUDFLARED EVENTS ===' -ForegroundColor Cyan
Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=(Get-Date).AddHours(-2)} -ErrorAction SilentlyContinue |
  Where-Object { $_.ProviderName -match 'cloudflared' -or $_.Message -match 'cloudflared|backend.streamvault.fit' } |
  Select-Object -First 20 TimeCreated,ProviderName,Id,LevelDisplayName,Message |
  Format-List
