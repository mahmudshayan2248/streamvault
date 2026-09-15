(function configureStreamVault(global) {
  'use strict';

  const BUILD_VERSION = '20260915-subtitle-warmup-v1';
  const BACKEND_ORIGIN = 'https://backend.streamvault.fit';
  const SNAPSHOT_DB_NAME = 'streamvault-homepage';
  const SNAPSHOT_DB_VERSION = 1;
  const SNAPSHOT_STORE = 'snapshots';
  const SNAPSHOT_RECORD_KEY = 'latest-valid';
  const BUNDLED_SNAPSHOT_TIME = Date.parse('2026-07-17T00:00:00.000Z');
  const BACKEND_PATHS = [
    '/api', '/download', '/live', '/live-relay', '/proxy', '/stream',
    '/subtitles', '/subtitle', '/audio', '/hls', '/playback'
  ];
  const LEGACY_FRONTEND_ORIGINS = new Set([
    'https://streamvault.fit',
    'https://www.streamvault.fit'
  ]);
  const MESSAGES = Object.freeze({
    backend: 'StreamVault backend is temporarily offline.',
    playback: 'Playback server is currently offline.',
    liveTv: 'Live TV server is currently offline.',
    action: 'This backend feature is currently offline.'
  });

  function isBackendPath(pathname) {
    return BACKEND_PATHS.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'));
  }

  function backendUrl(input) {
    if (input == null) return input;
    let url;
    try {
      url = new URL(String(input), global.location.href);
    } catch (_error) {
      return input;
    }
    const shouldRoute = isBackendPath(url.pathname)
      && (url.origin === global.location.origin || LEGACY_FRONTEND_ORIGINS.has(url.origin));
    if (!shouldRoute) return input instanceof URL ? url.toString() : input;
    return BACKEND_ORIGIN + url.pathname + url.search + url.hash;
  }

  function normalizeBackendUrls(value) {
    if (value instanceof URL) return value.toString();
    if (typeof value === 'string') {
      if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) return value;
      return backendUrl(value);
    }
    if (Array.isArray(value)) return value.map(normalizeBackendUrls);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeBackendUrls(child)]));
  }

  const bundledSnapshot = global.STREAMVAULT_HOME_SNAPSHOT;
  if (!bundledSnapshot?.snapshotId || !Array.isArray(bundledSnapshot.rows)) {
    throw new Error('Bundled production homepage snapshot is missing or invalid');
  }

  const requiredRows = Object.freeze(bundledSnapshot.rows.map(row => Object.freeze({
    rowId: String(row?.rowId || ''),
    title: String(row?.title || '').trim()
  })));
  const requiredRowCount = requiredRows.length;
  const minimumSnapshotItems = Math.max(100, requiredRowCount * 6);

  function validCommit(value) {
    return typeof value === 'string' && /^[a-f\d]{7,64}$/i.test(value.trim());
  }

  function validVersion(value) {
    return typeof value === 'string'
      && value.trim().length >= 3
      && value.trim().length <= 160
      && /^[\w.+:/@-]+(?:[\w .+:/@-]*[\w.+:/@-])?$/.test(value.trim());
  }

  function snapshotFreshness(snapshot) {
    const candidates = [
      snapshot?.capturedAt,
      snapshot?.generatedAt,
      snapshot?.source?.capturedAt,
      snapshot?.source?.generatedAt
    ];
    for (const candidate of candidates) {
      if (candidate == null || candidate === '') continue;
      const numeric = Number(candidate);
      if (Number.isFinite(numeric) && numeric > 0) return numeric < 1e12 ? numeric * 1000 : numeric;
      const parsed = Date.parse(String(candidate));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return snapshot?.snapshotId === bundledSnapshot.snapshotId ? BUNDLED_SNAPSHOT_TIME : 0;
  }

  function inspectSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return { valid: false, reason: 'snapshot is not an object' };
    if (snapshot.ok === false) return { valid: false, reason: 'snapshot reports failure' };
    if (typeof snapshot.snapshotId !== 'string' || !snapshot.snapshotId.trim() || snapshot.snapshotId.length > 200) {
      return { valid: false, reason: 'snapshot ID is missing or invalid' };
    }
    if (!Array.isArray(snapshot.rows)) return { valid: false, reason: 'rows array is missing' };
    if (snapshot.rows.length < requiredRowCount) return { valid: false, reason: 'snapshot has fewer homepage rows' };

    const rowsById = new Map();
    for (const row of snapshot.rows) {
      const rowId = String(row?.rowId || '');
      if (!rowId || rowsById.has(rowId)) return { valid: false, reason: 'row IDs are missing or duplicated' };
      rowsById.set(rowId, row);
    }

    let totalItems = 0;
    for (const required of requiredRows) {
      const row = rowsById.get(required.rowId);
      if (!row || String(row.title || '').trim() !== required.title) {
        return { valid: false, reason: `required row is missing: ${required.rowId}` };
      }
      if (!Array.isArray(row.items) || row.items.length < 6) {
        return { valid: false, reason: `poster-rich row is partial: ${required.rowId}` };
      }
      const posterCount = row.items.filter(item => item && (item.poster || item.backdrop)).length;
      if (posterCount < Math.min(4, row.items.length)) {
        return { valid: false, reason: `poster-rich row is empty: ${required.rowId}` };
      }
      totalItems += row.items.length;
    }
    if (totalItems < minimumSnapshotItems || totalItems > 100000) {
      return { valid: false, reason: 'snapshot item count is unreasonable' };
    }

    const source = snapshot.source;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return { valid: false, reason: 'snapshot source metadata is missing' };
    }
    const commit = source.backendCommit || source.frontendCommit || source.commit;
    const version = source.backendVersion || source.backendBuild || source.frontendVersion || source.version;
    if (!validCommit(commit) || !validVersion(version)) {
      return { valid: false, reason: 'snapshot source commit/version metadata is invalid' };
    }

    const freshness = snapshotFreshness(snapshot);
    if (!freshness) return { valid: false, reason: 'snapshot freshness metadata is missing' };
    return { valid: true, reason: '', freshness, totalItems };
  }

  const bundledInspection = inspectSnapshot(bundledSnapshot);
  if (!bundledInspection.valid) {
    throw new Error(`Bundled production homepage snapshot is invalid: ${bundledInspection.reason}`);
  }

  function isValidSnapshot(snapshot) {
    return inspectSnapshot(snapshot).valid;
  }

  function selectNewestValidSnapshot(...snapshots) {
    let selected = bundledSnapshot;
    let selectedInspection = bundledInspection;
    for (const snapshot of snapshots.flat()) {
      const inspection = inspectSnapshot(snapshot);
      if (inspection.valid && inspection.freshness > selectedInspection.freshness) {
        selected = snapshot;
        selectedInspection = inspection;
      }
    }
    return selected;
  }

  function openSnapshotDatabase() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error('IndexedDB is unavailable'));
      const request = global.indexedDB.open(SNAPSHOT_DB_NAME, SNAPSHOT_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
      request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked'));
    });
  }

  async function readPersistentSnapshot() {
    let db;
    try {
      db = await openSnapshotDatabase();
      const record = await new Promise((resolve, reject) => {
        const request = db.transaction(SNAPSHOT_STORE, 'readonly').objectStore(SNAPSHOT_STORE).get(SNAPSHOT_RECORD_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
      });
      return isValidSnapshot(record?.snapshot) ? record.snapshot : null;
    } catch (error) {
      console.warn('[StreamVault] IndexedDB homepage snapshot read failed:', error.message);
      return null;
    } finally {
      try { db?.close(); } catch (_error) {}
    }
  }

  async function putPersistentSnapshot(snapshot) {
    const inspection = inspectSnapshot(snapshot);
    if (!inspection.valid) return false;
    let db;
    try {
      db = await openSnapshotDatabase();
      return await new Promise((resolve, reject) => {
        const store = db.transaction(SNAPSHOT_STORE, 'readwrite').objectStore(SNAPSHOT_STORE);
        const readRequest = store.get(SNAPSHOT_RECORD_KEY);
        readRequest.onerror = () => reject(readRequest.error || new Error('IndexedDB comparison read failed'));
        readRequest.onsuccess = () => {
          const current = selectNewestValidSnapshot(bundledSnapshot, readRequest.result?.snapshot);
          if (inspection.freshness <= snapshotFreshness(current)) return resolve(false);
          const writeRequest = store.put({
            snapshot,
            freshness: inspection.freshness,
            storedAt: Date.now()
          }, SNAPSHOT_RECORD_KEY);
          writeRequest.onsuccess = () => resolve(true);
          writeRequest.onerror = () => reject(writeRequest.error || new Error('IndexedDB write failed'));
        };
      });
    } catch (error) {
      console.warn('[StreamVault] IndexedDB homepage snapshot write failed:', error.message);
      return false;
    } finally {
      try { db?.close(); } catch (_error) {}
    }
  }

  const backendStatus = {
    checked: false,
    available: null,
    reachable: null,
    playbackReady: false,
    liveReady: false,
    catalogReady: false,
    searchReady: false,
    version: null,
    commit: null,
    checkedAt: 0,
    lastSuccessfulCheck: null
  };
  let readinessRequest = null;
  let readinessTimer = null;
  let homeRefreshPromise = null;
  let lastHomeRefresh = 0;
  let selectedHomeSnapshot = bundledSnapshot;
  const nativeFetch = global.fetch.bind(global);

  function clearStaleOfflineUi() {
    const toast = document.getElementById?.('toast');
    if (toast && Object.values(MESSAGES).includes(String(toast.textContent || '').trim())) {
      toast.classList?.remove('show');
      toast.textContent = '';
    }
  }

  function dispatchBackendStatus(previousReachable) {
    document.documentElement.dataset.backend = backendStatus.reachable ? 'online' : 'offline';
    if (backendStatus.reachable) clearStaleOfflineUi();
    global.dispatchEvent(new CustomEvent('streamvault:backend-status', { detail: { ...backendStatus } }));
    if (backendStatus.reachable && previousReachable === false) {
      global.dispatchEvent(new CustomEvent('streamvault:backend-online', { detail: { ...backendStatus } }));
    }
  }

  function markBackendReachable(payload) {
    const previousReachable = backendStatus.reachable;
    const now = Date.now();
    backendStatus.checked = true;
    backendStatus.available = true;
    backendStatus.reachable = true;
    backendStatus.checkedAt = now;
    backendStatus.lastSuccessfulCheck = now;
    if (payload && typeof payload === 'object') {
      for (const key of ['playbackReady', 'liveReady', 'catalogReady', 'searchReady']) {
        backendStatus[key] = payload[key] === true;
      }
      backendStatus.version = typeof payload.version === 'string' ? payload.version : null;
      backendStatus.commit = typeof payload.commit === 'string' ? payload.commit : null;
    }
    if (previousReachable !== true || payload) dispatchBackendStatus(previousReachable);
    scheduleReadinessCheck();
    if (payload?.catalogReady === true) void refreshPersistentHomeSnapshot();
    return backendStatus;
  }

  function markBackendUnreachable() {
    const previousReachable = backendStatus.reachable;
    backendStatus.checked = true;
    backendStatus.available = false;
    backendStatus.reachable = false;
    backendStatus.checkedAt = Date.now();
    backendStatus.playbackReady = false;
    backendStatus.liveReady = false;
    backendStatus.catalogReady = false;
    backendStatus.searchReady = false;
    if (previousReachable !== false) dispatchBackendStatus(previousReachable);
    scheduleReadinessCheck();
    return backendStatus;
  }

  function requestIsBackend(input) {
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, global.location.href);
      return url.origin === BACKEND_ORIGIN && isBackendPath(url.pathname);
    } catch (_error) {
      return false;
    }
  }

  function isNetworkFailure(error) {
    return error instanceof TypeError || error?.name === 'TypeError' || error?.name === 'NetworkError';
  }

  function fetchWithTimeout(url, options = {}, timeoutMs = 3500) {
    const routed = backendUrl(url);
    const backendRequest = requestIsBackend(routed);
    const controller = new AbortController();
    const parentSignal = options.signal;
    let timedOut = false;
    const abortFromParent = () => controller.abort(parentSignal?.reason);
    if (parentSignal?.aborted) abortFromParent();
    else parentSignal?.addEventListener?.('abort', abortFromParent, { once: true });
    const timer = global.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    timer?.unref?.();
    return nativeFetch(routed, { ...options, signal: controller.signal })
      .then(response => {
        if (backendRequest) markBackendReachable();
        return response;
      })
      .catch(error => {
        if (backendRequest && (timedOut || isNetworkFailure(error))) markBackendUnreachable();
        throw error;
      })
      .finally(() => {
        global.clearTimeout(timer);
        parentSignal?.removeEventListener?.('abort', abortFromParent);
      });
  }

  function checkBackendAvailability(timeoutMs = 900) {
    if (readinessRequest) return readinessRequest;
    readinessRequest = fetchWithTimeout(BACKEND_ORIGIN + '/api/ready', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }, timeoutMs)
      .then(async response => {
        if (!response.ok) return backendStatus;
        const payload = await response.json();
        return markBackendReachable(payload);
      })
      .catch(() => backendStatus)
      .finally(() => {
        readinessRequest = null;
        scheduleReadinessCheck();
      });
    return readinessRequest;
  }

  function scheduleReadinessCheck() {
    global.clearTimeout(readinessTimer);
    const delay = backendStatus.reachable === true ? 10000 : 1000;
    readinessTimer = global.setTimeout(() => { void checkBackendAvailability(900); }, delay);
    readinessTimer?.unref?.();
  }

  async function initializeHomeSnapshot() {
    const stored = await readPersistentSnapshot();
    selectedHomeSnapshot = selectNewestValidSnapshot(bundledSnapshot, stored);
    return normalizeBackendUrls(selectedHomeSnapshot);
  }

  async function refreshPersistentHomeSnapshot(force = false) {
    if (backendStatus.reachable !== true || backendStatus.catalogReady !== true) return null;
    if (homeRefreshPromise) return homeRefreshPromise;
    if (!force && Date.now() - lastHomeRefresh < 300000) return null;
    homeRefreshPromise = fetchWithTimeout(BACKEND_ORIGIN + '/api/home-feed?limit=24', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }, 5000)
      .then(response => {
        if (!response.ok) throw new Error(`home feed HTTP ${response.status}`);
        return response.json();
      })
      .then(async payload => {
        const fresh = normalizeBackendUrls(payload);
        const inspection = inspectSnapshot(fresh);
        if (!inspection.valid) {
          console.warn('[StreamVault] rejected partial homepage snapshot:', inspection.reason);
          return null;
        }
        const stored = await readPersistentSnapshot();
        const newest = selectNewestValidSnapshot(bundledSnapshot, stored, fresh);
        if (newest !== fresh) return newest;
        const saved = await putPersistentSnapshot(fresh);
        if (!saved && snapshotFreshness(fresh) <= snapshotFreshness(selectedHomeSnapshot)) return selectedHomeSnapshot;
        selectedHomeSnapshot = fresh;
        lastHomeRefresh = Date.now();
        global.dispatchEvent(new CustomEvent('streamvault:home-snapshot-updated', {
          detail: { snapshotId: fresh.snapshotId, capturedAt: inspection.freshness }
        }));
        return fresh;
      })
      .catch(error => {
        console.warn('[StreamVault] latest homepage snapshot refresh failed:', error.message);
        return null;
      })
      .finally(() => { homeRefreshPromise = null; });
    return homeRefreshPromise;
  }

  global.fetch = function streamVaultFetch(input, init) {
    let routed = input;
    try {
      if (typeof input === 'string' || input instanceof URL) routed = backendUrl(input);
      else if (input?.url) {
        const nextUrl = backendUrl(input.url);
        if (nextUrl !== input.url) routed = new Request(nextUrl, input);
      }
    } catch (_error) {
      routed = input;
    }
    const backendRequest = requestIsBackend(routed);
    return nativeFetch(routed, init).then(response => {
      if (backendRequest) markBackendReachable();
      return response;
    }, error => {
      if (backendRequest && isNetworkFailure(error)) markBackendUnreachable();
      throw error;
    });
  };

  if (global.XMLHttpRequest) {
    const nativeOpen = global.XMLHttpRequest.prototype.open;
    global.XMLHttpRequest.prototype.open = function streamVaultOpen(method, url, ...rest) {
      const routed = backendUrl(url);
      if (requestIsBackend(routed)) {
        this.addEventListener?.('load', () => markBackendReachable(), { once: true });
        this.addEventListener?.('error', () => markBackendUnreachable(), { once: true });
        this.addEventListener?.('timeout', () => markBackendUnreachable(), { once: true });
      }
      return nativeOpen.call(this, method, routed, ...rest);
    };
  }

  function loadStaticJson(path) {
    return fetchWithTimeout(path, { cache: 'no-cache', headers: { Accept: 'application/json' } }, 5000)
      .then(response => {
        if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
        return response.json().then(normalizeBackendUrls);
      });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(global.location.protocol)) return Promise.resolve(null);
    return navigator.serviceWorker.register('/sw-20260915-subtitle-delivery-v1.js', {
      scope: '/',
      updateViaCache: 'none'
    }).then(registration => registration.update().then(() => registration).catch(() => registration));
  }

  async function showOfflineMessage(kind = 'action') {
    const status = await checkBackendAvailability(900);
    if (status.reachable) return null;
    const message = MESSAGES[kind] || MESSAGES.action;
    if (typeof global.showToast === 'function') global.showToast(message);
    else console.warn(`[StreamVault] ${message}`);
    return message;
  }

  const homeSnapshotPromise = initializeHomeSnapshot();
  const staticData = Object.freeze({
    homeSnapshot: homeSnapshotPromise,
    channels: loadStaticJson('/channels.json')
  });
  const config = Object.freeze({
    apiOrigin: BACKEND_ORIGIN,
    backendOrigin: BACKEND_ORIGIN,
    backendUrl,
    apiUrl: backendUrl,
    backendStatus,
    buildVersion: BUILD_VERSION,
    checkBackendAvailability,
    fetchWithTimeout,
    getCurrentHomeSnapshot: () => selectedHomeSnapshot,
    inspectSnapshot,
    isBackendPath,
    isValidSnapshot,
    messages: MESSAGES,
    normalizeBackendUrls,
    offlineMessage: MESSAGES.backend,
    readPersistentSnapshot,
    refreshPersistentHomeSnapshot,
    registerServiceWorker,
    selectNewestValidSnapshot,
    showOfflineMessage,
    snapshotDatabaseName: SNAPSHOT_DB_NAME,
    snapshotFreshness,
    staticData,
    writePersistentSnapshot: putPersistentSnapshot
  });

  global.API_BASE = BACKEND_ORIGIN;
  global.STREAMVAULT_BACKEND_OFFLINE_MESSAGE = MESSAGES.backend;
  global.__svBackendStatus = backendStatus;
  global.STREAMVAULT_CONFIG = config;
  global.StreamVaultConfig = config;
  global.__svBackendCheckPromise = checkBackendAvailability();
  scheduleReadinessCheck();

  const checkNow = () => { void checkBackendAvailability(700); };
  global.addEventListener('online', checkNow);
  global.addEventListener('focus', checkNow);
  global.addEventListener('pageshow', checkNow);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNow(); });
  global.addEventListener('load', () => {
    registerServiceWorker().catch(error => console.warn('[StreamVault] service worker registration failed:', error.message));
  }, { once: true });
})(window);
