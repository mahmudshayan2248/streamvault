const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { readSnapshotModule } = require('./capture-home-snapshot');

const ROOT = __dirname;
const HOME_SNAPSHOT_FILE = 'home-snapshot-76d0639-20260717.js';
const snapshotSource = fs.readFileSync(path.join(ROOT, HOME_SNAPSHOT_FILE), 'utf8');
const runtimeSource = fs.readFileSync(path.join(ROOT, 'runtime-config.js'), 'utf8');
const offlineSource = fs.readFileSync(path.join(ROOT, 'offline-ui.js'), 'utf8');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw-20260722-v6.js'), 'utf8');
const fallbackSw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const homeSnapshot = readSnapshotModule(path.join(ROOT, HOME_SNAPSHOT_FILE));
const channels = JSON.parse(fs.readFileSync(path.join(ROOT, 'channels.json'), 'utf8'));

const fetchCalls = [];
const listeners = new Map();
const clickListeners = [];
const toastMessages = [];
let playbackCalls = 0;
let liveCalls = 0;
let healthOnline = true;
let nextBackendFailure = null;
let nextBackendStatus = null;

function payloadFor(url) {
  const pathname = new URL(String(url), 'https://streamvault.fit').pathname;
  if (pathname === '/channels.json') return channels;
  if (pathname === '/api/version') {
    return {
      ok: true,
      reachable: true,
      listening: true,
      fileIndexLoaded: true,
      playbackReady: true,
      liveReady: true,
      catalogReady: false,
      searchReady: false,
      version: 'boundary-test',
      commit: homeSnapshot.source.backendCommit
    };
  }
  return {};
}

async function fakeFetch(input) {
  const url = typeof input === 'string' ? input : input.url;
  fetchCalls.push(String(url));
  const parsed = new URL(String(url), 'https://streamvault.fit');
  const backendRequest = parsed.origin === 'https://backend.streamvault.fit';
  if (parsed.pathname === '/api/version' && !healthOnline) {
    throw new TypeError('backend network unavailable');
  }
  if (backendRequest && nextBackendFailure) {
    const error = nextBackendFailure;
    nextBackendFailure = null;
    throw error;
  }
  const status = backendRequest && nextBackendStatus ? nextBackendStatus : 200;
  nextBackendStatus = null;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payloadFor(url)
  };
}

function addListener(type, handler) {
  const handlers = listeners.get(type) || [];
  handlers.push(handler);
  listeners.set(type, handlers);
}

const document = {
  documentElement: { dataset: {} },
  hidden: false,
  addEventListener(type, handler, capture) {
    if (type === 'click') clickListeners.push({ handler, capture });
    else addListener(type, handler);
  }
};

function XMLHttpRequest() {}
XMLHttpRequest.prototype.open = function open(_method, url) {
  this.openedUrl = url;
};

class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

const window = {
  location: new URL('https://streamvault.fit/'),
  fetch: fakeFetch,
  XMLHttpRequest,
  setTimeout,
  clearTimeout,
  addEventListener: addListener,
  dispatchEvent(event) {
    for (const handler of listeners.get(event.type) || []) handler(event);
  },
  showToast(message) { toastMessages.push(message); },
  playMedia() { playbackCalls += 1; },
  playFtpMedia() { playbackCalls += 1; },
  playSeriesEpisode() { playbackCalls += 1; },
  playMovieFromDetail() { playbackCalls += 1; },
  playMediaModalPrimary() { playbackCalls += 1; },
  openLiveChannel() { liveCalls += 1; },
  openLiveMatchChannel() { liveCalls += 1; }
};

