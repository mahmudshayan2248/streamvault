'use strict';

const EventEmitter = require('events');
const path = require('path');
const { Worker } = require('worker_threads');
const { atomicWriteCatalog, loadCatalog } = require('./persistence');
const { scanCatalog, validateCatalog } = require('./scanner');

class CatalogManager extends EventEmitter {
  constructor(options) {
    super();
    this.options = { retryDelays: [5000, 10000, 20000, 30000], reconcileIntervalMs: 5 * 60 * 1000, useWorker: true, ...options };
    this.logger = this.options.logger || console;
    this.activeCatalog = null;
    this.mediaById = new Map();
    this.scanPromise = null;
    this.retryAttempt = 0;
    this.retryTimer = null;
    this.interval = null;
    this.status = {
      ready: false, usingPersistedCatalog: false, mediaRootAvailable: false,
      moviesRootAvailable: false, seriesRootAvailable: false, scanInProgress: false,
      lastSuccessfulScan: null, lastScanError: null, counts: this.emptyCounts(),
    };
  }

  emptyCounts() { return { movies: 0, series: 0, seasons: 0, episodes: 0, unparsedEpisodes: 0, duplicates: 0 }; }

  activate(catalog, usingPersistedCatalog) {
    validateCatalog(catalog);
    this.activeCatalog = catalog;
    this.mediaById = new Map(Object.entries(catalog.media));
    this.status = {
      ...this.status,
      ready: true,
      usingPersistedCatalog,
      ...catalog.availability,
      lastSuccessfulScan: catalog.generatedAt,
      counts: { ...this.emptyCounts(), ...catalog.stats },
    };
    this.emit('swap', catalog);
  }

  loadPersisted() {
    this.logger.log?.('[Catalog] Loading persisted catalog');
    const loaded = loadCatalog(this.options.indexFile, validateCatalog, this.logger);
    if (!loaded) {
      this.logger.warn?.('[Catalog] No usable persisted catalog found');
      return false;
    }
    this.activate(loaded.catalog, true);
    const c = loaded.catalog.stats;
    this.logger.log?.(`[Catalog] Loaded ${c.movies} movies / ${c.series} series / ${c.episodes} episodes from ${loaded.source}`);
    return true;
  }

  start() {
    this.logger.log?.('[Catalog] API ready');
    setImmediate(() => this.rescan('startup'));
    if (this.options.reconcileIntervalMs > 0) {
      this.interval = setInterval(() => this.rescan('periodic'), this.options.reconcileIntervalMs);
      this.interval.unref?.();
    }
  }

  stop() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.interval) clearInterval(this.interval);
    this.retryTimer = null;
    this.interval = null;
  }

  runWorker() {
    if (!this.options.useWorker) return Promise.resolve().then(() => scanCatalog(this.options));
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'catalog-scan-worker.js'), { workerData: {
        moviesDir: this.options.moviesDir,
        seriesDir: this.options.seriesDir,
        videoExts: this.options.videoExts,
        posterCache: this.options.posterCache || {},
      } });
      worker.once('message', message => {
        if (message.ok) resolve(message.catalog);
        else reject(Object.assign(new Error(message.error.message), message.error));
      });
      worker.once('error', reject);
      worker.once('exit', code => { if (code !== 0) reject(new Error(`Catalog scan worker exited with code ${code}`)); });
    });
  }

  validateReplacement(catalog) {
    if (!this.activeCatalog) return;
    const previous = this.activeCatalog.stats || this.emptyCounts();
    const next = catalog.stats || this.emptyCounts();
    for (const field of ['movies', 'episodes']) {
      const before = Number(previous[field] || 0);
      const after = Number(next[field] || 0);
      if (before > 0 && after === 0) {
        const error = new Error(`Suspicious ${field} scan rejected: ${before} -> 0`);
        error.code = 'CATALOG_SUSPICIOUS_EMPTY_SCAN';
        error.availability = catalog.availability;
        throw error;
      }
      if (before >= 20 && after < Math.floor(before * 0.25) && process.env.CATALOG_ALLOW_LARGE_REMOVAL !== '1') {
        const error = new Error(`Suspicious ${field} scan rejected: ${before} -> ${after}`);
        error.code = 'CATALOG_SUSPICIOUS_PARTIAL_SCAN';
        error.availability = catalog.availability;
        throw error;
      }
    }
  }

  scheduleRetry() {
    if (this.retryTimer) return;
    const delays = this.options.retryDelays;
    const delay = delays[Math.min(this.retryAttempt, delays.length - 1)];
    this.retryAttempt++;
    this.logger.warn?.(`[Catalog] Keeping persisted catalog; retrying in ${Math.round(delay / 1000)}s`);
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.rescan('retry'); }, delay);
    this.retryTimer.unref?.();
  }

  rescan(reason = 'manual') {
    if (this.scanPromise) return this.scanPromise;
    this.status.scanInProgress = true;
    this.logger.log?.(`[Catalog] Background reconciliation started (${reason})`);
    const started = Date.now();
    this.scanPromise = this.runWorker().then(catalog => {
      validateCatalog(catalog);
      this.validateReplacement(catalog);
      atomicWriteCatalog(this.options.indexFile, catalog, validateCatalog);
      this.activate(catalog, false);
      this.status = { ...this.status, ...catalog.availability, lastScanError: null, scanInProgress: false };
      this.retryAttempt = 0;
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null;
      const c = catalog.stats;
      for (const relativePath of catalog.diagnostics?.unparsedEntries || []) {
        this.logger.warn?.(`[Catalog] UNPARSED EPISODE path=${relativePath} filename=${path.basename(relativePath)} reason=no_supported_pattern`);
      }
      for (const duplicate of catalog.diagnostics?.duplicateEntries || []) {
        this.logger.warn?.(`[Catalog] DUPLICATE EPISODE show=${duplicate.show} season=${duplicate.season} episode=${duplicate.episode} kept=${duplicate.kept} rejected=${duplicate.rejected}`);
      }
      this.logger.log?.(`[Catalog] Scan complete: Movies=${c.movies} Series=${c.series} Seasons=${c.seasons} Episodes=${c.episodes} Unparsed=${c.unparsedEpisodes} Duplicates=${c.duplicates} Duration=${Date.now() - started}ms`);
      return catalog;
    }).catch(error => {
      const availability = error.availability || {};
      this.status = {
        ...this.status, ...availability, scanInProgress: false,
        lastScanError: { code: error.code || 'CATALOG_SCAN_FAILED', message: error.message, at: new Date().toISOString() },
      };
      this.logger.warn?.(`[Catalog] ${error.message}`);
      this.scheduleRetry();
      throw error;
    }).finally(() => { this.scanPromise = null; });
    this.scanPromise.catch(() => {});
    return this.scanPromise;
  }

  getMedia(id) {
    const value = String(id ?? '');
    if (this.mediaById.has(value)) return this.mediaById.get(value);
    if (/^\d+$/.test(value)) return Object.values(this.activeCatalog?.media || {})[Number(value)] || null;
    return null;
  }

  getStatus() { return JSON.parse(JSON.stringify(this.status)); }
}

module.exports = { CatalogManager };
