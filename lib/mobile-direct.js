'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const VERSION = '20260819-mobile-direct-v2';
const REVERIFY_MS = Math.max(60_000, Number(process.env.SV_MOBILE_DIRECT_REVERIFY_MS || 7 * 24 * 60 * 60 * 1000));
const CANDIDATE_CAP = Math.max(1000, Number(process.env.SV_MOBILE_DIRECT_CANDIDATE_CAP || 12000));
const CONCURRENCY = Math.max(2, Math.min(16, Number(process.env.SV_MOBILE_DIRECT_CONCURRENCY || 8)));
const MAX_TITLES = Math.max(1000, Number(process.env.SV_MOBILE_DIRECT_MAX_TITLES || 12000));

const safeArray = value => Array.isArray(value) ? value : [];
const isHttpUrl = value => /^https?:\/\//i.test(String(value || '').trim());
const ext = value => (String(value || '').split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const candidateExt = value => ['mp4','m4v','mov','webm'].includes(ext(value));
const audioCodec = track => String(track?.codec || track?.codec_name || '').toLowerCase();
const containerText = value => String(value || '').toLowerCase();

function mobileProfile(info) {
  const container = containerText(info?.container);
  const video = String(info?.videoCodec || '').toLowerCase();
  const tracks = safeArray(info?.audioTracks);
  const primary = tracks.find(track => track?.default) || tracks[0] || null;
  const primaryAudio = audioCodec(primary);
  const allAudio = tracks.map(audioCodec).filter(Boolean);
  const mp4ish = /mp4|mov/.test(container);
  const webm = /webm/.test(container);

  if (mp4ish && video === 'h264' && ['aac','mp3'].includes(primaryAudio)) {
    return { id:'universal-h264', mimeType:'video/mp4', codecHint:'avc1,mp4a.40.2', label:'MP4 / H.264 / mobile audio' };
  }
  if (mp4ish && ['hevc','h265'].includes(video) && ['aac','ac3','eac3','mp3'].includes(primaryAudio)) {
    return { id:'apple-hevc', mimeType:'video/mp4', codecHint:'hvc1,mp4a.40.2', label:'MP4 / HEVC / mobile audio' };
  }
  if (webm && ['vp8','vp9','av1'].includes(video) && ['opus','vorbis'].includes(primaryAudio)) {
    return { id:'webm-modern', mimeType:'video/webm', codecHint:`${video},${primaryAudio}`, label:'WebM / modern mobile codecs' };
  }
  return { id:'', mimeType:'', codecHint:'', label:'', video, primaryAudio, allAudio };
}

function sourceVerdict(info, range) {
  const profile = mobileProfile(info);
  const range206 = Number(range?.statusCode) === 206 && /bytes\s+\d+-\d+\/\d+/i.test(String(range?.contentRange || ''));
  const ok = range206 && !!profile.id;
  return {
    ok,
    range206,
    profile: profile.id,
    profileLabel: profile.label,
    mimeType: profile.mimeType,
    codecHint: profile.codecHint,
    container: containerText(info?.container),
    videoCodec: String(info?.videoCodec || '').toLowerCase(),
    audioCodec: audioCodec(safeArray(info?.audioTracks).find(track => track?.default) || safeArray(info?.audioTracks)[0]),
    audioCodecs: safeArray(info?.audioTracks).map(audioCodec).filter(Boolean),
    audioTrackCount: safeArray(info?.audioTracks).length,
    duration: Number(info?.duration) || 0,
    reason: ok ? `verified-${profile.id}-range206` : (!range206 ? 'no-range-206' : 'unsupported-mobile-codec-profile')
  };
}

function requestRange(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error('too many redirects'));
    let parsed;
    try { parsed = new URL(url); } catch { return reject(new Error('invalid URL')); }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(parsed, { method:'GET', headers:{ Range:'bytes=0-1', 'User-Agent':'StreamVault-Mobile-Direct/2.0', Accept:'*/*' } }, res => {
      const status = Number(res.statusCode) || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        const next = new URL(res.headers.location, parsed).href;
        res.resume();
        return requestRange(next, redirects + 1).then(resolve, reject);
      }
      const result = {
        statusCode: status,
        contentRange: String(res.headers['content-range'] || ''),
        acceptRanges: String(res.headers['accept-ranges'] || ''),
        contentLength: Number(res.headers['content-length']) || 0,
        contentType: String(res.headers['content-type'] || ''),
        finalUrl: parsed.href
      };
      res.destroy();
      resolve(result);
    });
    req.setTimeout(8000, () => req.destroy(new Error('range probe timed out')));
    req.on('error', reject);
    req.end();
  });
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); timer.unref?.(); })
  ]).finally(() => clearTimeout(timer));
}

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive:true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
function cleanTitle(value) { return String(value || '').replace(/\.[a-z0-9]{2,5}$/i,'').replace(/\s+/g,' ').trim(); }
function identity(item) { return [item?.type || '', item?.id || '', cleanTitle(item?.name || item?.title || ''), item?.year || ''].join('|'); }

function migrateLegacyEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  if (entry.profile) return entry;
  const fakeInfo = {
    container: entry.container,
    videoCodec: entry.videoCodec,
    audioTracks: Array.from({ length: Math.max(1, Number(entry.audioTrackCount) || 1) }, (_, i) => ({ codec: entry.audioCodec, default:i === 0 })),
    duration: entry.duration
  };
  const verdict = sourceVerdict(fakeInfo, { statusCode:entry.range206 ? 206 : 0, contentRange:entry.range206 ? 'bytes 0-1/2' : '' });
  if (verdict.ok) return { ...entry, mobileDirect:true, profile:verdict.profile, profileLabel:verdict.profileLabel, mimeType:verdict.mimeType, codecHint:verdict.codecHint, reason:verdict.reason };
  return entry;
}

function installMobileDirect(options = {}) {
  const app = options.app;
  if (!app || typeof app.get !== 'function') throw new Error('installMobileDirect requires Express app');
  if (app.locals?.__svMobileDirectV2) return app.locals.__svMobileDirectV2;
  const getMediaInfo = options.getMediaInfo;
  const getMovies = options.getMovies;
  const getSeries = options.getSeries;
  if (typeof getMediaInfo !== 'function' || typeof getMovies !== 'function' || typeof getSeries !== 'function') throw new Error('missing callbacks');

  const cacheFile = path.join(options.cacheDir || path.join(process.cwd(),'cache'), 'mobile-direct-catalog.json');
  const loaded = readJson(cacheFile, {});
  const sources = {};
  for (const [url, entry] of Object.entries(loaded.sources || {})) sources[url] = migrateLegacyEntry(entry);
  const loadedItems = loaded.version === VERSION && Array.isArray(loaded.items) ? loaded.items : [];
  const state = {
    version: VERSION, startedAt:Date.now(), queue:[], queueBuilt:false, active:0, checked:0, passed:0, failed:0, saveTimer:null,
    cache:{ version:VERSION, updatedAt:loaded.updatedAt || null, sources, items:loadedItems }
  };

  function saveSoon() {
    if (state.saveTimer) return;
    state.saveTimer = setTimeout(() => {
      state.saveTimer = null;
      state.cache.updatedAt = new Date().toISOString();
      try { atomicWrite(cacheFile, state.cache); } catch (error) { console.error('[Mobile Direct] save:', error.message); }
    }, 500);
    state.saveTimer.unref?.();
  }

  function fresh(url) {
    const entry = state.cache.sources[url];
    const when = Date.parse(entry?.checkedAt || entry?.verifiedAt || 0) || 0;
    return entry && Date.now() - when < REVERIFY_MS;
  }

  async function verifySource(url) {
    if (!isHttpUrl(url)) return null;
    if (fresh(url)) return state.cache.sources[url];
    const checkedAt = new Date().toISOString();
    try {
      const [range, info] = await Promise.all([
        withTimeout(requestRange(url), 10_000, 'range probe'),
        withTimeout(getMediaInfo(url), 22_000, 'media probe')
      ]);
      const verdict = sourceVerdict(info, range);
      const entry = { url, mobileDirect:verdict.ok, checkedAt, verifiedAt:verdict.ok ? checkedAt : null,
        range206:verdict.range206, contentLength:Number(range.contentLength)||0, contentType:range.contentType || '',
        container:verdict.container, videoCodec:verdict.videoCodec, audioCodec:verdict.audioCodec, audioCodecs:verdict.audioCodecs,
        audioTrackCount:verdict.audioTrackCount, duration:verdict.duration, profile:verdict.profile, profileLabel:verdict.profileLabel,
        mimeType:verdict.mimeType, codecHint:verdict.codecHint, reason:verdict.reason };
      state.cache.sources[url] = entry;
      state.checked += 1; verdict.ok ? state.passed += 1 : state.failed += 1;
      saveSoon();
      return entry;
    } catch (error) {
      state.cache.sources[url] = { url, mobileDirect:false, checkedAt, verifiedAt:null, range206:false, reason:`probe-error:${error.message}` };
      state.checked += 1; state.failed += 1; saveSoon();
      return state.cache.sources[url];
    }
  }

  function movies() {
    try { return safeArray(getMovies()).filter(item => isHttpUrl(item?.streamUrl) && candidateExt(item.streamUrl)); }
    catch { return []; }
  }
  function series() {
    try { return safeArray(getSeries()).filter(show => Object.values(show?.seasons || {}).flatMap(safeArray).some(ep => isHttpUrl(ep?.streamUrl) && candidateExt(ep.streamUrl))); }
    catch { return []; }
  }

  function cloneSeries(show) {
    const seasons = {};
    let total = 0;
    const profiles = new Set();
    for (const [season, episodes] of Object.entries(show?.seasons || {})) {
      const sourceEpisodes = safeArray(episodes);
      if (!sourceEpisodes.length) continue;
      const verified = [];
      for (const ep of sourceEpisodes) {
        const source = state.cache.sources[String(ep?.streamUrl || '').trim()];
        if (!source?.mobileDirect) return null;
        profiles.add(source.profile);
        verified.push({ ...ep, mobileDirect:true, mobileDirectProfile:source.profile, mobileDirectVerifiedAt:source.verifiedAt });
        total += 1;
      }
      seasons[season] = verified;
    }
    if (!total) return null;
    return { ...show, type:'series', seasons, mobileDirect:true, mobileDirectProfiles:[...profiles], mobileDirectEpisodeCount:total };
  }

  function rebuildItems() {
    const out = [], seen = new Set();
    for (const movie of movies()) {
      const source = state.cache.sources[String(movie.streamUrl || '')];
      if (!source?.mobileDirect) continue;
      const item = { ...movie, type:'movie', mobileDirect:true, mobileDirectProfile:source.profile, mobileDirectProfiles:[source.profile],
        mobileDirectVerifiedAt:source.verifiedAt, mobileDirectProfileLabel:source.profileLabel, mobileDirectDuration:source.duration || 0 };
      const key = identity(item); if (!seen.has(key)) { seen.add(key); out.push(item); }
      if (out.length >= MAX_TITLES) break;
    }
    if (out.length < MAX_TITLES) {
      for (const show of series()) {
        const item = cloneSeries(show); if (!item) continue;
        const key = identity(item); if (!seen.has(key)) { seen.add(key); out.push(item); }
        if (out.length >= MAX_TITLES) break;
      }
    }
    out.sort((a,b) => Number(b.rating||0)-Number(a.rating||0) || String(a.name||a.title||'').localeCompare(String(b.name||b.title||'')));
    state.cache.items = out; saveSoon(); return out;
  }

  function buildQueue() {
    if (state.queueBuilt) return;
    state.queueBuilt = true;
    const seen = new Set(), urls = [];
    const add = url => {
      const value = String(url || '').trim();
      if (!value || seen.has(value) || !isHttpUrl(value) || !candidateExt(value) || fresh(value) || urls.length >= CANDIDATE_CAP) return;
      seen.add(value); urls.push(value);
    };
    for (const movie of movies()) add(movie.streamUrl);
    for (const show of series()) for (const episodes of Object.values(show.seasons || {})) for (const ep of safeArray(episodes)) add(ep.streamUrl);
    state.queue = urls;
    rebuildItems();
    console.log(`[Mobile Direct] v2 candidates=${urls.length} cachedTitles=${state.cache.items.length} workers=${CONCURRENCY}`);
  }

  async function worker() {
    while (true) {
      const url = state.queue.shift();
      if (!url) return;
      state.active += 1;
      try { await verifySource(url); if (state.checked % 12 === 0) rebuildItems(); }
      finally { state.active -= 1; }
    }
  }

  function startWorkers() {
    buildQueue();
    Promise.all(Array.from({ length:CONCURRENCY }, worker))
      .then(() => { rebuildItems(); console.log(`[Mobile Direct] scan complete titles=${state.cache.items.length}`); })
      .catch(error => console.error('[Mobile Direct] worker:', error.message));
  }

  function certified(url) { return state.cache.sources[String(url || '').trim()]?.mobileDirect ? state.cache.sources[String(url || '').trim()] : null; }

  function proxy(req, res) {
    const source = String(req.query.url || '').trim();
    const certificate = certified(source);
    if (!certificate) return res.status(403).json({ error:'Source is not mobile-direct certified' });
    let parsed; try { parsed = new URL(source); } catch { return res.status(400).json({ error:'Invalid source URL' }); }
    const go = (target, redirects = 0) => {
      if (redirects > 4) return res.status(502).end();
      const client = target.protocol === 'https:' ? https : http;
      const headers = { 'User-Agent':req.get('user-agent') || 'StreamVault-Mobile-Direct/2.0', Accept:req.get('accept') || '*/*' };
      if (req.headers.range) headers.Range = req.headers.range;
      if (req.headers['if-range']) headers['If-Range'] = req.headers['if-range'];
      const upstream = client.request(target, { method:req.method === 'HEAD' ? 'HEAD' : 'GET', headers }, upstreamRes => {
        const status = Number(upstreamRes.statusCode) || 502;
        if (status >= 300 && status < 400 && upstreamRes.headers.location) {
          const next = new URL(upstreamRes.headers.location, target); upstreamRes.resume(); return go(next, redirects + 1);
        }
        res.status(status);
        for (const name of ['content-length','content-range','accept-ranges','etag','last-modified','cache-control']) if (upstreamRes.headers[name] !== undefined) res.setHeader(name, upstreamRes.headers[name]);
        res.setHeader('Content-Type', certificate.mimeType || upstreamRes.headers['content-type'] || 'application/octet-stream');
        res.setHeader('Accept-Ranges', upstreamRes.headers['accept-ranges'] || 'bytes');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-StreamVault-Mobile-Direct', '2');
        res.setHeader('X-StreamVault-Mobile-Profile', certificate.profile || '');
        if (req.method === 'HEAD') { upstreamRes.resume(); return res.end(); }
        res.on('close', () => { try { upstream.destroy(); } catch {} });
        upstreamRes.pipe(res);
      });
      upstream.setTimeout(15_000, () => upstream.destroy(new Error('upstream timeout')));
      upstream.on('error', error => { if (!res.headersSent) res.status(502).json({ error:'Mobile direct source failed', detail:error.message }); else res.destroy(error); });
      upstream.end();
    };
    go(parsed);
  }

  app.get('/api/mobile-direct/catalog', (req,res) => {
    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100) || 100));
    const start = (page - 1) * limit;
    res.setHeader('Cache-Control','public, max-age=20, stale-while-revalidate=120');
    res.json({ ok:true, version:VERSION, total:state.cache.items.length, page, pages:Math.max(1,Math.ceil(state.cache.items.length/limit)), limit,
      updatedAt:state.cache.updatedAt, scanning:state.active > 0 || state.queue.length > 0,
      profiles:['universal-h264','apple-hevc','webm-modern'], items:state.cache.items.slice(start,start+limit) });
  });

  app.get('/api/mobile-direct/status', (req,res) => {
    res.setHeader('Cache-Control','no-store');
    const verifiedSources = Object.values(state.cache.sources).filter(row => row?.mobileDirect).length;
    const byProfile = {};
    for (const row of Object.values(state.cache.sources)) if (row?.mobileDirect) byProfile[row.profile || 'unknown'] = (byProfile[row.profile || 'unknown'] || 0) + 1;
    res.json({ ok:true, version:VERSION, cacheFile, verifiedTitles:state.cache.items.length, verifiedSources, checkedSources:Object.keys(state.cache.sources).length,
      queued:state.queue.length, activeWorkers:state.active, concurrency:CONCURRENCY, checkedThisRun:state.checked, passedThisRun:state.passed, failedThisRun:state.failed, byProfile });
  });

  app.get('/api/mobile-direct/proxy', proxy);
  app.head('/api/mobile-direct/proxy', proxy);

  const api = { version:VERSION, state, verifySource, rebuildItems, certified };
  app.locals.__svMobileDirectV1 = api;
  app.locals.__svMobileDirectV2 = api;
  const startupDelayMs = Math.max(10000, Number(process.env.SV_MOBILE_DIRECT_STARTUP_DELAY_MS || 300000) || 300000);
  const timer = setTimeout(startWorkers, startupDelayMs); timer.unref?.();
  console.log(`[Mobile Direct] ${VERSION} installed; cachedTitles=${state.cache.items.length}`);
  return api;
}

module.exports = { installMobileDirect, sourceVerdict, mobileProfile };
