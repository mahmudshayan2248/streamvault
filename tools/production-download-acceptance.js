'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');

const port = Number(process.env.SV_CDP_PORT || 9223);
const downloadDir = path.resolve(process.env.SV_DOWNLOAD_DIR || '/tmp/streamvault-production-downloads');
const episodeNumbers = String(process.env.SV_EPISODES || '6').split(',').map(Number).filter(Number.isInteger);
const timeoutMs = Math.max(60_000, Number(process.env.SV_DOWNLOAD_TIMEOUT_MS || 3 * 60 * 60_000));
const seriesId = 'series_fc4dc773731a3c32';

function jsonRequest(method, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path: pathname }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function main() {
  fs.mkdirSync(downloadDir, { recursive: true });
  const target = await jsonRequest('PUT', `/json/new?${encodeURIComponent('https://streamvault.fit/?acceptance=downloads')}`);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const downloads = new Map();
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      return message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    }
    if (message.method === 'Browser.downloadWillBegin') {
      downloads.set(message.params.guid, {
        guid: message.params.guid,
        url: message.params.url,
        suggestedFilename: message.params.suggestedFilename,
        state: 'inProgress',
        receivedBytes: 0,
        totalBytes: 0,
      });
      process.stdout.write(`${JSON.stringify({ downloadWillBegin: downloads.get(message.params.guid) })}\n`);
    }
    if (message.method === 'Browser.downloadProgress') {
      const current = downloads.get(message.params.guid) || { guid: message.params.guid };
      Object.assign(current, message.params);
      downloads.set(message.params.guid, current);
      if (message.params.state !== 'inProgress') process.stdout.write(`${JSON.stringify({ downloadProgress: current })}\n`);
    }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await new Promise(resolve => socket.once('open', resolve));
  await Promise.all([call('Runtime.enable'), call('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
    eventsEnabled: true,
  })]);

  const urls = episodeNumbers.map(episode => `https://backend.streamvault.fit/api/download/series/${seriesId}/1/${episode}`);
  const expression = `(()=>{for(const url of ${JSON.stringify(urls)}){const a=document.createElement('a');a.href=url;a.download='';document.body.appendChild(a);a.click();a.remove();}return true})()`;
  await call('Runtime.evaluate', { expression, userGesture: true, returnByValue: true });

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const rows = [...downloads.values()];
    process.stdout.write(`${JSON.stringify({ elapsedMs: Date.now() - startedAt, downloads: rows.map(row => ({
      episode: Number(/\/1\/(\d+)(?:\?|$)/.exec(row.url || '')?.[1]),
      state: row.state,
      receivedBytes: row.receivedBytes,
      totalBytes: row.totalBytes,
      filename: row.suggestedFilename,
    })) })}\n`);
    if (rows.length === urls.length && rows.every(row => row.state === 'completed')) break;
    if (rows.some(row => row.state === 'canceled')) throw new Error('Chrome canceled a production download');
    await new Promise(resolve => setTimeout(resolve, 30_000));
  }

  const rows = [...downloads.values()];
  if (rows.length !== urls.length || !rows.every(row => row.state === 'completed')) {
    throw new Error(`Production downloads did not complete within ${timeoutMs}ms`);
  }
  const results = [];
  for (const row of rows) {
    const filePath = row.filePath || path.join(downloadDir, row.suggestedFilename);
    const stat = fs.statSync(filePath);
    results.push({
      episode: Number(/\/1\/(\d+)(?:\?|$)/.exec(row.url || '')?.[1]),
      filename: path.basename(filePath),
      bytes: stat.size,
      expectedBytes: row.totalBytes,
      sha256: await sha256(filePath),
    });
  }
  process.stdout.write(`${JSON.stringify({ complete: true, elapsedMs: Date.now() - startedAt, results }, null, 2)}\n`);
  socket.close();
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
