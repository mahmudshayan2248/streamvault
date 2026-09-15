const fs = require('fs');
const path = require('path');
const { readSnapshotModule } = require('./capture-home-snapshot');

const ROOT = __dirname;
const INDEX = path.join(ROOT, 'index.html');
const BACKEND_ORIGIN = 'https://backend.streamvault.fit';
const HOME_SNAPSHOT_FILE = 'home-snapshot-76d0639-20260717.js';
const SERVICE_WORKER_FILE = 'sw-20260722-v6.js';
const STATIC_JSON = ['boot-search-index.json', 'channels.json', 'catalog.json', 'manifest.webmanifest'];
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

const externalScripts = [...index.matchAll(/<script[^>]+src=["']([^"']+)/g)].map(match => match[1]);
if (!externalScripts[0]?.startsWith(`/${HOME_SNAPSHOT_FILE}`)) {
  fail(`${HOME_SNAPSHOT_FILE} must load before every other external script`);
}
if (!externalScripts[1]?.startsWith('/runtime-config.js')) {
  fail(`runtime-config.js must load immediately after ${HOME_SNAPSHOT_FILE}`);
}

const json = {};
for (const name of STATIC_JSON) {
  if (!fs.existsSync(path.join(ROOT, name))) {
    fail(`static JSON is missing: ${name}`);
    continue;
  }
  json[name] = parseJson(name);
}

let homeSnapshot = null;
try {
  homeSnapshot = readSnapshotModule(path.join(ROOT, HOME_SNAPSHOT_FILE));
} catch (error) {
  fail(`${HOME_SNAPSHOT_FILE} is invalid: ${error.message}`);
}
if (homeSnapshot) {
  const items = [
    ...(Array.isArray(homeSnapshot.hero) ? homeSnapshot.hero : []),
    ...(Array.isArray(homeSnapshot.rows) ? homeSnapshot.rows.flatMap(row => row.items || []) : [])
  ];
  const artwork = items.flatMap(item => [item.poster, item.backdrop]).filter(Boolean);
  if (artwork.some(url => /backend\.streamvault\.fit|\/poster-cache(?:[/?#]|$)|\/image-proxy(?:[/?#]|$)|localhost|127\.0\.0\.1|(?:ftp|sftp):\/\/|(?:^|[\\/])[A-Za-z]:[\\/]/i.test(String(url)))) {
    fail(`${HOME_SNAPSHOT_FILE} contains backend-dependent initial artwork`);
  }
  if (artwork.some(url => /^http:\/\//i.test(String(url)))) {
    fail(`${HOME_SNAPSHOT_FILE} contains mixed-content artwork`);
  }
  if (homeSnapshot.source?.frontendCommit !== '76d0639660345cdbd3c0b675bdf25ed944be7bd1') {
    fail('homepage snapshot does not identify the current production frontend commit');
  }
  if (!Array.isArray(homeSnapshot.rows) || homeSnapshot.rows.length !== 43) {
    fail(`homepage snapshot row count is not 43: ${homeSnapshot.rows?.length || 0}`);
  } else {
    const rowIds = homeSnapshot.rows.map(row => row.rowId);
    const rowNames = homeSnapshot.rows.map(row => row.title);
    if (new Set(rowIds).size !== rowIds.length) fail('homepage snapshot contains duplicate row IDs');
    if (rowNames.some(name => !String(name || '').trim())) fail('homepage snapshot contains an empty row name');
    const marvel = homeSnapshot.rows.find(row => row.rowId === 'marvelRow');
    const marvelPrefix = (marvel?.items || []).slice(0, 7).map(item => String(item.name || item.title || '')
      .toLowerCase()
      .replace(/\b(19|20)\d{2}\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim());
    const expected = ['avengers endgame', 'avengers infinity war', 'the avengers', 'avengers age of ultron', 'iron man', 'iron man 2', 'iron man 3'];
    if (marvelPrefix.some((title, index) => title !== expected[index])) {
      fail(`homepage snapshot Marvel prefix is stale: ${marvelPrefix.join(' | ')}`);
    }
    for (const row of homeSnapshot.rows) {
      for (const item of row.items || []) {
        for (const field of ['id', 'title', 'year', 'rating', 'type', 'poster', 'backdrop']) {
          if (!Object.prototype.hasOwnProperty.call(item, field)) {
            fail(`homepage snapshot ${row.rowId} item is missing ${field}`);
            break;
          }
        }
      }
    }
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
if (!index.includes('/player-session.js?v=20260915-subtitle-continuity-v3') || !index.includes('/player-vlc-v1.js?v=20260914-bitmap-subtitles-v1') || !index.includes('/player-vlc-v1.css?v=20260914-bitmap-subtitles-v1')) {
  fail('index.html does not reference the PlayerSession release assets');
}
const playerView = read('player-vlc-v1.js');
const playerSession = read('player-session.js');
if (!playerView.includes("window.STREAMVAULT_PLAYER_VERSION = 'bitmap-subtitles-v1'") || !playerView.includes('new PlayerSession')) {
  fail('player-vlc-v1.js is not the PlayerSession view adapter');
}
if (!playerSession.includes("IDLE:'IDLE'") || !playerSession.includes("BUFFERING:'BUFFERING'") || !playerSession.includes('const owners = new WeakMap()') || !playerSession.includes('class MasterClock') || !playerSession.includes('class AVSynchronizer')) {
  fail('player-session.js is missing the authoritative lifecycle or video ownership guard');
}
for (const retired of ['instant-remux-v23', 'vod-buffer-engine-v1', 'playback-stability-hotfix-v2']) {
  if (index.includes(retired)) fail(`index.html still loads retired playback controller: ${retired}`);
}
if (index.includes('/cdn-cgi/challenge-platform/')) fail('index.html contains a response-only Cloudflare challenge bootstrap');
if (/https:\/\/(?:www\.)?streamvault\.fit\/(?:api|download|live|live-relay|proxy|stream|subtitles)(?:\/|\?|["'`])/.test(activeSource)) {
  fail('an active script still hardcodes a backend request through the frontend apex');
}
const homeSource = read('home.js');
if (/home-feed\.json/i.test(index + runtime + homeSource)) {
  fail('active frontend still references the obsolete static homepage feed');
}
for (const obsolete of ['home-feed.json', 'sw-20260714-v4.js']) {
  if (fs.existsSync(path.join(ROOT, obsolete))) fail(`obsolete frontend file still exists: ${obsolete}`);
}

const sw = read(SERVICE_WORKER_FILE);
const fallbackSw = read('sw.js');
if (!fallbackSw.includes(`importScripts('/${SERVICE_WORKER_FILE}')`)) {
  fail(`sw.js must delegate to ${SERVICE_WORKER_FILE} as a compatibility fallback`);
}
for (const name of [SERVICE_WORKER_FILE, 'sw.js']) {
  const publicSwPath = path.resolve(ROOT, '..', 'public', name);
  if (!fs.existsSync(publicSwPath)) fail(`public/${name} is missing for root service-worker publishing`);
}
if (!runtime.includes(`navigator.serviceWorker.register('/${SERVICE_WORKER_FILE}'`) || !runtime.includes("updateViaCache: 'none'")) {
  fail(`runtime-config.js must register /${SERVICE_WORKER_FILE} with updateViaCache none`);
}
for (const exclusion of ['range', '/api', '/playback', '/live-relay', 'm3u8', 'POSTER_CACHE']) {
  if (!sw.toLowerCase().includes(exclusion.toLowerCase())) fail(`service worker exclusion/cache rule is missing: ${exclusion}`);
}
if (!sw.includes("request.destination === 'video'") || !sw.includes("request.destination === 'audio'")) {
  fail('service worker media responses are not explicitly excluded');
}

const htaccess = read('.htaccess');
if (!htaccess.includes('index\\.html|runtime-config\\.js|sw') || !htaccess.includes('no-cache, no-store')) {
  fail('.htaccess does not mark index.html, runtime config, and service workers for no-cache/no-store');
}
if (!htaccess.includes('backend.streamvault.fit')) fail('.htaccess does not document the backend route boundary');
if (!runtime.includes("BACKEND_ORIGIN + '/api/ready'")) fail('runtime readiness checks do not use /api/ready');
if (!runtime.includes('global.indexedDB.open')) fail('runtime homepage snapshots do not use IndexedDB');
if (/(?:local|session)Storage/.test(runtime)) fail('runtime homepage snapshot persistence still uses Web Storage');

if (failures) {
  process.exitCode = 1;
} else {
  console.log(`Hostinger deployment verified: ${new Set(refs).size} referenced assets, ${activeScripts.length} active scripts, ${channels?.length || 0} local channel logos`);
}
