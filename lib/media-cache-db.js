'use strict';

const dns = require('dns');
const net = require('net');

const {
  normalizedKey,
  parseMediaIdentity,
  sourceFingerprint,
  stableEpisodeKey,
  stableSeriesKey,
} = require('./media-identity');

const DEFAULT_PUBLIC_ORIGIN = 'https://streamvault.fit';
const DEFAULT_REFRESH_MS = 10 * 60 * 1000;
const TABLES = {
  movies: 'media_cache_movies',
  series: 'media_cache_series',
  episodes: 'media_cache_episodes',
};

function stringValue(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizeId(value) {
  return stringValue(value).toLowerCase();
}

function isBlank(value) {
  return stringValue(value) === '';
}

function validArtworkUrl(value, publicOrigin = DEFAULT_PUBLIC_ORIGIN) {
  let url = stringValue(value);
  if (!url || /^failed:/i.test(url) || /^missing:/i.test(url) || /^none$/i.test(url)) return '';
  if (url.startsWith('/cache/posters/')) return publicOrigin.replace(/\/$/, '') + url;
  if (/^https?:\/\//i.test(url)) return url;
  return '';
}

function isLocalArtworkUrl(value) {
  const url = stringValue(value);
  return /^https?:\/\/(?:www\.)?streamvault\.fit\/cache\/posters\//i.test(url)
    || /^\/cache\/posters\//i.test(url);
}

function chooseArtwork(current, cached, remote, publicOrigin = DEFAULT_PUBLIC_ORIGIN) {
  const currentUrl = validArtworkUrl(current, publicOrigin);
  if (currentUrl && isLocalArtworkUrl(currentUrl)) return currentUrl;

  const cachedUrl = validArtworkUrl(cached, publicOrigin);
  if (cachedUrl && isLocalArtworkUrl(cachedUrl)) return cachedUrl;

  if (currentUrl) return currentUrl;
  if (cachedUrl) return cachedUrl;

  const remoteUrl = validArtworkUrl(remote, publicOrigin);
  return remoteUrl || currentUrl || '';
}

function fillMissing(target, field, value) {
  if (!target || !field) return;
  if (isBlank(target[field]) && !isBlank(value)) target[field] = value;
}

function fillMissingNumberish(target, field, value) {
  if (!target || !field) return;
  if ((target[field] === null || target[field] === undefined || target[field] === '' || Number(target[field]) === 0) && !isBlank(value)) {
    target[field] = value;
  }
}

function titleYearKey(title, year) {
  const key = normalizedKey(title || '');
  const y = stringValue(year).match(/(?:19|20)\d{2}/)?.[0] || '';
  return key ? `${key}|${y}` : '';
}

function seriesSeasonEpisodeKey(seriesName, season, episode) {
  const key = stableSeriesKey(seriesName || '');
  const s = Number(season);
  const e = Number(episode);
  if (!key || !Number.isFinite(s) || !Number.isFinite(e)) return '';
  return `${key}|${s}|${e}`;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactRow(row) {
  const next = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (value !== null && value !== undefined && value !== '') next[key] = value;
  }
  return next;
}

function envFlagEnabled(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return !/^(?:0|false|no|off)$/i.test(String(value).trim());
}

function getDatabaseConfig(env = process.env) {
  if (env.DATABASE_URL) return { uri: env.DATABASE_URL };
  const host = env.DB_HOST || env.MYSQL_HOST;
  const database = env.DB_NAME || env.MYSQL_DATABASE;
  const user = env.DB_USER || env.MYSQL_USER;
  const password = env.DB_PASSWORD || env.MYSQL_PASSWORD || '';
  const port = Number(env.DB_PORT || env.MYSQL_PORT || 3306) || 3306;
  if (!host || !database || !user) return null;
  return {
    host,
    port,
    database,
    user,
    password,
    waitForConnections: true,
    connectionLimit: 3,
    namedPlaceholders: false,
    preferIpv4: envFlagEnabled(env.MEDIA_CACHE_DB_PREFER_IPV4 ?? env.DB_PREFER_IPV4, true),
  };
}

async function resolveIpv4Host(host, logger = console) {
  if (!host || net.isIP(host)) return host;
  try {
    const addresses = await dns.promises.resolve4(host);
    const ipv4 = addresses.find(Boolean);
    if (ipv4) return ipv4;
  } catch (error) {
    logger.warn?.('[MediaCacheDB] IPv4 host resolution failed:', error?.message || error);
  }
  return host;
}

class MediaCacheDb {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.logger = options.logger || console;
    this.publicOrigin = options.publicOrigin || DEFAULT_PUBLIC_ORIGIN;
    this.refreshIntervalMs = Math.max(60000, Number(options.refreshIntervalMs || DEFAULT_REFRESH_MS) || DEFAULT_REFRESH_MS);
    this.onRefresh = typeof options.onRefresh === 'function' ? options.onRefresh : null;
    this.pool = null;
    this.timer = null;
    this.refreshing = null;
    this.enabled = false;
    this.lastError = '';
    this.lastRefreshAt = null;
    this.stats = { movies: 0, series: 0, episodes: 0 };
    this.maps = this.emptyMaps();
  }

  emptyMaps() {
    return {
      movieByStream: new Map(),
      movieByFingerprint: new Map(),
      movieByKey: new Map(),
      movieByTitleYear: new Map(),
      seriesByKey: new Map(),
      seriesByTitleYear: new Map(),
      episodeByStream: new Map(),
      episodeByFingerprint: new Map(),
      episodeByKey: new Map(),
      episodeBySeriesSeasonEpisode: new Map(),
    };
  }

  status() {
    return {
      enabled: this.enabled,
      lastRefreshAt: this.lastRefreshAt,
      lastError: this.lastError || null,
      stats: { ...this.stats },
    };
  }

  async initPool() {
    if (this.pool) return this.pool;
    const config = getDatabaseConfig(this.env);
    if (!config) {
      this.lastError = 'missing-db-config';
      return null;
    }
    let mysql;
    try {
      mysql = require('mysql2/promise');
    } catch (error) {
      this.lastError = 'mysql2-not-installed';
      this.logger.warn?.('[MediaCacheDB] mysql2 is unavailable; DB artwork overlay disabled');
      return null;
    }
    if (!config.uri && config.preferIpv4) {
      config.host = await resolveIpv4Host(config.host, this.logger);
    }
    delete config.preferIpv4;
    this.pool = config.uri
      ? mysql.createPool({ uri: config.uri, waitForConnections: true, connectionLimit: 3, namedPlaceholders: false })
      : mysql.createPool(config);
    this.enabled = true;
    return this.pool;
  }

  start() {
    if (this.timer) return;
    this.refresh().catch(error => this.handleRefreshError(error));
    this.timer = setInterval(() => {
      this.refresh().catch(error => this.handleRefreshError(error));
    }, this.refreshIntervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const pool = this.pool;
    this.pool = null;
    this.enabled = false;
    if (pool) return pool.end();
    return Promise.resolve();
  }

  handleRefreshError(error) {
    this.lastError = error?.message || String(error || 'refresh failed');
    this.logger.warn?.('[MediaCacheDB] refresh failed:', this.lastError);
  }

  async tableColumns(table) {
    const pool = await this.initPool();
    if (!pool) return new Set();
    try {
      const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
      return new Set(rows.map(row => row.Field));
    } catch (error) {
      this.lastError = error?.message || String(error);
      throw error;
    }
  }

  async selectRows(table, desiredColumns) {
    const pool = await this.initPool();
    if (!pool) return [];
    const available = await this.tableColumns(table);
    if (!available.size) return [];
    const columns = desiredColumns.filter(column => available.has(column));
    if (!columns.length) return [];
    const sql = `SELECT ${columns.map(column => `\`${column}\``).join(', ')} FROM \`${table}\``;
    const [rows] = await pool.query(sql);
    return rows.map(compactRow);
  }

  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refreshInternal().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async refreshInternal() {
    const pool = await this.initPool();
    if (!pool) return false;

    const [movieRows, seriesRows, episodeRows] = await Promise.all([
      this.selectRows(TABLES.movies, [
        'media_key', 'stream_id', 'title', 'tmdb_id', 'poster_url', 'remote_poster_url', 'backdrop_url',
        'overview', 'year', 'rating', 'genre', 'runtime', 'director', 'language', 'repair_status', 'lookup_status'
      ]),
      this.selectRows(TABLES.series, [
        'series_key', 'series_name', 'tmdb_id', 'poster_url', 'remote_poster_url', 'backdrop_url',
        'overview', 'year', 'rating', 'genre', 'language', 'lookup_status'
      ]),
      this.selectRows(TABLES.episodes, [
        'episode_key', 'stream_id', 'series_key', 'series_name', 'season_num', 'episode_num', 'episode_title',
        'tmdb_id', 'poster_url', 'remote_poster_url', 'source'
      ]),
    ]);

    const maps = this.emptyMaps();
    for (const row of movieRows) this.indexMovieRow(maps, row);
    for (const row of seriesRows) this.indexSeriesRow(maps, row);
    for (const row of episodeRows) this.indexEpisodeRow(maps, row);

    this.maps = maps;
    this.stats = { movies: movieRows.length, series: seriesRows.length, episodes: episodeRows.length };
    this.lastError = '';
    this.lastRefreshAt = new Date().toISOString();
    this.logger.log?.(`[MediaCacheDB] refreshed ${movieRows.length} movies, ${seriesRows.length} series, ${episodeRows.length} episodes`);
    if (this.onRefresh) {
      try { this.onRefresh(this.status()); }
      catch (error) { this.logger.warn?.('[MediaCacheDB] onRefresh failed:', error?.message || error); }
    }
    return true;
  }

  indexMovieRow(maps, row) {
    const mediaKey = stringValue(row.media_key);
    const streamId = stringValue(row.stream_id);
    const title = row.title || '';
    const year = row.year || '';
    if (mediaKey) maps.movieByKey.set(mediaKey, row);
    if (streamId) {
      maps.movieByStream.set(normalizeId(streamId), row);
      maps.movieByFingerprint.set(sourceFingerprint({ streamUrl: streamId }), row);
    }
    const titleKey = titleYearKey(title, year);
    const looseTitleKey = titleYearKey(title, '');
    if (titleKey && !maps.movieByTitleYear.has(titleKey)) maps.movieByTitleYear.set(titleKey, row);
    if (looseTitleKey && !maps.movieByTitleYear.has(looseTitleKey)) maps.movieByTitleYear.set(looseTitleKey, row);
  }

  indexSeriesRow(maps, row) {
    const seriesName = row.series_name || '';
    const seriesKey = stringValue(row.series_key) || stableSeriesKey(seriesName);
    if (seriesKey) maps.seriesByKey.set(seriesKey, row);
    const titleKey = titleYearKey(seriesName, row.year || '');
    const looseTitleKey = titleYearKey(seriesName, '');
    if (titleKey && !maps.seriesByTitleYear.has(titleKey)) maps.seriesByTitleYear.set(titleKey, row);
    if (looseTitleKey && !maps.seriesByTitleYear.has(looseTitleKey)) maps.seriesByTitleYear.set(looseTitleKey, row);
  }

  indexEpisodeRow(maps, row) {
    const streamId = stringValue(row.stream_id);
    const source = stringValue(row.source);
    const episodeKey = stringValue(row.episode_key);
    if (episodeKey) maps.episodeByKey.set(episodeKey, row);
    for (const value of [streamId, source]) {
      if (!value) continue;
      maps.episodeByStream.set(normalizeId(value), row);
      maps.episodeByFingerprint.set(sourceFingerprint({ streamUrl: value }), row);
    }
    const sse = seriesSeasonEpisodeKey(row.series_name || row.series_key, row.season_num, row.episode_num);
    if (sse && !maps.episodeBySeriesSeasonEpisode.has(sse)) maps.episodeBySeriesSeasonEpisode.set(sse, row);
    const stable = stableEpisodeKey({
      kind: 'episode',
      seriesKey: row.series_key || stableSeriesKey(row.series_name || ''),
      seriesName: row.series_name || '',
      season: Number(row.season_num),
      episode: Number(row.episode_num),
      sourceFingerprint: sourceFingerprint({ streamUrl: streamId || source || episodeKey }),
    });
    if (stable && !maps.episodeByKey.has(stable)) maps.episodeByKey.set(stable, row);
  }

  movieCandidates(item) {
    const name = item?.name || item?.title || item?.file || item?.filename || '';
    const year = item?.year || '';
    const stream = item?.streamUrl || item?.url || item?.src || item?.link || item?.streamId || '';
    const candidates = [];
    if (stream) {
      candidates.push(this.maps.movieByStream.get(normalizeId(stream)));
      candidates.push(this.maps.movieByFingerprint.get(sourceFingerprint({ streamUrl: stream })));
    }
    if (item?.id) candidates.push(this.maps.movieByStream.get(normalizeId(item.id)));
    if (item?.media_key || item?.mediaKey) candidates.push(this.maps.movieByKey.get(stringValue(item.media_key || item.mediaKey)));
    const parsed = parseMediaIdentity({ title: name, filename: item?.file || item?.filename || name, streamUrl: stream });
    if (parsed.kind === 'movie') candidates.push(this.maps.movieByTitleYear.get(titleYearKey(parsed.title || name, parsed.year || year)));
    candidates.push(this.maps.movieByTitleYear.get(titleYearKey(name, year)));
    candidates.push(this.maps.movieByTitleYear.get(titleYearKey(name, '')));
    return candidates.filter(Boolean);
  }

  seriesCandidates(show) {
    const name = show?.name || show?.title || show?.seriesName || '';
    const key = show?.series_key || show?.seriesKey || stableSeriesKey(name);
    const candidates = [];
    if (key) candidates.push(this.maps.seriesByKey.get(key));
    candidates.push(this.maps.seriesByTitleYear.get(titleYearKey(name, show?.year || '')));
    candidates.push(this.maps.seriesByTitleYear.get(titleYearKey(name, '')));
    return candidates.filter(Boolean);
  }

  episodeCandidates(ep, show) {
    const stream = ep?.streamUrl || ep?.url || ep?.src || ep?.link || ep?.streamId || '';
    const candidates = [];
    if (stream) {
      candidates.push(this.maps.episodeByStream.get(normalizeId(stream)));
      candidates.push(this.maps.episodeByFingerprint.get(sourceFingerprint({ streamUrl: stream })));
    }
    if (ep?.episode_key || ep?.episodeKey) candidates.push(this.maps.episodeByKey.get(stringValue(ep.episode_key || ep.episodeKey)));
    const seriesName = show?.name || show?.title || ep?.seriesName || ep?.series_name || '';
    const season = ep?.season ?? ep?.seasonNumber ?? ep?.season_num;
    const episode = ep?.episode ?? ep?.episodeNumber ?? ep?.episode_num ?? ep?.number;
    const sse = seriesSeasonEpisodeKey(seriesName, season, episode);
    if (sse) candidates.push(this.maps.episodeBySeriesSeasonEpisode.get(sse));
    return candidates.filter(Boolean);
  }

  hydrateMovie(item) {
    if (!item || typeof item !== 'object') return item;
    const row = this.movieCandidates(item)[0];
    if (!row) return item;
    const next = { ...item };
    const poster = chooseArtwork(next.poster, row.poster_url, row.remote_poster_url, this.publicOrigin);
    if (poster) next.poster = poster;
    const backdrop = chooseArtwork(next.backdrop, row.backdrop_url, '', this.publicOrigin);
    if (backdrop) next.backdrop = backdrop;
    else if (!next.backdrop && next.poster) next.backdrop = next.poster;
    fillMissingNumberish(next, 'tmdbId', row.tmdb_id);
    fillMissing(next, 'overview', row.overview);
    fillMissing(next, 'year', row.year);
    fillMissingNumberish(next, 'rating', row.rating);
    fillMissing(next, 'genre', row.genre);
    fillMissing(next, 'runtime', row.runtime);
    fillMissing(next, 'director', row.director);
    fillMissing(next, 'language', row.language);
    return next;
  }

  hydrateSeries(show) {
    if (!show || typeof show !== 'object') return show;
    const row = this.seriesCandidates(show)[0];
    if (!row) return show;
    const next = { ...show };
    const poster = chooseArtwork(next.poster, row.poster_url, row.remote_poster_url, this.publicOrigin);
    if (poster) next.poster = poster;
    const backdrop = chooseArtwork(next.backdrop, row.backdrop_url, '', this.publicOrigin);
    if (backdrop) next.backdrop = backdrop;
    else if (!next.backdrop && next.poster) next.backdrop = next.poster;
    fillMissingNumberish(next, 'tmdbId', row.tmdb_id);
    fillMissing(next, 'overview', row.overview);
    fillMissing(next, 'year', row.year);
    fillMissingNumberish(next, 'rating', row.rating);
    fillMissing(next, 'genre', row.genre);
    fillMissing(next, 'language', row.language);
    return next;
  }

  hydrateEpisode(ep, show) {
    if (!ep || typeof ep !== 'object') return ep;
    const row = this.episodeCandidates(ep, show)[0];
    if (!row) return ep;
    const next = { ...ep };
    const image = chooseArtwork(next.poster || next.thumb || next.thumbnail || next.still, row.poster_url, row.remote_poster_url, this.publicOrigin);
    if (image) {
      next.poster = next.poster || image;
      next.thumb = next.thumb || image;
      next.thumbnail = next.thumbnail || image;
      next.still = next.still || image;
    }
    fillMissingNumberish(next, 'tmdbId', row.tmdb_id);
    const fallbackTitle = `Episode ${Number(next.episode || next.episodeNumber || row.episode_num || 0) || ''}`.trim();
    if (!isBlank(row.episode_title) && (isBlank(next.epTitle) || stringValue(next.epTitle) === fallbackTitle)) next.epTitle = row.episode_title;
    if (!isBlank(row.episode_title) && (isBlank(next.name) || stringValue(next.name) === fallbackTitle)) next.name = row.episode_title;
    if (!isBlank(row.episode_title) && isBlank(next.title)) next.title = row.episode_title;
    return next;
  }

  hydrateSeriesDeep(show) {
    const next = this.hydrateSeries(show);
    if (!next || !next.seasons) return next;
    const seasons = next.seasons;
    if (Array.isArray(seasons)) {
      next.seasons = seasons.map(seasonObj => {
        if (!seasonObj || typeof seasonObj !== 'object') return seasonObj;
        const seasonNumber = seasonObj.season ?? seasonObj.seasonNumber ?? seasonObj.number;
        const episodes = safeArray(seasonObj.episodes).map((ep, idx) => this.hydrateEpisode({ season: seasonNumber, episode: idx + 1, ...ep }, next));
        return { ...seasonObj, episodes };
      });
      return next;
    }
    if (seasons && typeof seasons === 'object') {
      const copy = {};
      for (const [seasonKey, episodes] of Object.entries(seasons)) {
        copy[seasonKey] = safeArray(episodes).map((ep, idx) => this.hydrateEpisode({ season: Number(seasonKey) || ep?.season, episode: idx + 1, ...ep }, next));
      }
      next.seasons = copy;
    }
    return next;
  }
}

function createMediaCacheDb(options = {}) {
  return new MediaCacheDb(options);
}

module.exports = {
  createMediaCacheDb,
  validArtworkUrl,
  isLocalArtworkUrl,
  chooseArtwork,
};
