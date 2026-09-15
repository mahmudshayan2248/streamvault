'use strict';

const VERSION = '20260915-subtitle-delivery-v1';
const CACHE_PREFIX = 'streamvault-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-${VERSION}`;
const STATIC_CACHE = `${CACHE_PREFIX}static-${VERSION}`;
const POSTER_CACHE = `${CACHE_PREFIX}posters-${VERSION}`;
const POSTER_CACHE_LIMIT = 1500;

const SHELL_ASSETS = [
  '/index.html',
  '/home-snapshot-76d0639-20260717.js',
  '/runtime-config.js',
  '/styles.css',
  '/fifa-fast.js',
  '/frontend-player-ui.js',
  '/frontend-playback-session.js',
  '/app-v3.js',
  '/details-exact-v5.js',
  '/home.js',
  '/downloads.js',
  '/search.js',
  '/livetv.js',
  '/player-runtime-v2.js',
  '/live-fast.js',
  '/boot.js',
  '/hostinger-poster-fix.js',
  '/series-modal-episodes-v7.js',
  '/media-popup-polish-v8.js',
  '/series-instant-prefetch-v9.js',
  '/movie-play-button-v10.js',
  '/instant-remux-v23.js',
  '/offline-ui.js',
  '/boot-search-index.json',
  '/channels.json',
  '/manifest.webmanifest',
  '/fallback.webp',
  '/assets/insomnia-tapes-logo.png',
  '/copyright.html',
  '/disclaimer.html',
  '/legal.html',
  '/privacy.html',
  '/terms.html'
];

const BACKEND_PREFIXES = [
  '/api', '/playback', '/stream', '/proxy', '/hls', '/live',
  '/live-relay', '/audio', '/subtitle', '/subtitles', '/download'
];
const NETWORK_FIRST_JSON = new Set([
  '/channels.json',
  '/boot-search-index.json',
  '/catalog.json',
  '/mobile-source-index.json'
]);
const MEDIA_FILE_PATTERN = /\.(?:m3u8|ts|m4s|mp4|m4v|mkv|webm|mov|avi|mp3|m4a|aac|flac|wav|vtt)(?:$|\?)/i;
const STATIC_FILE_PATTERN = /\.(?:css|js|json|webmanifest|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)$/i;
const HOMEPAGE_SCRIPT_PATTERN = /\/(?:runtime-config|home|app-v3|boot|home-snapshot-[^/]+)\.js$/i;
const CURRENT_PLAYER_ASSET_PATTERN = /\/(?:app-v3|player-session|player-vlc-v1|runtime-config)\.js$|\/player-vlc-v1\.css$/i;

function pathMatches(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

function isBackendRequest(url) {
  return url.hostname === 'backend.streamvault.fit'
    || BACKEND_PREFIXES.some(prefix => pathMatches(url.pathname, prefix));
}

function isMediaRequest(request, url) {
  const accept = request.headers.get('accept') || '';
  return request.headers.has('range')
    || request.destination === 'video'
    || request.destination === 'audio'
    || /^(?:video|audio)\//i.test(accept)
    || MEDIA_FILE_PATTERN.test(url.pathname + url.search);
}

function isTmdbArtwork(request, url) {
  return request.method === 'GET'
    && url.hostname === 'image.tmdb.org'
    && (request.destination === 'image' || /\/t\/p\//.test(url.pathname));
}

function isModalHdArtworkRequest(request, url) {
  return request.method === 'GET'
    && request.destination === 'image'
    && url.hostname === 'image.tmdb.org'
    && url.searchParams.get('sv-modal-hd') === 'v2';
}

function isSameOriginStatic(request, url) {
  return request.method === 'GET'
    && url.origin === self.location.origin
    && (url.pathname.startsWith('/assets/')
      || ['style', 'script', 'font', 'image'].includes(request.destination)
      || STATIC_FILE_PATTERN.test(url.pathname));
}

function isHomepageNetworkFirst(url) {
  return url.origin === self.location.origin
    && (CURRENT_PLAYER_ASSET_PATTERN.test(url.pathname)
      || HOMEPAGE_SCRIPT_PATTERN.test(url.pathname)
      || url.pathname.endsWith('.js')
      || NETWORK_FIRST_JSON.has(url.pathname));
}

function cacheableResponse(response) {
  if (!response || !response.ok) return false;
  return !String(response.headers.get('content-type') || '').toLowerCase().includes('text/html');
}

function cacheablePoster(response) {
  return Boolean(response && (response.ok || response.type === 'opaque'));
}

async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = Math.max(0, keys.length - limit);
  await Promise.all(keys.slice(0, excess).map(key => cache.delete(key)));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(SHELL_ASSETS.map(async asset => {
      const request = new Request(asset, { cache: 'reload' });
      try {
        const response = await fetch(request);
        if (cacheableResponse(response)) await cache.put(request, response);
      } catch (_error) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, STATIC_CACHE, POSTER_CACHE]);
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && !keep.has(name))
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

function networkOnly(request) {
  return fetch(request, { cache: 'no-store' });
}

async function navigationNetworkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (_error) {
    return await cache.match(request)
      || await cache.match(new Request('/index.html'))
      || Response.error();
  }
}

async function exactNetworkFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (cacheableResponse(response)) await cache.put(request, response.clone());
    return response;
  } catch (_error) {
    return await cache.match(request) || Response.error();
  }
}

async function staleWhileRevalidate(event, request, cacheName, validator) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const update = fetch(request, { cache: 'no-cache' }).then(async response => {
    if (validator(response)) {
      await cache.put(request, response.clone());
      if (cacheName === POSTER_CACHE) await trimCache(POSTER_CACHE, POSTER_CACHE_LIMIT);
    }
    return response;
  });
  if (cached) {
    event.waitUntil(update.catch(() => {}));
    return cached;
  }
  return update;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Media, backend API calls and writes must keep the browser's original
  // request semantics. In particular, wrapping backend requests in a new
  // fetch({cache:'no-store'}) can add Cache-Control and trigger a CORS preflight.
  if (request.method !== 'GET' || isMediaRequest(request, url) || isBackendRequest(url)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }
  if (isModalHdArtworkRequest(request, url)) {
    event.respondWith(networkOnly(request));
    return;
  }
  if (isTmdbArtwork(request, url)) {
    event.respondWith(staleWhileRevalidate(event, request, POSTER_CACHE, cacheablePoster));
    return;
  }
  if (isHomepageNetworkFirst(url)) {
    event.respondWith(exactNetworkFirst(request));
    return;
  }
  if (isSameOriginStatic(request, url)) {
    event.respondWith(staleWhileRevalidate(event, request, STATIC_CACHE, cacheableResponse));
  }
});
