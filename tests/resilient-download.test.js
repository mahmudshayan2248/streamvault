'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const {
  parseContentRange,
  sourceResponseMeta,
  streamOriginalDownload,
  validateContinuation,
} = require('../lib/resilient-download');

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

function url(server, pathname = '/') {
  return `http://127.0.0.1:${server.address().port}${pathname}`;
}

function download(target, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(target, { headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.once('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
      response.once('aborted', () => reject(Object.assign(new Error('client response aborted'), { code: 'CLIENT_RESPONSE_ABORTED' })));
      response.once('error', reject);
    });
    request.once('error', reject);
  });
}

function proxyHandler(source, events, options = {}) {
  return (req, res) => streamOriginalDownload({
    req,
    res,
    sourceUrl: source,
    contentType: upstream => upstream || 'application/octet-stream',
    contentDisposition: 'attachment; filename="fixture.mkv"',
    retryBaseDelayMs: 5,
    connectTimeoutMs: 1000,
    sourceIdleTimeoutMs: 1000,
    onEvent: (event, details) => events.push({ event, ...details }),
    onFailure: error => {
      if (res.headersSent) return res.destroy(error);
      res.statusCode = error.status || 502;
      res.end(error.code || 'REMOTE_DOWNLOAD_FAILED');
    },
    ...options,
  });
}

test('Content-Range parsing and continuation validation reject changed entities', () => {
  assert.deepEqual(parseContentRange('bytes 10-19/100'), { start: 10, end: 19, total: 100 });
  assert.equal(parseContentRange('bytes 20-10/100'), null);
  const initial = sourceResponseMeta(200, { 'content-length': '100', 'accept-ranges': 'bytes', etag: '"v1"' });
  const resumed = sourceResponseMeta(206, { 'content-length': '60', 'content-range': 'bytes 40-99/100', etag: '"v1"' });
  assert.equal(validateContinuation(initial, resumed, 40), true);
  const changed = sourceResponseMeta(206, { 'content-length': '60', 'content-range': 'bytes 40-99/100', etag: '"v2"' });
  assert.throws(() => validateContinuation(initial, changed, 40), error => error.code === 'REMOTE_DOWNLOAD_RETRY_UNSAFE');
});

test('a premature original source response safely resumes at the exact next byte', async t => {
  const payload = Buffer.alloc(512 * 1024);
  for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;
  const cutoff = 123456;
  const sourceRequests = [];
  const source = await listen((req, res) => {
    sourceRequests.push({ range: req.headers.range || '', ifRange: req.headers['if-range'] || '' });
    if (sourceRequests.length === 1) {
      res.writeHead(200, {
        'Content-Type': 'video/x-matroska',
        'Content-Length': String(payload.length),
        'Accept-Ranges': 'bytes',
        'ETag': '"stable-v1"',
      });
      return res.write(payload.subarray(0, cutoff), () => res.socket.destroy());
    }
    const start = Number(/^bytes=(\d+)-/.exec(req.headers.range || '')?.[1]);
    assert.equal(start, cutoff);
    assert.equal(req.headers['if-range'], '"stable-v1"');
    res.writeHead(206, {
      'Content-Type': 'video/x-matroska',
      'Content-Length': String(payload.length - start),
      'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}`,
      'Accept-Ranges': 'bytes',
      'ETag': '"stable-v1"',
    });
    res.end(payload.subarray(start));
  });
  t.after(() => close(source));

  const events = [];
  const proxy = await listen(proxyHandler(url(source), events));
  t.after(() => close(proxy));
  const result = await download(url(proxy));

  assert.equal(result.status, 200);
  assert.equal(Number(result.headers['content-length']), payload.length);
  assert.deepEqual(result.body, payload);
  assert.equal(sourceRequests.length, 2);
  assert.ok(events.some(event => event.event === 'retry' && event.resumeAt === cutoff));
  assert.ok(events.some(event => event.event === 'complete' && event.bytesSent === payload.length));
});

