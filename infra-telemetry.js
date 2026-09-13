'use strict';

const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const WebSocket = require('ws');

const MAX_EVENTS = 500;

const ROUTE_NODES = [
  [/^\/api\/home-feed(?:\/|$)/, 'home-feed-service'],
  [/^\/api\/section(?:\/|$)/, 'section-service'],
  [/^\/api\/movies(?:\/|$)/, 'catalog-service'],
  [/^\/api\/series(?:\/|$)/, 'series-catalog'],
  [/^\/api\/search(?:\/|$)/, 'search-service'],
  [/^\/api\/details(?:\/|$)/, 'metadata-service'],
  [/^\/api\/title-details(?:\/|$)/, 'metadata-service'],
  [/^\/api\/media-info(?:\/|$)/, 'media-info-service'],
  [/^\/api\/duration(?:\/|$)/, 'media-info-service'],
  [/^\/api\/subtitles(?:\/|$)/, 'subtitle-service'],
  [/^\/subtitles(?:\/|$)/, 'subtitle-service'],
  [/^\/api\/playback\/local(?:\/|$)/, 'local-playback-service'],
  [/^\/stream(?:\/|$)/, 'media-stream-router'],
  [/^\/api\/stream-seek(?:\/|$)/, 'seek-service'],
  [/^\/live(?:\/|$)/, 'stream-manager'],
  [/^\/live-relay(?:\/|$)/, 'live-relay-service'],
  [/^\/api\/live-relay(?:\/|$)/, 'live-relay-service'],
  [/^\/api\/mobile-hls(?:\/|$)/, 'mobile-hls-transcoder'],
  [/^\/api\/playback\/ftp(?:\/|$)/, 'ftp-playback-router'],
  [/^\/api\/ftp\/stream(?:\/|$)/, 'ftp-transcoder'],
  [/^\/api\/ftp\/proxy(?:\/|$)/, 'ftp-proxy'],
  [/^\/api\/ftp\/(?:media-info|info)(?:\/|$)/, 'ftp-media-info'],
  [/^\/poster-cache(?:\/|$)/, 'poster-cache'],
  [/^\/api\/channels(?:\/|$)/, 'channel-catalog'],
  [/^\/api\/downloads?(?:\/|$)/, 'downloads-service'],
  [/^\/(?:api\/)?uploads?(?:\/|$)/, 'upload-pipeline'],
  [/^\/api\/trending(?:\/|$)/, 'tmdb-trending-service'],
  [/^\/party(?:\/|$)/, 'watch-party-service'],
  [/^\/api(?:\/|$)/, 'api-gateway'],
];

function nodeForPath(pathname) {
  const match = ROUTE_NODES.find(([pattern]) => pattern.test(pathname));
  return match ? match[1] : 'streamvault-core';
}

function requestKind(pathname) {
  if (/^\/api\/(?:playback\/ftp|ftp\/(?:stream|proxy))(?:\/|$)/.test(pathname)) return 'ftp';
  if (/^\/(?:live|live-relay)(?:\/|$)/.test(pathname)) return 'live';
  if (/^\/(?:stream)(?:\/|$)/.test(pathname) ||
      /^\/api\/(?:playback\/local\/[^/]+\/stream|mobile-hls)(?:\/|$)/.test(pathname)) return 'stream';
  return null;
}

function requestPath(req) {
  return String(req.path || req.url || '/').split('?')[0].slice(0, 512);
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .split(',')[0].trim().slice(0, 80);
}

function isLocalAddress(value) {
  const ip = String(value || '').replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1';
}

