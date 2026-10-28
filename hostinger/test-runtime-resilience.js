'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { readSnapshotModule } = require('./capture-home-snapshot');

const ROOT = __dirname;
const SNAPSHOT_FILE = 'home-snapshot-76d0639-20260717.js';
const snapshotSource = fs.readFileSync(path.join(ROOT, SNAPSHOT_FILE), 'utf8');
const runtimeSource = fs.readFileSync(path.join(ROOT, 'runtime-config.js'), 'utf8');
const bundledSnapshot = readSnapshotModule(path.join(ROOT, SNAPSHOT_FILE));
const channels = JSON.parse(fs.readFileSync(path.join(ROOT, 'channels.json'), 'utf8'));

function memoryIndexedDB() {
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
                    queueMicrotask(() => {
                      operation.result = store.get(key);
                      operation.onsuccess?.();
                    });
                    return operation;
                  },
                  put(value, key) {
                    const operation = {};
                    queueMicrotask(() => {
                      store.set(key, value);
                      operation.onsuccess?.();
                    });
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

function freshSnapshot(timestamp = '2026-07-22T08:00:00.000Z') {
  const snapshot = JSON.parse(JSON.stringify(bundledSnapshot));
  snapshot.snapshotId = `backend-test-${Date.parse(timestamp)}`;
  snapshot.generatedAt = timestamp;
  snapshot.rows = snapshot.rows.map(row => ({ ...row, items: row.items.slice(0, 8) }));
  snapshot.source = {
    backendCommit: '0123456789abcdef0123456789abcdef01234567',
    backendVersion: '1.0.0-test'
  };
  return snapshot;
}

function makeRuntime({ indexedDB, online = false, catalogReady = false, readyDelay = 0, homePayload = null } = {}) {
  const listeners = new Map();
  const fetchCalls = [];
  let backendOnline = online;
  let readinessCalls = 0;

  const addListener = (type, handler) => {
    const handlers = listeners.get(type) || [];
    handlers.push(handler);
    listeners.set(type, handlers);
  };
  const document = {
    hidden: false,
    documentElement: { dataset: {} },
    addEventListener: addListener
  };
  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const window = {
    location: new URL('https://streamvault.fit/'),
    indexedDB,
    XMLHttpRequest: null,
    setTimeout,
    clearTimeout,
    addEventListener: addListener,
    dispatchEvent(event) {
      for (const handler of listeners.get(event.type) || []) handler(event);
    }
  };
  window.fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    fetchCalls.push(url.href);
    if (url.pathname === '/channels.json') return { ok: true, status: 200, json: async () => channels };
    if (url.pathname === '/api/version') {
      readinessCalls += 1;
      if (readyDelay) await new Promise(resolve => setTimeout(resolve, readyDelay));
      if (!backendOnline) throw new TypeError('backend offline');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          reachable: true,
          listening: true,
          fileIndexLoaded: true,
          playbackReady: true,
          liveReady: true,
          catalogReady,
          searchReady: false,
          version: '1.0.0-test',
          commit: '0123456789abcdef0123456789abcdef01234567'
        })
      };
    }
    if (url.pathname === '/api/home-feed') {
      if (!backendOnline) throw new TypeError('backend offline');
      return { ok: true, status: 200, json: async () => homePayload };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const context = {
    window,
    document,
    navigator: {},
    URL,
    Request,
    AbortController,
    CustomEvent,
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask
  };
  vm.runInNewContext(snapshotSource, context, { filename: SNAPSHOT_FILE });
  vm.runInNewContext(runtimeSource, context, { filename: 'runtime-config.js' });
  return {
    window,
    fetchCalls,
    get readinessCalls() { return readinessCalls; },
    setOnline(value) { backendOnline = value; }
  };
}

(async () => {
  const database = memoryIndexedDB();
  const first = makeRuntime({ indexedDB: database, online: false });
  const firstSnapshot = await first.window.StreamVaultConfig.staticData.homeSnapshot;
  assert.strictEqual(firstSnapshot.snapshotId, bundledSnapshot.snapshotId, 'first visit did not use bundled fallback');
  assert(firstSnapshot.rows.some(row => row.title === 'Netflix Originals'));
  assert(firstSnapshot.rows.some(row => row.title === 'Marvel Studios'));

  const newest = freshSnapshot();
  first.setOnline(true);
  first.window.StreamVaultConfig.backendStatus.catalogReady = true;
  first.window.StreamVaultConfig.backendStatus.reachable = true;
  const saved = await first.window.StreamVaultConfig.writePersistentSnapshot(newest);
  assert.strictEqual(saved, true, 'valid newer snapshot was not stored in IndexedDB');

  const offlineReload = makeRuntime({ indexedDB: database, online: false });
  const reloaded = await offlineReload.window.StreamVaultConfig.staticData.homeSnapshot;
  assert.strictEqual(reloaded.snapshotId, newest.snapshotId, 'newest IndexedDB snapshot was not selected offline');

  const older = freshSnapshot('2026-07-20T08:00:00.000Z');
  assert.strictEqual(await offlineReload.window.StreamVaultConfig.writePersistentSnapshot(older), false, 'older snapshot replaced the newest snapshot');
  const partial = freshSnapshot('2026-07-23T08:00:00.000Z');
  partial.rows = partial.rows.filter(row => row.title !== 'Marvel Studios');
  assert.strictEqual(await offlineReload.window.StreamVaultConfig.writePersistentSnapshot(partial), false, 'partial snapshot was stored');
  const empty = { ...freshSnapshot('2026-07-24T08:00:00.000Z'), rows: [] };
  assert.strictEqual(await offlineReload.window.StreamVaultConfig.writePersistentSnapshot(empty), false, 'empty snapshot was stored');

  const failedDatabase = { open() { throw new Error('IndexedDB denied'); } };
  const idbFailure = makeRuntime({ indexedDB: failedDatabase, online: false });
  assert.strictEqual(
    (await idbFailure.window.StreamVaultConfig.staticData.homeSnapshot).snapshotId,
    bundledSnapshot.snapshotId,
    'IndexedDB failure did not fall back to the bundled snapshot'
  );

  const overlap = makeRuntime({ indexedDB: database, online: true, readyDelay: 50 });
  const inFlight = overlap.window.__svBackendCheckPromise;
  const duplicate = overlap.window.StreamVaultConfig.checkBackendAvailability();
  assert.strictEqual(inFlight, duplicate, 'overlapping readiness requests were not deduplicated');
  await Promise.all([inFlight, duplicate]);
  assert.strictEqual(overlap.readinessCalls, 1, 'more than one readiness request ran concurrently');

  const recovery = makeRuntime({ indexedDB: database, online: false });
  await recovery.window.__svBackendCheckPromise;
  assert.strictEqual(recovery.window.StreamVaultConfig.backendStatus.reachable, false);
  const recoveryStarted = Date.now();
  recovery.setOnline(true);
  while (!recovery.window.StreamVaultConfig.backendStatus.reachable && Date.now() - recoveryStarted < 2200) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const recoveryMs = Date.now() - recoveryStarted;
  assert.strictEqual(recovery.window.StreamVaultConfig.backendStatus.reachable, true, '1-second offline polling did not detect recovery');
  assert(recoveryMs < 2100, `backend recovery took too long: ${recoveryMs}ms`);

  assert(!/(?:local|session)Storage/.test(runtimeSource), 'homepage persistence still references Web Storage');
  console.log(`Runtime resilience tests passed: IndexedDB newest-wins, partial rejection, recovery ${recoveryMs}ms`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