function createMemoryIndexedDB() {
  const stores = new Map();
  return {
    open() {
      const request = {};
      queueMicrotask(() => {
        const db = {
          objectStoreNames: { contains: name => stores.has(name) },
          createObjectStore(name) { if (!stores.has(name)) stores.set(name, new Map()); },
          transaction(name) {
            return {
              objectStore() {
                const store = stores.get(name);
                return {
                  get(key) {
                    const operation = {};
                    queueMicrotask(() => { operation.result = store.get(key); operation.onsuccess?.(); });
                    return operation;
                  },
                  put(value, key) {
                    const operation = {};
                    queueMicrotask(() => { store.set(key, value); operation.onsuccess?.(); });
                    return operation;
                  }
                };
              }
            };
          },
          close() {}
        };
        request.result = db;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
}

window.indexedDB = createMemoryIndexedDB();

const context = {
  window,
  document,
  navigator: {},
  URL,
  Request,
  AbortController,
  DOMException,
  CustomEvent,
  console,
  setTimeout,
  clearTimeout
};

vm.runInNewContext(snapshotSource, context, { filename: HOME_SNAPSHOT_FILE });
vm.runInNewContext(runtimeSource, context, { filename: 'runtime-config.js' });

(async () => {
  await Promise.all([
    window.STREAMVAULT_CONFIG.staticData.homeSnapshot,
    window.STREAMVAULT_CONFIG.staticData.channels,
    window.__svBackendCheckPromise
  ]);

  assert.strictEqual(
    window.STREAMVAULT_CONFIG.backendUrl('/api/movies?page=1'),
    'https://backend.streamvault.fit/api/movies?page=1'
  );
  assert.strictEqual(
    window.STREAMVAULT_CONFIG.backendUrl('/download/example'),
    'https://backend.streamvault.fit/download/example'
  );
  assert.strictEqual(
    window.STREAMVAULT_CONFIG.backendUrl('/styles.css'),
    '/styles.css'
  );
  assert.strictEqual(
    window.STREAMVAULT_CONFIG.backendUrl('https://media.example/movie.m3u8'),
    'https://media.example/movie.m3u8'
  );

  const plan = window.STREAMVAULT_CONFIG.normalizeBackendUrls({
    src: '/stream/movie-1',
    playUrl: '/api/playback/local/movie-1/stream',
    finalPlayUrl: '/proxy/movie-1',
    streamUrl: '/playback/movie-1',
    remuxUrl: '/api/playback/local/movie-1/stream?mode=remux',
    audioTranscodeUrl: '/audio/movie-1',
    hlsUrl: '/hls/movie-1/index.m3u8',
    subtitles: [
      { src: '/subtitles/movie-1/0' },
      { url: '/subtitle/movie-1/en.vtt' }
    ],
    poster: '/assets/posters/movie-1.webp',
    json: '/catalog.json',
    stylesheet: '/styles.css',
    script: '/app-v3.js',
    absolute: 'https://media.example/movie-1.m3u8',
    absoluteFrontend: 'https://streamvault.fit/api/playback/local/movie-1'
  });
  for (const field of ['src', 'playUrl', 'finalPlayUrl', 'streamUrl', 'remuxUrl', 'audioTranscodeUrl', 'hlsUrl']) {
    assert(plan[field].startsWith('https://backend.streamvault.fit/'), `${field} was not normalized`);
  }
  assert(plan.subtitles.every(track => Object.values(track)[0].startsWith('https://backend.streamvault.fit/')));
  assert.strictEqual(plan.poster, '/assets/posters/movie-1.webp');
  assert.strictEqual(plan.json, '/catalog.json');
  assert.strictEqual(plan.stylesheet, '/styles.css');
  assert.strictEqual(plan.script, '/app-v3.js');
  assert.strictEqual(plan.absolute, 'https://media.example/movie-1.m3u8');
  assert.strictEqual(plan.absoluteFrontend, 'https://streamvault.fit/api/playback/local/movie-1');

  const transitions = window.STREAMVAULT_CONFIG.normalizeBackendUrls([
    { kind: 'live', src: '/live-relay/channel-1/playlist.m3u8' },
    { kind: 'movie', src: '/stream/movie-1' },
    { kind: 'series', src: '/api/playback/local/episode-1/stream' },
    { kind: 'live', src: '/live/channel-1/playlist.m3u8' }
  ]);
  assert(transitions.every(item => item.src.startsWith('https://backend.streamvault.fit/')));

  await window.fetch('/api/movies?page=0');
  assert(fetchCalls.includes('https://backend.streamvault.fit/api/movies?page=0'));
  assert(!fetchCalls.some(url => /home-feed/i.test(url)));

  const xhr = new window.XMLHttpRequest();
  xhr.open('GET', '/api/channels');
  assert.strictEqual(xhr.openedUrl, 'https://backend.streamvault.fit/api/channels');

  vm.runInNewContext(offlineSource, context, { filename: 'offline-ui.js' });

  window.openLiveChannel('channel-1');
  window.playMedia('movie-id');
  window.playSeriesEpisode('series-id', 1, 0);
  window.openLiveChannel('channel-1');
  assert.strictEqual(playbackCalls, 2, 'Live TV -> movie -> series -> Live TV was blocked');
  assert.strictEqual(liveCalls, 2, 'Live TV transition sequence did not complete');

  window.playMedia('movie-id-2');
  window.openLiveChannel('channel-2');
  assert.strictEqual(playbackCalls, 3, 'Movie -> Live TV movie action did not run');
  assert.strictEqual(liveCalls, 3, 'Movie -> Live TV live action did not run');

  nextBackendFailure = new TypeError('single media request failed');
  await assert.rejects(window.fetch('/stream/missing-media'), /single media request failed/);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.strictEqual(window.STREAMVAULT_CONFIG.backendStatus.available, false);
  window.openLiveChannel('channel-after-media-error');
  assert.strictEqual(liveCalls, 4, 'a media request failure latched Live TV offline');

  await window.STREAMVAULT_CONFIG.checkBackendAvailability();
  assert.strictEqual(window.STREAMVAULT_CONFIG.backendStatus.available, true);

  const abortError = new Error('playback superseded');
  abortError.name = 'AbortError';
  nextBackendFailure = abortError;
  await assert.rejects(window.fetch('/api/playback/local/aborted'), error => error.name === 'AbortError');
  assert.strictEqual(window.STREAMVAULT_CONFIG.backendStatus.available, true);

  nextBackendStatus = 404;
  await window.fetch('/api/playback/local/missing');
  assert.strictEqual(window.STREAMVAULT_CONFIG.backendStatus.available, true);

  healthOnline = false;
  nextBackendFailure = new TypeError('backend request failed');
  await assert.rejects(window.fetch('/api/playback/local/offline'), /backend request failed/);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.strictEqual(window.STREAMVAULT_CONFIG.backendStatus.available, false);
  const playbackBeforeOfflineGuard = playbackCalls;
  await window.playMedia('offline-movie');
  assert.strictEqual(playbackCalls, playbackBeforeOfflineGuard + 1, 'stale offline status blocked the real Play action');
  assert(!toastMessages.includes('Playback server is currently offline.'));

  healthOnline = true;
  await window.fetch('/api/playback/local/recovered');
  await window.playMedia('recovered-movie');
  window.openLiveChannel('recovered-channel');
  assert.strictEqual(window.STREAMVAULT_CONFIG.backendStatus.available, true);
  assert.strictEqual(playbackCalls, playbackBeforeOfflineGuard + 2, 'playback did not recover without refresh');
  assert.strictEqual(liveCalls, 5, 'Live TV did not recover without refresh');
  assert(!/(?:local|session)Storage/.test(runtimeSource + offlineSource));

  const externalScripts = [...index.matchAll(/<script[^>]+src=["']([^"']+)/g)].map(match => match[1]);
  assert(externalScripts[0].startsWith(`/${HOME_SNAPSHOT_FILE}`));
  assert(externalScripts[1].startsWith('/runtime-config.js'));
  assert(index.includes('/manifest.webmanifest'));
  assert(index.includes('/offline-ui.js'));
  assert(runtimeSource.includes("navigator.serviceWorker.register('/sw-20260722-v6.js'"));
  assert(runtimeSource.includes("updateViaCache: 'none'"));
  assert(!/home-feed\.json/i.test(index + runtimeSource));

  const artwork = [
    ...(homeSnapshot.hero || []),
    ...(homeSnapshot.rows || []).flatMap(row => row.items || [])
  ].flatMap(item => [item.poster, item.backdrop]).filter(Boolean);
  assert(!artwork.some(url => /backend\.streamvault\.fit|\/poster-cache(?:[/?#]|$)|\/image-proxy(?:[/?#]|$)|localhost|127\.0\.0\.1|(?:ftp|sftp):\/\//i.test(String(url))));

  for (const channel of channels) {
    if (!channel.logo?.startsWith('/')) continue;
    const logo = channel.logo.split(/[?#]/, 1)[0].slice(1);
    assert(fs.existsSync(path.join(ROOT, logo)), `missing channel logo: ${logo}`);
  }

  assert(sw.includes("request.headers.has('range')"));
  assert(sw.includes("request.destination === 'video'"));
  assert(sw.includes("request.destination === 'audio'"));
  for (const prefix of ['/proxy', '/subtitle', '/audio', '/hls', '/playback']) {
    assert(sw.includes(`'${prefix}'`), `service worker backend boundary is missing ${prefix}`);
  }
  assert(sw.includes('POSTER_CACHE_LIMIT'));
  assert(sw.includes('CACHE_PREFIX'));
  assert(sw.includes('caches.delete(name)'));
  assert(fallbackSw.includes("importScripts('/sw-20260722-v6.js')"));

  console.log(`Hostinger frontend boundary tests passed: ${artwork.length} static artwork URLs, ${channels.length} local channel logos`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
