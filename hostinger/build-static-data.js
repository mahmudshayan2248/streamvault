const fs = require('fs');
const path = require('path');
const { readSnapshotModule } = require('./capture-home-snapshot');

const DEPLOY_ROOT = __dirname;
const BOOT_SEARCH_VERSION = '20260717-current-home-snapshot-v1';
const HOME_SNAPSHOT_FILE = 'home-snapshot-76d0639-20260717.js';
const REQUIRED_FRONTEND_FILES = [
  '.htaccess',
  'index.html',
  'runtime-config.js',
  'styles.css',
  'fifa-fast.js',
  'frontend-player-ui.js',
  'frontend-playback-session.js',
  'app-v3.js',
  'autoplay-next-v1.js',
  'details-exact-v5.js',
  'home.js',
  'downloads.js',
  'search.js',
  'livetv.js',
  'player.js',
  'live-fast.js',
  'boot.js',
  'hostinger-poster-fix.js',
  'series-modal-episodes-v7.js',
  'media-popup-polish-v8.js',
  'series-instant-prefetch-v9.js',
  'movie-play-button-v10.js',
  'instant-remux-v23.js',
  'offline-ui.js',
  'sw-20260717-v5.js',
  'sw.js',
  'manifest.webmanifest',
  'fallback.webp',
  'assets/insomnia-tapes-logo.png',
  HOME_SNAPSHOT_FILE,
  'capture-home-snapshot.js',
  'channels.json',
  'catalog.json',
  'copyright.html',
  'disclaimer.html',
  'legal.css',
  'legal.html',
  'privacy.html',
  'terms.html'
];

function deployPath(name) {
  const filename = path.resolve(DEPLOY_ROOT, name);
  const relative = path.relative(DEPLOY_ROOT, filename);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing path outside Hostinger deploy root: ${name}`);
  }
  return filename;
}

function requireFiles() {
  const missing = REQUIRED_FRONTEND_FILES.filter(name => !fs.existsSync(deployPath(name)));
  if (missing.length) throw new Error(`Missing Hostinger frontend files: ${missing.join(', ')}`);
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(deployPath(name), 'utf8'));
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function searchItem(item) {
  const name = item.name || item.title || '';
  const type = item.type || (item.seasons ? 'series' : 'movie');
  const searchText = normalizeSearchText([
    name,
    item.title,
    item.year,
    item.genre,
    item.category,
    item.file
  ].filter(Boolean).join(' '));
  return {
    ...item,
    name,
    title: item.title || name,
    type,
    searchText,
    searchTokens: [...new Set(searchText.split(' ').filter(token => token.length > 1))]
  };
}

function buildBootSearchIndex(homeSnapshot) {
  const candidates = [
    ...(Array.isArray(homeSnapshot.hero) ? homeSnapshot.hero : []),
    ...(Array.isArray(homeSnapshot.rows)
      ? homeSnapshot.rows.flatMap(row => Array.isArray(row.items) ? row.items : [])
      : [])
  ];
  const seen = new Set();
  const items = [];
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'object') continue;
    const item = searchItem(raw);
    const key = [item.type, item.id || '', normalizeSearchText(item.name), item.year || ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  return {
    ok: true,
    version: BOOT_SEARCH_VERSION,
    generatedAt: 0,
    snapshotId: homeSnapshot.snapshotId,
    source: `hostinger/${HOME_SNAPSHOT_FILE}`,
    totalAvailable: items.length,
    total: items.length,
    tokenCount: items.reduce((count, item) => count + item.searchTokens.length, 0),
    items
  };
}

function validateStaticPosters(homeSnapshot) {
  const items = [
    ...(homeSnapshot.hero || []),
    ...(homeSnapshot.rows || []).flatMap(row => row.items || [])
  ];
  const urls = items.flatMap(item => [item.poster, item.backdrop]).filter(Boolean);
  const backendPoster = urls.find(value => {
    const text = String(value);
    return /backend\.streamvault\.fit|\/poster-cache(?:[/?#]|$)|\/image-proxy(?:[/?#]|$)|localhost|127\.0\.0\.1|(?:ftp|sftp):\/\/|(?:^|[\\/])[A-Za-z]:[\\/]/i.test(text);
  });
  if (backendPoster) throw new Error(`Static home artwork depends on backend: ${backendPoster}`);
}

function validateChannelLogos(channels) {
  for (const channel of channels) {
    if (!channel?.logo || !String(channel.logo).startsWith('/')) continue;
    const logoPath = String(channel.logo).split(/[?#]/, 1)[0].replace(/^\//, '');
    if (!fs.existsSync(deployPath(logoPath))) {
      throw new Error(`Missing channel logo for ${channel.name || channel.id}: ${logoPath}`);
    }
  }
}

requireFiles();
const homeSnapshot = readSnapshotModule(deployPath(HOME_SNAPSHOT_FILE));
const channels = readJson('channels.json');
readJson('catalog.json');
readJson('manifest.webmanifest');
validateStaticPosters(homeSnapshot);
validateChannelLogos(channels);

const bootIndex = JSON.stringify(buildBootSearchIndex(homeSnapshot)) + '\n';
const bootIndexFile = deployPath('boot-search-index.json');
if (!fs.existsSync(bootIndexFile) || fs.readFileSync(bootIndexFile, 'utf8') !== bootIndex) {
  fs.writeFileSync(bootIndexFile, bootIndex);
}

console.log(`Built Hostinger frontend source: ${REQUIRED_FRONTEND_FILES.length} required files, ${channels.length} channel logos, ${JSON.parse(bootIndex).total} search items`);
