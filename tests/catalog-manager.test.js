'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { CatalogManager } = require('../lib/catalog/catalog-manager');
const { atomicWriteCatalog } = require('../lib/catalog/persistence');
const { scanCatalog, validateCatalog } = require('../lib/catalog/scanner');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'streamvault-catalog-'));
  const moviesDir = path.join(root, 'movies');
  const seriesDir = path.join(root, 'series');
  fs.mkdirSync(moviesDir, { recursive: true });
  fs.mkdirSync(seriesDir, { recursive: true });
  return { root, moviesDir, seriesDir, indexFile: path.join(root, 'file-index.json') };
}

function mediaFile(root, relative) {
  const file = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'fixture');
  return file;
}

function options(tree) {
  return { ...tree, videoExts: ['.mkv', '.mp4'], posterCache: {}, logger: { log() {}, warn() {} } };
}

function episodeIds(catalog) {
  return new Map(catalog.series.flatMap(show => Object.values(show.seasons).flatMap(episodes =>
    episodes.map(ep => [`${show.name}|${ep.season || 1}|${ep.episode}`, ep.streamId]))));
}

test('recursive, flat, alternative, release-tag, and special-character layouts are cataloged', t => {
  const tree = fixture();
  t.after(() => fs.rmSync(tree.root, { recursive: true, force: true }));
  mediaFile(tree.moviesDir, 'Movie.One.2024.mkv');
  mediaFile(tree.seriesDir, 'Invasion/Season 3/Invasion.S03E01.mkv');
  mediaFile(tree.seriesDir, 'Invasion.S03E02.mkv');
  mediaFile(tree.seriesDir, 'Show Name/Show.Name.1x05.mkv');
  mediaFile(tree.seriesDir, 'Invasion/Season 3/Invasion.S03E05.Point.of.No.Return.1080p.ATVP.WEBRip.x265.HEVC.10bit.AAC.5.1.MSubs-Pahe.mkv');
  mediaFile(tree.seriesDir, "Schitt's Creek/Season 1/Schitts.Creek.S01E01.mkv");
  mediaFile(tree.seriesDir, 'Tom & Jerry/Season 1/Tom.and.Jerry.S01E01.mkv');
  mediaFile(tree.seriesDir, 'বাংলা শো/Season 1/Episode 01.mkv');
  const catalog = scanCatalog(options(tree));
  assert.equal(catalog.stats.movies, 1);
  assert.equal(catalog.stats.episodes, 7);
  const invasion = catalog.series.find(show => show.name === 'Invasion');
  assert(invasion);
  assert.equal(invasion.seasons['3'].length, 3);
  assert.equal(invasion.seasons['3'].find(ep => ep.episode === 5).epTitle, 'Point of No Return');
  assert(catalog.series.some(show => show.name === "Schitt's Creek"));
  assert(catalog.series.some(show => show.name === 'Tom & Jerry'));
  assert(catalog.series.some(show => show.name === 'বাংলা শো'));
});

test('stable media IDs survive enumeration changes and additions', t => {
  const tree = fixture();
  t.after(() => fs.rmSync(tree.root, { recursive: true, force: true }));
  mediaFile(tree.moviesDir, 'Movie.mkv');
  mediaFile(tree.seriesDir, 'Stable Show/Season 1/Stable.Show.S01E02.mkv');
  mediaFile(tree.seriesDir, 'Stable Show/Season 1/Stable.Show.S01E01.mkv');
  const before = scanCatalog(options(tree));
  const ids = episodeIds(before);
  mediaFile(tree.seriesDir, 'Stable Show/Season 1/Stable.Show.S01E03.mkv');
  const after = scanCatalog(options(tree));
  assert.equal(episodeIds(after).get('Stable Show|1|1'), ids.get('Stable Show|1|1'));
  assert.equal(episodeIds(after).get('Stable Show|1|2'), ids.get('Stable Show|1|2'));
  assert(episodeIds(after).get('Stable Show|1|3'));
});

