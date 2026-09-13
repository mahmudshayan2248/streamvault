const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const INDEX = path.join(ROOT, 'index.html');
const BACKEND_ORIGIN = 'https://backend.streamvault.fit';
const SERVICE_WORKER_FILE = 'sw-20260714-v4.js';
const STATIC_JSON = ['home-feed.json', 'boot-search-index.json', 'channels.json', 'catalog.json', 'manifest.webmanifest'];
const REQUIRED_MESSAGES = [
  'Playback server is currently offline.',
  'Live TV server is currently offline.'
];
let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

function parseJson(name) {
  try {
    return JSON.parse(read(name));
  } catch (error) {
    fail(`${name} is invalid JSON: ${error.message}`);
    return null;
  }
}

if (!fs.existsSync(INDEX)) {
  fail('hostinger/index.html is missing');
  process.exitCode = 1;
  return;
}

const index = read('index.html');
const refs = [...index.matchAll(/(?:src|href)=["']([^"'#?]+)(?:[?#][^"']*)?["']/g)]
  .map(match => match[1])
  .filter(ref => ref.startsWith('/') && !ref.startsWith('//'));

for (const ref of [...new Set(refs)]) {
  const localPath = path.join(ROOT, ref.slice(1));
  if (!fs.existsSync(localPath)) fail(`referenced asset is missing: ${ref}`);
}

const firstExternalScript = index.match(/<script[^>]+src=["']([^"']+)/)?.[1] || '';
if (!firstExternalScript.startsWith('/runtime-config.js')) {
  fail('runtime-config.js must load before every other external script');
}

const json = {};
for (const name of STATIC_JSON) {
  if (!fs.existsSync(path.join(ROOT, name))) {
    fail(`static JSON is missing: ${name}`);
    continue;
  }
  json[name] = parseJson(name);
}

const homeFeed = json['home-feed.json'];
if (homeFeed) {
  const items = [
    ...(Array.isArray(homeFeed.hero) ? homeFeed.hero : []),
    ...(Array.isArray(homeFeed.rows) ? homeFeed.rows.flatMap(row => row.items || []) : [])
  ];
  const artwork = items.flatMap(item => [item.poster, item.backdrop]).filter(Boolean);
  if (artwork.some(url => /backend\.streamvault\.fit|\/poster-cache(?:\?|$)|\/image-proxy(?:\?|$)/i.test(String(url)))) {
    fail('home-feed.json contains backend-dependent initial artwork');
  }
  if (artwork.some(url => /^http:\/\//i.test(String(url)))) {
    fail('home-feed.json contains mixed-content artwork');
  }
}

const channels = json['channels.json'];
if (Array.isArray(channels)) {
  for (const channel of channels) {
    if (!channel?.logo || !String(channel.logo).startsWith('/')) continue;
    const logo = String(channel.logo).split(/[?#]/, 1)[0].slice(1);
    if (!fs.existsSync(path.join(ROOT, logo))) fail(`channel logo is missing: ${logo}`);
  }
}

const activeScripts = refs
  .filter(ref => ref.endsWith('.js'))
  .map(ref => path.join(ROOT, ref.slice(1)))
  .filter(fs.existsSync);
const textFiles = [INDEX, path.join(ROOT, 'runtime-config.js'), path.join(ROOT, SERVICE_WORKER_FILE), path.join(ROOT, 'sw.js'), ...activeScripts];
const windowsPath = /(?:^|[\s"'`(=])[A-Za-z]:[\\/]/m;
for (const filename of [...new Set(textFiles)]) {
  const source = fs.readFileSync(filename, 'utf8');
  if (windowsPath.test(source)) fail(`local Windows path found in ${path.basename(filename)}`);
}

const runtime = read('runtime-config.js');
if (!runtime.includes(BACKEND_ORIGIN)) fail('runtime backend origin is not centralized on backend.streamvault.fit');
if (!runtime.includes('global.STREAMVAULT_CONFIG = config')) fail('window.STREAMVAULT_CONFIG is missing');
for (const message of REQUIRED_MESSAGES) {
  if (!runtime.includes(message)) fail(`offline message is missing: ${message}`);
}

const activeSource = activeScripts.map(filename => fs.readFileSync(filename, 'utf8')).join('\n');
if (!index.includes('/player-vlc-v1.js?v=20260825-player-v7') || !index.includes('/player-vlc-v1.css?v=20260825-player-v7')) {
  fail('index.html does not reference the player-v7 JS and CSS cache keys');
}
const playerV7 = read('player-vlc-v1.js');
if (!playerV7.includes("window.STREAMVAULT_PLAYER_VERSION='player-v7'") || !playerV7.includes("version:'player-v7'")) {
  fail('player-vlc-v1.js is missing the player-v7 runtime marker');
}
if (/https:\/\/(?:www\.)?streamvault\.fit\/(?:api|download|live|live-relay|proxy|stream|subtitles)(?:\/|\?|["'`])/.test(activeSource)) {
  fail('an active script still hardcodes a backend request through the frontend apex');
}

const sw = read(SERVICE_WORKER_FILE);
const fallbackSw = read('sw.js');
if (fallbackSw.replace(/\r\n/g, '\n') !== sw.replace(/\r\n/g, '\n')) {
  fail(`sw.js must mirror ${SERVICE_WORKER_FILE} as a compatibility fallback`);
}
for (const name of [SERVICE_WORKER_FILE, 'sw.js']) {
  const publicSwPath = path.resolve(ROOT, '..', 'public', name);
  if (!fs.existsSync(publicSwPath) || fs.readFileSync(publicSwPath, 'utf8').replace(/\r\n/g, '\n') !== sw.replace(/\r\n/g, '\n')) {
    fail(`public/${name} must mirror hostinger/${SERVICE_WORKER_FILE} for root service-worker publishing`);
  }
}
if (!runtime.includes(`navigator.serviceWorker.register('/${SERVICE_WORKER_FILE}'`) || !runtime.includes("updateViaCache: 'none'")) {
  fail(`runtime-config.js must register /${SERVICE_WORKER_FILE} with updateViaCache none`);
}
for (const exclusion of ['range', '/api/heavy-compat-hls', '/api/mobile-hls', '/live-relay', 'm3u8', 'POSTER_CACHE']) {
  if (!sw.toLowerCase().includes(exclusion.toLowerCase())) fail(`service worker exclusion/cache rule is missing: ${exclusion}`);
}
if (!sw.includes("request.destination === 'video'") || !sw.includes("request.destination === 'audio'")) {
  fail('service worker media responses are not explicitly excluded');
}

const htaccess = read('.htaccess');
if (!htaccess.includes('index\\.html|sw\\.js') || !htaccess.includes('no-cache, no-store')) {
  fail('.htaccess does not mark index.html and sw.js for no-cache/no-store');
}
if (!htaccess.includes('backend.streamvault.fit')) fail('.htaccess does not document the backend route boundary');

if (failures) {
  process.exitCode = 1;
} else {
  console.log(`Hostinger deployment verified: ${new Set(refs).size} referenced assets, ${activeScripts.length} active scripts, ${channels?.length || 0} local channel logos`);
}