test('partial bytes are never retried when the source identity cannot be validated', async t => {
  const payload = Buffer.alloc(256 * 1024, 7);
  let sourceRequests = 0;
  const source = await listen((req, res) => {
    sourceRequests += 1;
    res.writeHead(200, {
      'Content-Length': String(payload.length),
      'Accept-Ranges': 'bytes',
    });
    res.write(payload.subarray(0, 131072));
    setTimeout(() => res.socket.destroy(), 20);
  });
  t.after(() => close(source));

  const events = [];
  const proxy = await listen(proxyHandler(url(source), events));
  t.after(() => close(proxy));
  const outcome = await download(url(proxy)).catch(error => error);
  assert.ok(outcome instanceof Error && /aborted|premature|socket/i.test(outcome.message), JSON.stringify({
    outcome: outcome instanceof Error ? { message: outcome.message, code: outcome.code } : { status: outcome.status, bytes: outcome.body.length },
    events,
  }));
  assert.equal(sourceRequests, 1);
  assert.ok(events.some(event => event.event === 'terminal_error' && event.errorCode === 'REMOTE_DOWNLOAD_RETRY_UNSAFE'));
});

test('client Range requests preserve status, length, range, and attachment headers', async t => {
  const payload = Buffer.from('abcdefghijklmnopqrstuvwxyz');
  const source = await listen((req, res) => {
    assert.equal(req.headers.range, 'bytes=5-11');
    res.writeHead(206, {
      'Content-Type': 'video/x-matroska',
      'Content-Length': '7',
      'Content-Range': `bytes 5-11/${payload.length}`,
      'Accept-Ranges': 'bytes',
      'ETag': '"range-v1"',
    });
    res.end(payload.subarray(5, 12));
  });
  t.after(() => close(source));

  const events = [];
  const proxy = await listen(proxyHandler(url(source), events));
  t.after(() => close(proxy));
  const result = await download(url(proxy), { Range: 'bytes=5-11' });

  assert.equal(result.status, 206);
  assert.equal(result.headers['content-length'], '7');
  assert.equal(result.headers['content-range'], `bytes 5-11/${payload.length}`);
  assert.equal(result.headers['content-disposition'], 'attachment; filename="fixture.mkv"');
  assert.equal(result.body.toString(), 'fghijkl');
});

test('five simultaneous downloads remain byte-correct through independent retries', async t => {
  const payload = Buffer.alloc(384 * 1024, 23);
  const firstAttempts = new Set();
  const source = await listen((req, res) => {
    const client = req.url.split('/').filter(Boolean).pop() || 'unknown';
    const range = req.headers.range || '';
    if (!range && !firstAttempts.has(client)) {
      firstAttempts.add(client);
      res.writeHead(200, {
        'Content-Length': String(payload.length),
        'Accept-Ranges': 'bytes',
        'ETag': '"five-v1"',
      });
      return res.write(payload.subarray(0, 98304), () => res.socket.destroy());
    }
    const start = Number(/^bytes=(\d+)-/.exec(range)?.[1] || 0);
    res.writeHead(start ? 206 : 200, {
      'Content-Length': String(payload.length - start),
      ...(start ? { 'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}` } : {}),
      'Accept-Ranges': 'bytes',
      'ETag': '"five-v1"',
    });
    res.end(payload.subarray(start));
  });
  t.after(() => close(source));

  let clientNumber = 0;
  const proxy = await listen((req, res) => {
    clientNumber += 1;
    proxyHandler(`${url(source)}/client/${clientNumber}`, [])(req, res);
  });
  t.after(() => close(proxy));

  const results = await Promise.all(Array.from({ length: 5 }, () => download(url(proxy))));
  for (const result of results) assert.deepEqual(result.body, payload);
  assert.equal(firstAttempts.size, 5);
});
