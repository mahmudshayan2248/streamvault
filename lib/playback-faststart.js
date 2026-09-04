'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const CACHE_VERSION = 3;
const LEGACY_CACHE_VERSIONS = [2, 1];

function cacheKeyForVersion(source, version) {
  return crypto.createHash('sha256')
    .update(`${version}|${source?.canonicalId || ''}|${source?.fingerprint || ''}`)
    .digest('hex')
    .slice(0, 32);
}

function cacheKey(source) {
  return cacheKeyForVersion(source, CACHE_VERSION);
}

function isLoopback(req) {
  const address = String(req?.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  return address === '127.0.0.1' || address === '::1';
}

function isMp4Source(source) {
  if (!source?.remote) return false;
  try {
    return /\.(?:mp4|m4v)$/i.test(new URL(source.input).pathname);
  } catch {
    return false;
  }
}

function installPlaybackFaststart(options = {}) {
  const {
    app,
    cacheDir,
    ffmpegBin = 'ffmpeg',
    resolveSource,
    busySnapshot = () => ({ busy: false }),
  } = options;
  if (!app || !cacheDir || typeof resolveSource !== 'function') {
    throw new Error('Playback fast-start installer is missing required dependencies');
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  const jobs = new Map();

  function pathsFor(source, version = CACHE_VERSION) {
    const key = cacheKeyForVersion(source, version);
    return {
      key,
      media: path.join(cacheDir, `${key}.mp4`),
      partial: path.join(cacheDir, `${key}.partial.mp4`),
      metadata: path.join(cacheDir, `${key}.json`),
      metadataPartial: path.join(cacheDir, `${key}.json.partial`),
    };
  }

  function cachedSourceForVersion(source, version) {
    if (!isMp4Source(source)) return null;
    const paths = pathsFor(source, version);
    try {
      const metadata = JSON.parse(fs.readFileSync(paths.metadata, 'utf8'));
      const stat = fs.statSync(paths.media);
      if (metadata.version !== version || metadata.cacheKey !== paths.key ||
          metadata.canonicalId !== source.canonicalId || metadata.sourceFingerprint !== source.fingerprint ||
          !Number.isSafeInteger(metadata.outputBytes) || metadata.outputBytes !== stat.size || stat.size <= 0) {
        return null;
      }
      return {
        ...source,
        input: paths.media,
        remote: false,
        filename: `${path.parse(source.filename || source.canonicalId || 'media').name}.faststart.mp4`,
        sourceKind: version === CACHE_VERSION
          ? 'keyframe-fragmented-faststart-copy'
          : (version === 2 ? 'fragmented-faststart-copy' : 'faststart-copy'),
        faststart: {
          cacheKey: paths.key,
          outputBytes: stat.size,
          completedAt: metadata.completedAt,
          version,
        },
      };
    } catch {
      return null;
    }
  }

  function currentCachedSource(source) {
    return cachedSourceForVersion(source, CACHE_VERSION);
  }

  // Keep the newest valid prior artifact available while the current artifact
  // is built. This prevents an upgrade from falling back to the remote source.
  function legacyCachedSource(source) {
    for (const version of LEGACY_CACHE_VERSIONS) {
      const cached = cachedSourceForVersion(source, version);
      if (cached) return cached;
    }
    return null;
  }

  function nonFragmentedCachedSource(source) {
    return cachedSourceForVersion(source, 1);
  }

  function cachedSource(source) {
    return currentCachedSource(source) || legacyCachedSource(source);
  }

  function publicJob(job, source) {
    const cached = source ? currentCachedSource(source) : null;
    return {
      canonicalId: source?.canonicalId || job?.canonicalId || '',
      sourceFingerprint: source?.fingerprint || job?.sourceFingerprint || '',
      state: cached ? 'complete' : (job?.state || 'missing'),
      startedAt: job?.startedAt || null,
      completedAt: cached?.faststart?.completedAt || job?.completedAt || null,
      outputBytes: cached?.faststart?.outputBytes || job?.outputBytes || null,
      error: job?.error || '',
      strategy: 'keyframe-fragmented-stream-copy-faststart',
      transcoded: false,
    };
  }

  function start(source) {
    const paths = pathsFor(source);
    const existing = jobs.get(paths.key);
    if (existing?.state === 'running') return existing;
    const current = currentCachedSource(source);
    if (current) return { state: 'complete', ...current.faststart };
    const buildSource = nonFragmentedCachedSource(source) || legacyCachedSource(source) || source;

    try { fs.rmSync(paths.partial, { force: true }); } catch {}
    try { fs.rmSync(paths.metadataPartial, { force: true }); } catch {}

    const inputArgs = buildSource.remote ? [
      '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_on_network_error', '1',
      '-reconnect_on_http_error', '4xx,5xx', '-reconnect_delay_max', '5',
    ] : [];
    const args = [
      '-hide_banner', '-loglevel', 'warning', '-nostdin', '-y',
      ...inputArgs, '-i', buildSource.input,
      '-map', '0', '-map_metadata', '0', '-map_chapters', '0',
      '-c', 'copy',
      '-movflags', '+frag_keyframe+empty_moov+default_base_moof+global_sidx',
      '-min_frag_duration', '2000000',
      paths.partial,
    ];
    const job = {
      cacheKey: paths.key,
      canonicalId: source.canonicalId,
      sourceFingerprint: source.fingerprint,
      state: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      outputBytes: null,
      error: '',
      process: null,
    };
    jobs.set(paths.key, job);
    const child = spawn(ffmpegBin, args, { windowsHide: true });
    job.process = child;
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk.toString()).slice(-12000);
    });
    child.once('error', error => {
      job.state = 'failed';
      job.error = error.message;
      job.process = null;
      console.error(`[Playback Faststart] canonicalId=${source.canonicalId} spawn failed: ${error.message}`);
    });
    child.once('close', code => {
      job.process = null;
      if (code !== 0) {
        job.state = 'failed';
        job.error = (stderr.trim() || `ffmpeg exited with code ${code}`).slice(-2000);
        try { fs.rmSync(paths.partial, { force: true }); } catch {}
        console.error(`[Playback Faststart] canonicalId=${source.canonicalId} failed code=${code}: ${job.error}`);
        return;
      }
      try {
        const stat = fs.statSync(paths.partial);
        if (!stat.isFile() || stat.size <= 0) throw new Error('Fast-start output was empty');
        if (fs.existsSync(paths.media)) fs.rmSync(paths.media, { force: true });
        fs.renameSync(paths.partial, paths.media);
        const metadata = {
          version: CACHE_VERSION,
          cacheKey: paths.key,
          canonicalId: source.canonicalId,
          sourceFingerprint: source.fingerprint,
          outputBytes: stat.size,
          completedAt: new Date().toISOString(),
          strategy: 'keyframe-fragmented-stream-copy-faststart',
          transcoded: false,
        };
        fs.writeFileSync(paths.metadataPartial, JSON.stringify(metadata, null, 2));
        if (fs.existsSync(paths.metadata)) fs.rmSync(paths.metadata, { force: true });
        fs.renameSync(paths.metadataPartial, paths.metadata);
        job.state = 'complete';
        job.completedAt = metadata.completedAt;
        job.outputBytes = stat.size;
        console.log(`[Playback Faststart] canonicalId=${source.canonicalId} complete bytes=${stat.size} cacheKey=${paths.key}`);
      } catch (error) {
        job.state = 'failed';
        job.error = error.message;
        console.error(`[Playback Faststart] canonicalId=${source.canonicalId} finalize failed: ${error.message}`);
      }
    });
    console.log(`[Playback Faststart] canonicalId=${source.canonicalId} started cacheKey=${paths.key} mode=stream-copy`);
    return job;
  }

  app.get('/api/playback-faststart/:id/status', (req, res) => {
    if (!isLoopback(req)) return res.status(404).end();
    const source = resolveSource(req.params.id, req.query || {});
    if (!source) return res.status(404).json({ error: 'source_missing' });
    const key = cacheKey(source);
    res.setHeader('Cache-Control', 'no-store');
    return res.json(publicJob(jobs.get(key), source));
  });

  app.post('/api/playback-faststart/:id/prepare', (req, res) => {
    if (!isLoopback(req)) return res.status(404).end();
    const source = resolveSource(req.params.id, req.query || {});
    if (!source) return res.status(404).json({ error: 'source_missing' });
    if (!isMp4Source(source)) return res.status(409).json({ error: 'faststart_requires_remote_mp4' });
    const cached = currentCachedSource(source);
    if (cached) return res.json(publicJob(null, source));
    const capacity = busySnapshot();
    if (capacity?.busy) return res.status(409).json({ error: 'backend_busy', capacity });
    const job = start(source);
    return res.status(job.state === 'complete' ? 200 : 202).json(publicJob(job, source));
  });

  function stopWorkers() {
    for (const job of jobs.values()) {
      if (job.state !== 'running' || !job.process) continue;
      try { job.process.kill('SIGKILL'); } catch {}
    }
  }
  process.once('SIGINT', stopWorkers);
  process.once('SIGTERM', stopWorkers);

  return {
    cachedSource,
    activeJobs: () => [...jobs.values()].filter(job => job.state === 'running').length,
    jobs,
    stopWorkers,
  };
}

module.exports = {
  CACHE_VERSION,
  cacheKey,
  installPlaybackFaststart,
  isMp4Source,
};