function safeMessage(value) {
  return String(value || 'Unknown error')
    .replace(/[A-Za-z]:\\(?:[^\\\s]+\\)*[^\s]*/g, '[path]')
    .replace(/(^|\s)\/(?:[^/\s]+\/)+[^\s]*/g, '$1[path]')
    .replace(/\b(SV_INFRA_RELAY_TOKEN|SV_INFRA_TOKEN)\s*[=:]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 500);
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createInfraTelemetry({ app, server, nodeName = os.hostname(), serviceName = 'StreamVault' } = {}) {
  const startedAt = Date.now();
  const recentEvents = [];
  const nodeActivity = new Map();
  for (const nodeId of new Set([...ROUTE_NODES.map(([, id]) => id), 'streamvault-core'])) {
    nodeActivity.set(nodeId, { nodeId, eventCount: 0, lastSeen: null });
  }
  const state = {
    activeHttpRequests: 0,
    activeStreams: 0,
    activeFtpTransfers: 0,
    activeLiveTvSessions: 0,
    totalRequests: 0,
    errorCount: 0,
    totalLatencyMs: 0,
    completedRequests: 0,
    cpu: 0,
    ram: 0,
    netInMbps: null,
    netOutMbps: null,
    disk: null,
  };

  let wsServer = null;
  let attachedServer = null;
  let lastCpuUsage = process.cpuUsage();
  let lastCpuAt = process.hrtime.bigint();
  let networkProbeBusy = false;
  let previousNetwork = null;
  let relay = null;
  let relayRetry = null;
  let relayAttempts = 0;
  let lastSystemEvent = null;

  function updateCpuAndRam() {
    const now = process.hrtime.bigint();
    const elapsedMicros = Number(now - lastCpuAt) / 1000;
    const usage = process.cpuUsage(lastCpuUsage);
    const usedMicros = usage.user + usage.system;
    const cpuCapacity = Math.max(1, os.cpus().length);
    state.cpu = elapsedMicros > 0
      ? Number(Math.min(100, Math.max(0, usedMicros / elapsedMicros * 100 / cpuCapacity)).toFixed(1))
      : 0;
    lastCpuUsage = process.cpuUsage();
    lastCpuAt = now;
    const totalMemory = os.totalmem();
    state.ram = totalMemory > 0
      ? Number(((totalMemory - os.freemem()) / totalMemory * 100).toFixed(1))
      : 0;
  }

  function metrics() {
    const memory = process.memoryUsage();
    return {
      uptimeSeconds: Number(process.uptime().toFixed(1)),
      processRssBytes: memory.rss,
      processHeapUsedBytes: memory.heapUsed,
      processHeapTotalBytes: memory.heapTotal,
      cpu: state.cpu,
      ram: state.ram,
      netInMbps: state.netInMbps,
      netOutMbps: state.netOutMbps,
      disk: state.disk,
      activeHttpRequests: state.activeHttpRequests,
      activeStreams: state.activeStreams,
      activeFtpTransfers: state.activeFtpTransfers,
      activeLiveTvSessions: state.activeLiveTvSessions,
      wsClients: wsServer ? wsServer.clients.size : 0,
      totalRequests: state.totalRequests,
      errorCount: state.errorCount,
      averageLatencyMs: state.completedRequests
        ? Number((state.totalLatencyMs / state.completedRequests).toFixed(1))
        : 0,
    };
  }

  function normalizeEvent(meta = {}) {
    const pathname = String(meta.path || '').split('?')[0].slice(0, 512);
    const nodeId = meta.nodeId || nodeForPath(pathname);
    return {
      kind: 'infra_event',
      eventType: meta.eventType || 'http',
      nodeId,
      sourceNodeId: meta.sourceNodeId || 'api-gateway',
      targetNodeId: meta.targetNodeId || nodeId,
      severity: meta.severity || 'info',
      timestamp: finite(meta.timestamp, Date.now()),
      path: pathname || null,
      method: meta.method ? String(meta.method).slice(0, 16) : null,
      statusCode: finite(meta.statusCode),
      latencyMs: finite(meta.latencyMs),
      bytesOut: finite(meta.bytesOut),
      userAgent: meta.userAgent ? String(meta.userAgent).slice(0, 300) : null,
      ip: meta.ip ? String(meta.ip).slice(0, 80) : null,
      message: meta.message ? safeMessage(meta.message) : null,
      metrics: meta.metrics || metrics(),
    };
  }

  function sendRelay(payload) {
    if (relay && relay.readyState === WebSocket.OPEN) {
      try { relay.send(JSON.stringify(payload)); } catch {}
    }
  }

  function emit(meta = {}) {
    const event = normalizeEvent(meta);
    recentEvents.push(event);
    if (recentEvents.length > MAX_EVENTS) recentEvents.shift();
    const activity = nodeActivity.get(event.nodeId) || { nodeId: event.nodeId, eventCount: 0, lastSeen: null };
    activity.eventCount += 1;
    activity.lastSeen = event.timestamp;
    activity.lastEventType = event.eventType;
    activity.lastSeverity = event.severity;
    activity.lastSourceNodeId = event.sourceNodeId;
    if (event.eventType === 'http' && Number.isFinite(event.latencyMs)) {
      activity.completedRequests = Number(activity.completedRequests || 0) + 1;
      activity.totalLatencyMs = Number(activity.totalLatencyMs || 0) + event.latencyMs;
    }
    nodeActivity.set(event.nodeId, activity);

    if (wsServer) {
      const payload = JSON.stringify(event);
      for (const client of wsServer.clients) {
        if (client.readyState === WebSocket.OPEN) {
          try { client.send(payload); } catch {}
        }
      }
    }
    sendRelay(event);
    return event;
  }

  function beginSession(type, meta = {}) {
    if (type === 'ftp') state.activeFtpTransfers += 1;
    else state.activeStreams += 1;
    if (type === 'live') state.activeLiveTvSessions += 1;
    return emit({ ...meta, eventType: type, severity: 'info' });
  }

  function endSession(type, meta = {}) {
    if (type === 'ftp') state.activeFtpTransfers = Math.max(0, state.activeFtpTransfers - 1);
    else state.activeStreams = Math.max(0, state.activeStreams - 1);
    if (type === 'live') state.activeLiveTvSessions = Math.max(0, state.activeLiveTvSessions - 1);
    return emit({ ...meta, eventType: type, severity: finite(meta.statusCode, 200) >= 500 ? 'error' : 'info' });
  }

  function streamStart(meta = {}) { return beginSession(meta.eventType === 'live' ? 'live' : 'stream', meta); }
  function streamEnd(meta = {}) { return endSession(meta.eventType === 'live' ? 'live' : 'stream', meta); }
  function ftpStart(meta = {}) { return beginSession('ftp', meta); }
  function ftpEnd(meta = {}) { return endSession('ftp', meta); }
  function cacheHit(meta = {}) { return emit({ ...meta, eventType: 'cache', severity: 'info', message: meta.message || 'cache_hit' }); }
  function cacheMiss(meta = {}) { return emit({ ...meta, eventType: 'cache', severity: 'info', message: meta.message || 'cache_miss' }); }
  function error(meta = {}) {
    state.errorCount += 1;
    return emit({ ...meta, eventType: 'error', severity: 'error', message: safeMessage(meta.message) });
  }

  function requestMiddleware(req, res, next) {
    const started = process.hrtime.bigint();
    const pathname = requestPath(req);
    const nodeId = nodeForPath(pathname);
    const kind = requestKind(pathname);
    const common = {
      nodeId,
      sourceNodeId: 'api-gateway',
      targetNodeId: nodeId,
      path: pathname,
      method: req.method,
      userAgent: req.headers['user-agent'] || '',
      ip: clientIp(req),
      timestamp: Date.now(),
    };
    req.infraNodeId = nodeId;
    state.activeHttpRequests += 1;
    state.totalRequests += 1;
    if (kind === 'ftp') ftpStart(common);
    else if (kind) streamStart({ ...common, eventType: kind });

    let completed = false;
    const complete = () => {
      if (completed) return;
      completed = true;
      state.activeHttpRequests = Math.max(0, state.activeHttpRequests - 1);
      const latencyMs = Number((Number(process.hrtime.bigint() - started) / 1e6).toFixed(1));
      const contentLength = finite(res.getHeader('content-length'));
      const statusCode = res.statusCode || 0;
      state.completedRequests += 1;
      state.totalLatencyMs += latencyMs;
      if (statusCode >= 500 && !res.infraErrorEmitted) state.errorCount += 1;
      const finished = { ...common, statusCode, latencyMs, bytesOut: contentLength };
      emit({ ...finished, eventType: 'http', severity: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info' });
      if (kind === 'ftp') ftpEnd(finished);
      else if (kind) streamEnd({ ...finished, eventType: kind });

      const cacheState = String(res.getHeader('x-sv-live-cache') || '').toUpperCase();
      if (cacheState === 'HIT' || cacheState === 'DEDUP') cacheHit(finished);
      else if (cacheState === 'MISS') cacheMiss(finished);
    };
    res.once('finish', complete);
    res.once('close', complete);
    next();
  }

  function snapshot() {
    return {
      ok: true,
      nodeName,
      serviceName,
      timestamp: Date.now(),
      startedAt,
      metrics: metrics(),
      nodes: Array.from(nodeActivity.values()),
      lastSystemEvent,
    };
  }

  function nodeUpdate(nodeId, timestamp = Date.now()) {
    const activity = nodeActivity.get(nodeId) || {};
    const current = metrics();
    const bandwidth = current.netInMbps === null && current.netOutMbps === null
      ? null
      : Number(((current.netInMbps || 0) + (current.netOutMbps || 0)).toFixed(2));
    const latency = activity.completedRequests
      ? Number((activity.totalLatencyMs / activity.completedRequests).toFixed(1))
      : current.averageLatencyMs;
    const recentError = activity.lastSeverity === 'error' && timestamp - Number(activity.lastSeen || 0) < 3000;
    const recentlyActive = nodeId === 'streamvault-core' || (activity.lastEventType && activity.lastEventType !== 'system' && timestamp - Number(activity.lastSeen || 0) < 2000);
    return {
      type: 'node_update',
      nodeId,
      status: recentError ? 'ERROR' : 'ONLINE',
      activity: Boolean(recentlyActive),
      eventType: activity.lastEventType || 'system',
      sourceNodeId: activity.lastSourceNodeId || 'streamvault-core',
      targetNodeId: nodeId,
      severity: recentError ? 'error' : 'info',
      metrics: {
        cpu: current.cpu,
        ram: current.ram,
        disk: current.disk,
        latency,
        bandwidth,
        netInMbps: current.netInMbps,
        netOutMbps: current.netOutMbps,
        activeStreams: current.activeStreams,
        ftpTransfers: current.activeFtpTransfers,
        httpRequests: current.activeHttpRequests,
        wsClients: current.wsClients,
        totalRequests: current.totalRequests,
        errorCount: current.errorCount,
        uptimeSeconds: current.uptimeSeconds,
      },
      timestamp,
    };
  }

  function broadcastNodeUpdates(timestamp = Date.now()) {
    for (const nodeId of nodeActivity.keys()) {
      const update = nodeUpdate(nodeId, timestamp);
      if (wsServer) {
        const payload = JSON.stringify(update);
        for (const client of wsServer.clients) {
          if (client.readyState === WebSocket.OPEN) {
            try { client.send(payload); } catch {}
          }
        }
      }
      sendRelay(update);
    }
  }

  function authorized(req) {
    const token = process.env.SV_INFRA_TOKEN;
    if (!token) return true;
    if (process.env.NODE_ENV !== 'production' && isLocalAddress(clientIp(req))) return true;
    const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const expectedBuffer = Buffer.from(token);
    const suppliedBuffer = Buffer.from(supplied);
    return expectedBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
  }

  function attachWebSocket(httpServer) {
    if (!httpServer || attachedServer === httpServer) return wsServer;
    attachedServer = httpServer;
    wsServer = new WebSocket.Server({ noServer: true });
    httpServer.on('upgrade', (req, socket, head) => {
      let pathname = '';
      try { pathname = new URL(req.url, 'http://0.0.0.0').pathname; } catch {}
      if (pathname !== '/infra/live') return;
      if (!authorized(req)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wsServer.handleUpgrade(req, socket, head, client => wsServer.emit('connection', client, req));
    });
    wsServer.on('connection', client => {
      emit({ eventType: 'websocket', nodeId: 'streamvault-core', message: 'dashboard_connected' });
      broadcastNodeUpdates();
      client.on('error', () => {});
      client.on('close', () => emit({ eventType: 'websocket', nodeId: 'streamvault-core', message: 'dashboard_disconnected' }));
    });
    return wsServer;
  }

  function recordNetworkTotals(received, sent) {
    const current = { received: Number(received), sent: Number(sent), at: Date.now() };
    if (!Number.isFinite(current.received) || !Number.isFinite(current.sent)) throw new Error('Invalid network counters');
    if (previousNetwork && current.at > previousNetwork.at) {
      const seconds = (current.at - previousNetwork.at) / 1000;
      state.netInMbps = Number(Math.max(0, (current.received - previousNetwork.received) * 8 / seconds / 1e6).toFixed(2));
      state.netOutMbps = Number(Math.max(0, (current.sent - previousNetwork.sent) * 8 / seconds / 1e6).toFixed(2));
    }
    previousNetwork = current;
  }

  function parseDarwinNetwork(output) {
    const lines = String(output).trim().split(/\r?\n/).map(line => line.trim().split(/\s+/));
    const header = lines.find(parts => parts[0] === 'Name' && parts.includes('Ibytes') && parts.includes('Obytes'));
    if (!header) throw new Error('Network counter columns unavailable');
    const nameIndex = header.indexOf('Name');
    const inIndex = header.indexOf('Ibytes');
    const outIndex = header.indexOf('Obytes');
    const interfaces = new Map();
    for (const parts of lines.slice(lines.indexOf(header) + 1)) {
      const name = parts[nameIndex];
      const received = Number(parts[inIndex]);
      const sent = Number(parts[outIndex]);
      if (!name || name === 'lo0' || !Number.isFinite(received) || !Number.isFinite(sent)) continue;
      const previous = interfaces.get(name) || { received: 0, sent: 0 };
      interfaces.set(name, { received: Math.max(previous.received, received), sent: Math.max(previous.sent, sent) });
    }
    return [...interfaces.values()].reduce((total, value) => ({ received: total.received + value.received, sent: total.sent + value.sent }), { received: 0, sent: 0 });
  }

  function probeNetwork() {
    if (networkProbeBusy) return;
    networkProbeBusy = true;
    if (process.platform === 'linux') {
      fs.readFile('/proc/net/dev', 'utf8', (readError, output) => {
        networkProbeBusy = false;
        if (readError) { state.netInMbps = null; state.netOutMbps = null; return; }
        try {
          const totals = output.split(/\r?\n/).filter(line => line.includes(':')).reduce((sum, line) => {
            const [name, values] = line.trim().split(':');
            const fields = values.trim().split(/\s+/).map(Number);
            if (name.trim() !== 'lo') { sum.received += fields[0] || 0; sum.sent += fields[8] || 0; }
            return sum;
          }, { received: 0, sent: 0 });
          recordNetworkTotals(totals.received, totals.sent);
        } catch { state.netInMbps = null; state.netOutMbps = null; }
      });
      return;
    }
    const windows = process.platform === 'win32';
    const command = "$s=Get-NetAdapterStatistics -ErrorAction Stop; [pscustomobject]@{received=($s|Measure-Object -Property ReceivedBytes -Sum).Sum;sent=($s|Measure-Object -Property SentBytes -Sum).Sum}|ConvertTo-Json -Compress";
    const child = windows
      ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true })
      : spawn('netstat', ['-ibn']);
    let output = '';
    const timeout = setTimeout(() => child.kill(), 3500);
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', () => {
      state.netInMbps = null;
      state.netOutMbps = null;
      networkProbeBusy = false;
      clearTimeout(timeout);
    });
    child.on('close', code => {
      clearTimeout(timeout);
      networkProbeBusy = false;
      if (code !== 0) {
        state.netInMbps = null;
        state.netOutMbps = null;
        return;
      }
      try {
        const totals = windows ? JSON.parse(output.trim()) : parseDarwinNetwork(output);
        recordNetworkTotals(totals.received, totals.sent);
      } catch {
        state.netInMbps = null;
        state.netOutMbps = null;
      }
    });
  }

  function probeDisk() {
    const windows = process.platform === 'win32';
    const command = "$d=Get-CimInstance Win32_LogicalDisk -ErrorAction Stop|Where-Object {$_.DeviceID -eq $env:SystemDrive}|Select-Object -First 1; if($d.Size -gt 0){[math]::Round((($d.Size-$d.FreeSpace)/$d.Size)*100,1)}";
    const child = windows
      ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true })
      : spawn('df', ['-k', '/']);
    let output = '';
    const timeout = setTimeout(() => child.kill(), 3500);
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', () => { clearTimeout(timeout); state.disk = null; });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) { state.disk = null; return; }
      const value = windows
        ? Number(output.trim())
        : Number((output.match(/\b(\d+(?:\.\d+)?)%/) || [])[1]);
      state.disk = Number.isFinite(value) ? Number(Math.max(0, Math.min(100, value)).toFixed(1)) : null;
    });
  }

  function connectRelay() {
    const url = process.env.SV_INFRA_RELAY_URL;
    if (!url || relay || relayRetry) return;
    const options = process.env.SV_INFRA_RELAY_TOKEN
      ? { headers: { Authorization: `Bearer ${process.env.SV_INFRA_RELAY_TOKEN}` } }
      : undefined;
    try {
      relay = new WebSocket(url, options);
      relay.on('open', () => {
        relayAttempts = 0;
        emit({ eventType: 'websocket', nodeId: 'streamvault-core', message: 'relay_connected' });
      });
      relay.on('error', () => {});
      relay.on('close', () => {
        relay = null;
        const delay = Math.min(30000, 1000 * (2 ** Math.min(relayAttempts++, 5)));
        relayRetry = setTimeout(() => { relayRetry = null; connectRelay(); }, delay);
        relayRetry.unref?.();
      });
    } catch {
      relay = null;
      relayRetry = setTimeout(() => { relayRetry = null; connectRelay(); }, 5000);
      relayRetry.unref?.();
    }
  }

  const systemTimer = setInterval(() => {
    updateCpuAndRam();
    lastSystemEvent = emit({
      eventType: 'system',
      nodeId: 'streamvault-core',
      sourceNodeId: 'streamvault-core',
      targetNodeId: 'streamvault-core',
      metrics: metrics(),
    });
    broadcastNodeUpdates(lastSystemEvent.timestamp);
  }, 1000);
  systemTimer.unref?.();
  const networkTimer = setInterval(probeNetwork, 3000);
  networkTimer.unref?.();
  const diskTimer = setInterval(probeDisk, 10000);
  diskTimer.unref?.();
  updateCpuAndRam();
  probeNetwork();
  probeDisk();
  connectRelay();
  if (server) attachWebSocket(server);

  return {
    requestMiddleware,
    emit,
    streamStart,
    streamEnd,
    ftpStart,
    ftpEnd,
    cacheHit,
    cacheMiss,
    error,
    snapshot,
    metrics,
    attachWebSocket,
    authorize: authorized,
    events: () => recentEvents.slice(),
    nodes: () => Array.from(nodeActivity.values()),
  };
}

module.exports = { createInfraTelemetry };
