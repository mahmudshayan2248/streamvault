'use strict';

const http = require('http');
const https = require('https');

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function finiteNonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseContentRange(value) {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(String(value || '').trim());
  if (!match) return null;
  const start = finiteNonNegativeInteger(match[1]);
  const end = finiteNonNegativeInteger(match[2]);
  const total = match[3] === '*' ? null : finiteNonNegativeInteger(match[3]);
  if (start === null || end === null || start > end || (total !== null && end >= total)) return null;
  return { start, end, total };
}

function strongValidator(headers = {}) {
  const etag = String(headers.etag || '').trim();
  if (etag && !/^W\//i.test(etag)) return { name: 'etag', value: etag };
  const modified = String(headers['last-modified'] || '').trim();
  return modified ? { name: 'last-modified', value: modified } : null;
}

function sourceResponseMeta(status, headers = {}) {
  const contentRange = parseContentRange(headers['content-range']);
  let contentLength = finiteNonNegativeInteger(headers['content-length']);
  if (status === 206) {
    if (!contentRange || contentRange.total === null) {
      const error = new Error('Partial source response omitted a valid Content-Range');
      error.code = 'REMOTE_DOWNLOAD_INVALID_RANGE';
      throw error;
    }
    const rangeLength = contentRange.end - contentRange.start + 1;
    if (contentLength !== null && contentLength !== rangeLength) {
      const error = new Error('Partial source response Content-Length did not match Content-Range');
      error.code = 'REMOTE_DOWNLOAD_LENGTH_MISMATCH';
      throw error;
    }
    contentLength = rangeLength;
  }
  const encoding = String(headers['content-encoding'] || '').trim().toLowerCase();
  if (encoding && encoding !== 'identity') {
    const error = new Error(`Original media source used unsupported content encoding: ${encoding}`);
    error.code = 'REMOTE_DOWNLOAD_CONTENT_ENCODING';
    throw error;
  }
  const absoluteStart = status === 206 ? contentRange.start : 0;
  const absoluteEnd = status === 206
    ? contentRange.end
    : (contentLength === null || contentLength === 0 ? null : contentLength - 1);
  const entityTotal = status === 206 ? contentRange.total : contentLength;
  return {
    status,
    contentLength,
    contentRange,
    absoluteStart,
    absoluteEnd,
    entityTotal,
    validator: strongValidator(headers),
    etag: String(headers.etag || '').trim(),
    lastModified: String(headers['last-modified'] || '').trim(),
    acceptRanges: String(headers['accept-ranges'] || '').trim().toLowerCase() === 'bytes' || status === 206,
  };
}

function validateContinuation(initial, current, bytesSent) {
  if (!initial) throw Object.assign(new Error('Initial response metadata is missing'), { code: 'REMOTE_DOWNLOAD_RETRY_UNSAFE' });
  const expectedStart = initial.absoluteStart + bytesSent;
  if (bytesSent > 0) {
    if (!initial.validator || !initial.acceptRanges || initial.absoluteEnd === null || initial.entityTotal === null) {
      throw Object.assign(new Error('Source cannot be safely resumed after partial bytes'), { code: 'REMOTE_DOWNLOAD_RETRY_UNSAFE' });
    }
    if (current.status !== 206 || !current.contentRange || current.contentRange.start !== expectedStart ||
        current.contentRange.end !== initial.absoluteEnd || current.contentRange.total !== initial.entityTotal) {
      throw Object.assign(new Error('Source resumed at a different byte range'), { code: 'REMOTE_DOWNLOAD_RETRY_UNSAFE' });
    }
  } else if (current.status !== initial.status || current.contentLength !== initial.contentLength ||
             current.absoluteStart !== initial.absoluteStart || current.absoluteEnd !== initial.absoluteEnd ||
             current.entityTotal !== initial.entityTotal) {
    throw Object.assign(new Error('Source response changed before retry data was sent'), { code: 'REMOTE_DOWNLOAD_RETRY_UNSAFE' });
  }

  if (initial.etag && current.etag !== initial.etag) {
    throw Object.assign(new Error('Source ETag changed while resuming'), { code: 'REMOTE_DOWNLOAD_RETRY_UNSAFE' });
  }
  if (!initial.etag && initial.lastModified && current.lastModified !== initial.lastModified) {
    throw Object.assign(new Error('Source Last-Modified changed while resuming'), { code: 'REMOTE_DOWNLOAD_RETRY_UNSAFE' });
  }
  return true;
}

function proxyError(status, code, message, cause, details = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.cause = cause;
  Object.assign(error, details);
  return error;
}

function writeChunk(res, chunk) {
  return new Promise((resolve, reject) => {
    if (res.destroyed || res.writableEnded) return reject(Object.assign(new Error('Download client disconnected'), { code: 'CLIENT_DISCONNECTED' }));
    res.write(chunk, error => error ? reject(error) : resolve());
  });
}

function defaultValidateUrl(value) {
  const parsed = value instanceof URL ? value : new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported source protocol');
  return parsed;
}

function streamOriginalDownload(options) {
  const {
    req,
    res,
    sourceUrl,
    filename,
    contentType = () => 'application/octet-stream',
    contentDisposition,
    validateUrl = defaultValidateUrl,
    maxRedirects = 5,
    maxRetries = 3,
    connectTimeoutMs = 20000,
    sourceIdleTimeoutMs = 45000,
    retryBaseDelayMs = 250,
    knownCatalogUrl = true,
    onEvent = () => {},
    onFailure = error => {
      if (!res.headersSent) res.statusCode = error.status || 502;
      res.destroy(error);
    },
  } = options || {};

  if (!req || !res) throw new TypeError('req and res are required');

  const state = {
    activeRequest: null,
    activeResponse: null,
    attempt: 0,
    retries: 0,
    bytesRead: 0,
    bytesSent: 0,
    expectedBytes: null,
    initialMeta: null,
    finalUrl: String(sourceUrl || ''),
    finalUrlKnown: !!knownCatalogUrl,
    responseStarted: false,
    clientGone: false,
    completed: false,
    terminal: false,
    startedAt: Date.now(),
    socketBytesAtStart: Number(res.socket?.bytesWritten || 0),
  };

  const emit = (event, details = {}) => onEvent(event, {
    attempt: state.attempt,
    retries: state.retries,
    bytesRead: state.bytesRead,
    bytesSent: state.bytesSent,
    expectedBytes: state.expectedBytes,
    elapsedMs: Date.now() - state.startedAt,
    ...details,
  });

  const cleanupActive = () => {
    const sourceResponse = state.activeResponse;
    const sourceRequest = state.activeRequest;
    state.activeResponse = null;
    state.activeRequest = null;
    try { sourceResponse?.destroy(); } catch {}
    try { sourceRequest?.destroy(); } catch {}
  };

  const failTerminal = error => {
    if (state.terminal || state.completed || state.clientGone) return;
    state.terminal = true;
    cleanupActive();
    emit('terminal_error', {
      errorCode: error?.code || 'REMOTE_DOWNLOAD_FAILED',
      errorMessage: error?.message || String(error),
      upstreamStatus: error?.upstreamStatus || null,
      socketBytesWritten: Math.max(0, Number(res.socket?.bytesWritten || 0) - state.socketBytesAtStart),
    });
    onFailure(error, { ...state });
  };

  const complete = () => {
    if (state.terminal || state.completed || state.clientGone) return;
    if (state.expectedBytes !== null && state.bytesSent !== state.expectedBytes) {
      return failTerminal(proxyError(502, 'REMOTE_DOWNLOAD_LENGTH_MISMATCH', 'Remote media source ended at the wrong byte count'));
    }
    state.completed = true;
    cleanupActive();
    res.end();
  };

  const retry = (error, startRequest) => {
    if (state.clientGone || state.completed || state.terminal) return;
    if (state.expectedBytes !== null && state.bytesSent === state.expectedBytes) return complete();
    const canRetryBeforeData = state.bytesSent === 0;
    const canResume = state.bytesSent > 0 && state.initialMeta?.validator && state.initialMeta.acceptRanges &&
      state.initialMeta.absoluteEnd !== null && state.initialMeta.entityTotal !== null;
    if ((!canRetryBeforeData && !canResume) || state.retries >= maxRetries) {
      const code = !canRetryBeforeData && !canResume ? 'REMOTE_DOWNLOAD_RETRY_UNSAFE' : (error?.code || 'REMOTE_DOWNLOAD_RETRY_EXHAUSTED');
      const message = !canRetryBeforeData && !canResume
        ? 'Remote source failed after partial bytes and cannot be safely resumed'
        : 'Remote media source failed after bounded retries';
      return failTerminal(proxyError(error?.code === 'ETIMEDOUT' ? 504 : 502, code, message, error));
    }
    state.retries += 1;
    const delayMs = Math.min(2000, retryBaseDelayMs * (2 ** (state.retries - 1)));
    emit('retry', {
      reason: error?.message || String(error),
      errorCode: error?.code || 'REMOTE_DOWNLOAD_FAILED',
      delayMs,
      resumeAt: state.initialMeta ? state.initialMeta.absoluteStart + state.bytesSent : null,
      validator: state.initialMeta?.validator?.name || null,
    });
    cleanupActive();
    const timer = setTimeout(startRequest, delayMs);
    timer.unref?.();
  };

  const baseHeaders = {
    'User-Agent': req.headers['user-agent'] || 'StreamVault/1.0',
    'Accept': '*/*',
    'Accept-Encoding': 'identity',
  };
  if (req.headers.range) baseHeaders.Range = req.headers.range;

  const requestSource = (value = state.finalUrl, redirectsLeft = maxRedirects, knownCatalogUrl = state.finalUrlKnown, continuation = state.responseStarted) => {
    if (state.clientGone || state.completed || state.terminal) return;
    let parsed;
    try { parsed = validateUrl(value, knownCatalogUrl); }
    catch (error) { return failTerminal(error); }

    state.attempt += 1;
    const attempt = state.attempt;
    const requestHeaders = { ...baseHeaders };
    if (continuation && state.bytesSent > 0) {
      const meta = state.initialMeta;
      if (!meta?.validator || meta.absoluteEnd === null) {
        return failTerminal(proxyError(502, 'REMOTE_DOWNLOAD_RETRY_UNSAFE', 'Remote source cannot be safely resumed'));
      }
      requestHeaders.Range = `bytes=${meta.absoluteStart + state.bytesSent}-${meta.absoluteEnd}`;
      requestHeaders['If-Range'] = meta.validator.value;
    }
    emit('source_request', {
      sourceHost: parsed.host,
      range: requestHeaders.Range || '',
      continuation,
    });

    const transport = parsed.protocol === 'https:' ? https : http;
    let receivedResponse = false;
    const sourceRequest = transport.request(parsed, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: requestHeaders,
    }, sourceResponse => {
      receivedResponse = true;
      if (state.clientGone || state.completed || state.terminal || attempt !== state.attempt) {
        sourceResponse.destroy();
        return;
      }
      state.activeResponse = sourceResponse;
      sourceRequest.setTimeout(0);
      sourceResponse.setTimeout(sourceIdleTimeoutMs, () => {
        sourceResponse.destroy(Object.assign(new Error('Remote source body stalled'), { code: 'ETIMEDOUT' }));
      });
      const status = sourceResponse.statusCode || 502;
      const location = sourceResponse.headers.location;

      if (REDIRECT_STATUSES.has(status) && location) {
        sourceResponse.resume();
        if (redirectsLeft <= 0) return failTerminal(proxyError(502, 'REMOTE_REDIRECT_LIMIT', 'Remote source redirected too many times'));
        let next;
        try { next = new URL(location, parsed).href; }
        catch (error) { return failTerminal(proxyError(502, 'REMOTE_REDIRECT_INVALID', 'Remote source returned an invalid redirect', error)); }
        state.finalUrl = next;
        state.finalUrlKnown = false;
        return requestSource(next, redirectsLeft - 1, false, continuation);
      }

      if (RETRYABLE_STATUSES.has(status)) {
        sourceResponse.resume();
        const error = proxyError(status === 408 || status === 504 ? 504 : 502,
          status === 408 || status === 504 ? 'REMOTE_DOWNLOAD_TIMEOUT' : 'REMOTE_DOWNLOAD_FAILED',
          `Remote source returned HTTP ${status}`, null, { upstreamStatus: status });
        return retry(error, () => requestSource(state.finalUrl, maxRedirects, state.finalUrlKnown, state.responseStarted));
      }

      if (status === 416) {
        sourceResponse.resume();
        if (state.responseStarted) return failTerminal(proxyError(502, 'REMOTE_DOWNLOAD_RETRY_UNSAFE', 'Remote source rejected a continuation range', null, { upstreamStatus: status }));
        state.terminal = true;
        const headers = {
          'Content-Length': '0',
          'Accept-Ranges': 'bytes',
          'Content-Disposition': contentDisposition,
          'Content-Type': contentType(sourceResponse.headers['content-type']),
          'Cache-Control': 'private, no-store',
        };
        if (sourceResponse.headers['content-range']) headers['Content-Range'] = sourceResponse.headers['content-range'];
        res.writeHead(416, headers);
        return res.end();
      }

      if (status !== 200 && status !== 206) {
        sourceResponse.resume();
        return failTerminal(proxyError(502, 'REMOTE_DOWNLOAD_FAILED', `Remote source returned HTTP ${status}`, null, { upstreamStatus: status }));
      }

      let meta;
      try { meta = sourceResponseMeta(status, sourceResponse.headers); }
      catch (error) {
        sourceResponse.resume();
        return failTerminal(proxyError(502, error.code || 'REMOTE_DOWNLOAD_FAILED', error.message, error, { upstreamStatus: status }));
      }

      if (continuation) {
        try { validateContinuation(state.initialMeta, meta, state.bytesSent); }
        catch (error) {
          sourceResponse.resume();
          return failTerminal(proxyError(502, error.code || 'REMOTE_DOWNLOAD_RETRY_UNSAFE', error.message, error, { upstreamStatus: status }));
        }
      } else {
        state.initialMeta = meta;
        state.expectedBytes = meta.contentLength;
        const responseHeaders = {
          'Content-Type': contentType(sourceResponse.headers['content-type']),
          'Content-Disposition': contentDisposition,
          'Cache-Control': 'private, no-store',
        };
        if (meta.contentLength !== null) responseHeaders['Content-Length'] = String(meta.contentLength);
        if (sourceResponse.headers['content-range']) responseHeaders['Content-Range'] = sourceResponse.headers['content-range'];
        if (sourceResponse.headers['last-modified']) responseHeaders['Last-Modified'] = sourceResponse.headers['last-modified'];
        if (sourceResponse.headers.etag) responseHeaders.ETag = sourceResponse.headers.etag;
        if (meta.acceptRanges) responseHeaders['Accept-Ranges'] = 'bytes';
        state.responseStarted = true;
        res.writeHead(status, responseHeaders);
        emit('response_headers', {
          upstreamStatus: status,
          contentLength: meta.contentLength,
          contentRange: sourceResponse.headers['content-range'] || '',
          entityTotal: meta.entityTotal,
          acceptRanges: meta.acceptRanges,
          validator: meta.validator?.name || null,
        });
        if (req.method === 'HEAD') {
          sourceResponse.resume();
          state.completed = true;
          return res.end();
        }
      }

      (async () => {
        try {
          for await (const chunk of sourceResponse) {
            if (attempt !== state.attempt || state.clientGone || state.terminal) return;
            state.bytesRead += chunk.length;
            await writeChunk(res, chunk);
            state.bytesSent += chunk.length;
            if (state.expectedBytes !== null && state.bytesSent > state.expectedBytes) {
              throw Object.assign(new Error('Remote source sent more bytes than advertised'), { code: 'REMOTE_DOWNLOAD_LENGTH_MISMATCH' });
            }
          }
          if (attempt !== state.attempt || state.clientGone || state.terminal) return;
          if (state.expectedBytes === null || state.bytesSent === state.expectedBytes) return complete();
          retry(Object.assign(new Error('Remote source ended before Content-Length was satisfied'), { code: 'REMOTE_DOWNLOAD_PREMATURE_CLOSE' }),
            () => requestSource(state.finalUrl, maxRedirects, state.finalUrlKnown, true));
        } catch (error) {
          if (attempt !== state.attempt || state.clientGone || state.terminal) return;
          if (error?.code === 'CLIENT_DISCONNECTED' || res.destroyed) return;
          emit('source_error', { errorCode: error?.code || 'REMOTE_DOWNLOAD_FAILED', errorMessage: error?.message || String(error) });
          retry(error, () => requestSource(state.finalUrl, maxRedirects, state.finalUrlKnown, true));
        }
      })();
    });

    state.activeRequest = sourceRequest;
    sourceRequest.setTimeout(connectTimeoutMs, () => {
      sourceRequest.destroy(Object.assign(new Error(receivedResponse ? 'Remote source stalled' : 'Remote source connection timed out'), { code: 'ETIMEDOUT' }));
    });
    sourceRequest.on('socket', socket => {
      try { socket.setKeepAlive(true, 30000); socket.setNoDelay(true); } catch {}
    });
    sourceRequest.once('error', error => {
      if (attempt !== state.attempt || state.clientGone || state.completed || state.terminal) return;
      if (receivedResponse) return;
      emit('source_connection_error', { errorCode: error?.code || 'REMOTE_DOWNLOAD_FAILED', errorMessage: error?.message || String(error) });
      retry(error, () => requestSource(state.finalUrl, maxRedirects, state.finalUrlKnown, state.responseStarted));
    });
    sourceRequest.end();
  };

  res.once('finish', () => {
    if (state.terminal) return cleanupActive();
    if (!state.completed) state.completed = true;
    emit('complete', {
      socketBytesWritten: Math.max(0, Number(res.socket?.bytesWritten || 0) - state.socketBytesAtStart),
    });
    cleanupActive();
  });
  res.once('close', () => {
    if (state.completed || state.terminal) return;
    state.clientGone = true;
    emit('client_abort', {
      requestAborted: !!req.aborted,
      responseDestroyed: !!res.destroyed,
      socketDestroyed: !!res.socket?.destroyed,
      socketBytesWritten: Math.max(0, Number(res.socket?.bytesWritten || 0) - state.socketBytesAtStart),
    });
    cleanupActive();
  });
  res.once('error', error => emit('response_error', { errorCode: error?.code || 'RESPONSE_STREAM_ERROR', errorMessage: error?.message || String(error) }));
  req.once('aborted', () => emit('request_aborted', { requestAborted: true }));
  try { req.socket?.setKeepAlive?.(true, 30000); req.socket?.setNoDelay?.(true); res.socket?.setKeepAlive?.(true, 30000); res.socket?.setNoDelay?.(true); } catch {}

  requestSource();
  return state;
}

module.exports = {
  parseContentRange,
  sourceResponseMeta,
  streamOriginalDownload,
  validateContinuation,
};
