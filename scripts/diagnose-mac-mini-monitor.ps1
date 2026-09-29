$ErrorActionPreference = 'SilentlyContinue'

Write-Host '=== PUBLIC BACKEND ===' -ForegroundColor Cyan
curl.exe -i --max-time 10 https://backend.streamvault.fit/api/version

Write-Host ''
Write-Host '=== PUBLIC MONITOR ===' -ForegroundColor Cyan
curl.exe -i --max-time 10 https://backend.streamvault.fit/internal/mac-mini-stats

Write-Host ''
Write-Host '=== WINDOWS DISK ===' -ForegroundColor Cyan
Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" |
  Select-Object DeviceID,Size,FreeSpace |
  Format-List

Write-Host ''
Write-Host '=== PROCESSES ===' -ForegroundColor Cyan
Get-Process node,ffmpeg,ffprobe,cloudflared -ErrorAction SilentlyContinue |
  Group-Object ProcessName |
  Select-Object Name,Count |
  Format-Table -AutoSize

Write-Host ''
Write-Host '=== NETWORK ===' -ForegroundColor Cyan
Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface -ErrorAction SilentlyContinue |
  Select-Object Name,BytesReceivedPersec,BytesSentPersec |
  Format-Table -AutoSize

Write-Host ''
Write-Host '=== DISK PERFORMANCE ===' -ForegroundColor Cyan
Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq '_Total' } |
  Select-Object Name,PercentDiskTime,DiskBytesPersec |
  Format-List

Write-Host ''
Write-Host '=== TEMPERATURE ===' -ForegroundColor Cyan
Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue |
  Select-Object InstanceName,CurrentTemperature |
  Format-Table -AutoSize

Write-Host ''
Write-Host '=== GPU ===' -ForegroundColor Cyan
Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue |
  Select-Object -First 10 Name,UtilizationPercentage |
  Format-Table -AutoSize
