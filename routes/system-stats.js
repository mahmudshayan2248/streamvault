'use strict';

const express = require('express');
const os = require('os');
const { execFile } = require('child_process');

const CACHE_MS = 1800;
let cachedWindows = null;
let cachedAt = 0;
let windowsSampleInFlight = null;
let previousCpu = cpuTimes();

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampPercent(value) {
  const n = finiteOrNull(value);
  if (n === null) return null;
  return Math.max(0, Math.min(100, n));
}

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const t = cpu.times || {};
    const sum = Number(t.user || 0) + Number(t.nice || 0) + Number(t.sys || 0) + Number(t.idle || 0) + Number(t.irq || 0);
    idle += Number(t.idle || 0);
    total += sum;
  }
  return { idle, total };
}

function cpuUsagePercent() {
  const current = cpuTimes();
  const idleDelta = current.idle - previousCpu.idle;
  const totalDelta = current.total - previousCpu.total;
  previousCpu = current;
  if (!Number.isFinite(totalDelta) || totalDelta <= 0) return null;
  return clampPercent((1 - idleDelta / totalDelta) * 100);
}

function runPowerShell(script) {
  return new Promise(resolve => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 3500, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error) return resolve(null);
        const text = String(stdout || '').trim();
        if (!text) return resolve(null);
        try { resolve(JSON.parse(text)); } catch { resolve(null); }
      }
    );
  });
}

const WINDOWS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object -First 1
$diskPerf = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk | Where-Object { $_.Name -eq '_Total' } | Select-Object -First 1
$net = Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface | Where-Object { $_.Name -notmatch 'Loopback|isatap|Teredo' }
$netDown = ($net | Measure-Object -Property BytesReceivedPersec -Sum).Sum
$netUp = ($net | Measure-Object -Property BytesSentPersec -Sum).Sum

$gpuValue = $null
try {
  $gpuRows = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine
  if ($gpuRows) {
    $gpuValue = ($gpuRows | Measure-Object -Property UtilizationPercentage -Maximum).Maximum
  }
} catch {}

$tempC = $null
try {
  $temps = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature
  if ($temps) {
    $converted = @($temps | ForEach-Object { ($_.CurrentTemperature / 10) - 273.15 } | Where-Object { $_ -gt 0 -and $_ -lt 150 })
    if ($converted.Count -gt 0) {
      $tempC = ($converted | Measure-Object -Maximum).Maximum
    }
  }
} catch {}

$ffmpeg = (Get-Process ffmpeg -ErrorAction SilentlyContinue | Measure-Object).Count
$ffprobe = (Get-Process ffprobe -ErrorAction SilentlyContinue | Measure-Object).Count
$node = (Get-Process node -ErrorAction SilentlyContinue | Measure-Object).Count
$cloudflared = (Get-Process cloudflared -ErrorAction SilentlyContinue | Measure-Object).Count

[pscustomobject]@{
  diskTotalBytes = if ($disk) { [double]$disk.Size } else { $null }
  diskFreeBytes = if ($disk) { [double]$disk.FreeSpace } else { $null }
  diskActivityPercent = if ($diskPerf) { [double]$diskPerf.PercentDiskTime } else { $null }
  diskBytesPerSecond = if ($diskPerf) { [double]$diskPerf.DiskBytesPersec } else { $null }
  networkDownBytesPerSecond = [double]($netDown -as [double])
  networkUpBytesPerSecond = [double]($netUp -as [double])
  gpuUsagePercent = if ($gpuValue -ne $null) { [double]$gpuValue } else { $null }
  temperatureC = if ($tempC -ne $null) { [double]$tempC } else { $null }
  ffmpegProcesses = [int]$ffmpeg
  ffprobeProcesses = [int]$ffprobe
  nodeProcesses = [int]$node
  cloudflaredProcesses = [int]$cloudflared
} | ConvertTo-Json -Compress
`;

async function windowsStats() {
  if (process.platform !== 'win32') return null;
  const now = Date.now();
  if (cachedWindows && now - cachedAt < CACHE_MS) return cachedWindows;
  if (windowsSampleInFlight) return windowsSampleInFlight;

  windowsSampleInFlight = runPowerShell(WINDOWS_SCRIPT)
    .then(value => {
      if (value) {
        cachedWindows = value;
        cachedAt = Date.now();
      }
      return cachedWindows;
    })
    .finally(() => {
      windowsSampleInFlight = null;
    });

  return windowsSampleInFlight;
}

function bytesSummary(total, free) {
  const totalBytes = finiteOrNull(total);
  const freeBytes = finiteOrNull(free);
  if (totalBytes === null || freeBytes === null || totalBytes <= 0) {
    return { totalBytes: null, freeBytes: null, usedBytes: null, usedPercent: null };
  }
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  return {
    totalBytes,
    freeBytes,
    usedBytes,
    usedPercent: clampPercent((usedBytes / totalBytes) * 100)
  };
}

module.exports = function createSystemStatsRouter({ token = '' } = {}) {
  const router = express.Router();
  const expectedToken = String(token || '').trim();

  router.get('/', async (req, res) => {
    if (expectedToken) {
      const auth = String(req.headers.authorization || '');
      if (auth !== `Bearer ${expectedToken}`) {
        return res.status(401).json({ ok: false, error: 'unauthorized' });
      }
    }

    const startedAt = Date.now();
    const windows = await windowsStats();
    const totalMemoryBytes = os.totalmem();
    const freeMemoryBytes = os.freemem();
    const usedMemoryBytes = Math.max(0, totalMemoryBytes - freeMemoryBytes);
    const cpus = os.cpus();
    const disk = bytesSummary(windows?.diskTotalBytes, windows?.diskFreeBytes);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      at: new Date().toISOString(),
      sampleMs: Date.now() - startedAt,
      hostname: os.hostname(),
      platform: process.platform,
      osRelease: os.release(),
      arch: os.arch(),
      systemUptimeSeconds: Math.round(os.uptime()),
      appUptimeSeconds: Math.round(process.uptime()),
      cpu: {
        usagePercent: cpuUsagePercent(),
        model: cpus[0]?.model || null,
        logicalCores: cpus.length || null
      },
      memory: {
        totalBytes: totalMemoryBytes,
        freeBytes: freeMemoryBytes,
        usedBytes: usedMemoryBytes,
        usedPercent: totalMemoryBytes > 0 ? clampPercent((usedMemoryBytes / totalMemoryBytes) * 100) : null
      },
      disk: {
        ...disk,
        activityPercent: clampPercent(windows?.diskActivityPercent),
        bytesPerSecond: finiteOrNull(windows?.diskBytesPerSecond)
      },
      network: {
        downBytesPerSecond: finiteOrNull(windows?.networkDownBytesPerSecond),
        upBytesPerSecond: finiteOrNull(windows?.networkUpBytesPerSecond)
      },
      gpu: {
        usagePercent: clampPercent(windows?.gpuUsagePercent)
      },
      temperatureC: (() => {
        const t = finiteOrNull(windows?.temperatureC);
        return t !== null && t > 0 && t < 150 ? t : null;
      })(),
      processes: {
        ffmpeg: finiteOrNull(windows?.ffmpegProcesses),
        ffprobe: finiteOrNull(windows?.ffprobeProcesses),
        node: finiteOrNull(windows?.nodeProcesses),
        cloudflared: finiteOrNull(windows?.cloudflaredProcesses),
        streamvaultMemoryBytes: process.memoryUsage().rss
      }
    });
  });

  return router;
};