test('healthy removal is reflected by a successful rescan', t => {
  const tree = fixture();
  t.after(() => fs.rmSync(tree.root, { recursive: true, force: true }));
  mediaFile(tree.moviesDir, 'Movie.mkv');
  mediaFile(tree.seriesDir, 'Removal Show/Season 1/Removal.Show.S01E01.mkv');
  const removed = mediaFile(tree.seriesDir, 'Removal Show/Season 1/Removal.Show.S01E02.mkv');
  assert.equal(scanCatalog(options(tree)).stats.episodes, 2);
  fs.rmSync(removed);
  assert.equal(scanCatalog(options(tree)).stats.episodes, 1);
});

test('an accessible but suddenly empty root cannot replace last-known-good data', async t => {
  const tree = fixture();
  t.after(() => fs.rmSync(tree.root, { recursive: true, force: true }));
  mediaFile(tree.moviesDir, 'Movie.mkv');
  const episode = mediaFile(tree.seriesDir, 'Guard Show/Season 1/Guard.Show.S01E01.mkv');
  const initial = scanCatalog(options(tree));
  atomicWriteCatalog(tree.indexFile, initial, validateCatalog);
  const manager = new CatalogManager({ ...options(tree), useWorker: false, retryDelays: [60000], reconcileIntervalMs: 0 });
  t.after(() => manager.stop());
  assert.equal(manager.loadPersisted(), true);
  fs.rmSync(episode);
  await assert.rejects(manager.rescan('empty-guard'), /Suspicious episodes scan rejected/);
  assert.equal(manager.activeCatalog.stats.episodes, 1);
});

test('persisted catalog boots and remains active while storage is unavailable', async t => {
  const tree = fixture();
  t.after(() => fs.rmSync(tree.root, { recursive: true, force: true }));
  mediaFile(tree.moviesDir, 'Movie.mkv');
  mediaFile(tree.seriesDir, 'Persisted Show/Season 1/Persisted.Show.S01E01.mkv');
  const initial = scanCatalog(options(tree));
  atomicWriteCatalog(tree.indexFile, initial, validateCatalog);
  const unavailable = `${tree.seriesDir}.offline`;
  fs.renameSync(tree.seriesDir, unavailable);
  const manager = new CatalogManager({ ...options(tree), useWorker: false, retryDelays: [60000], reconcileIntervalMs: 0 });
  t.after(() => manager.stop());
  assert.equal(manager.loadPersisted(), true);
  const id = episodeIds(manager.activeCatalog).get('Persisted Show|1|1');
  await assert.rejects(manager.rescan('test-unavailable'), /Series storage unavailable/);
  assert.equal(manager.getStatus().ready, true);
  assert.equal(manager.getStatus().usingPersistedCatalog, true);
  assert.equal(manager.getStatus().counts.episodes, 1);
  assert.equal(episodeIds(manager.activeCatalog).get('Persisted Show|1|1'), id);
  fs.renameSync(unavailable, tree.seriesDir);
  await manager.rescan('test-recovery');
  assert.equal(manager.getStatus().usingPersistedCatalog, false);
  assert.equal(manager.getStatus().seriesRootAvailable, true);
  assert.equal(episodeIds(manager.activeCatalog).get('Persisted Show|1|1'), id);
});

test('atomic persistence falls back to backup after primary corruption', t => {
  const tree = fixture();
  t.after(() => fs.rmSync(tree.root, { recursive: true, force: true }));
  mediaFile(tree.moviesDir, 'Movie.mkv');
  mediaFile(tree.seriesDir, 'Backup Show/S01/Backup.Show.S01E01.mkv');
  const first = scanCatalog(options(tree));
  atomicWriteCatalog(tree.indexFile, first, validateCatalog);
  atomicWriteCatalog(tree.indexFile, first, validateCatalog);
  fs.writeFileSync(tree.indexFile, '{broken');
  const manager = new CatalogManager({ ...options(tree), useWorker: false, reconcileIntervalMs: 0 });
  assert.equal(manager.loadPersisted(), true);
  assert.equal(manager.activeCatalog.stats.episodes, 1);
});
