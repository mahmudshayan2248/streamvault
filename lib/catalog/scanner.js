'use strict';

const fs = require('fs');
const path = require('path');
const { buildSeriesCatalog, walkVideoFiles } = require('../series-library');
const { parseMediaIdentity } = require('../media-identity');
const { stableMediaId } = require('./stable-id');

class CatalogStorageUnavailableError extends Error {
  constructor(message, availability, cause) {
    super(message);
    this.name = 'CatalogStorageUnavailableError';
    this.code = cause?.code || 'CATALOG_STORAGE_UNAVAILABLE';
    this.availability = availability;
    this.cause = cause;
  }
}

function inspectRoot(root) {
  try {
    const stat = fs.statSync(root);
    if (!stat.isDirectory()) throw Object.assign(new Error('Path is not a directory'), { code: 'ENOTDIR' });
    fs.accessSync(root, fs.constants.R_OK);
    return { available: true, error: null };
  } catch (error) {
    return { available: false, error: { code: error.code || 'EIO', message: error.message } };
  }
}

function addFileStats(entry) {
  try {
    const stat = fs.statSync(path.join(entry.dir, entry.file));
    return { ...entry, size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return { ...entry, size: null, mtimeMs: null };
  }
}

function movieList(media, posterCache) {
  return media.filter(entry => entry.type === 'movie').map(entry => {
    const key = path.basename(entry.file, path.extname(entry.file));
    const info = posterCache[key] || null;
    const name = key.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      id: entry.id,
      name,
      file: entry.file,
      poster: info?.poster || null,
      tmdbId: info?.tmdbId || null,
      overview: info?.overview || '',
      year: info?.year || '',
      rating: info?.rating || null,
      type: 'movie',
      genre: info?.genre || '',
      runtime: info?.runtime || '',
      director: info?.director || '',
      language: info?.language || '',
      productionCompanies: info?.productionCompanies || [],
    };
  });
}

function scanCatalog(options) {
  const { moviesDir, seriesDir, videoExts, posterCache = {}, logger = console } = options;
  const moviesState = inspectRoot(moviesDir);
  const seriesState = inspectRoot(seriesDir);
  const availability = {
    mediaRootAvailable: moviesState.available || seriesState.available,
    moviesRootAvailable: moviesState.available,
    seriesRootAvailable: seriesState.available,
    moviesError: moviesState.error,
    seriesError: seriesState.error,
  };
  if (!moviesState.available || !seriesState.available) {
    const missing = !moviesState.available ? `Movies storage unavailable: ${moviesState.error.message}` :
      `Series storage unavailable: ${seriesState.error.message}`;
    throw new CatalogStorageUnavailableError(missing, availability,
      Object.assign(new Error(missing), { code: (!moviesState.available ? moviesState.error : seriesState.error).code }));
  }

  const movieScan = walkVideoFiles(moviesDir, videoExts);
  const seriesScan = walkVideoFiles(seriesDir, videoExts);
  const seenIds = new Map();
  const media = [];
  const reclassified = [];
  const append = (raw, rootHint, root) => {
    const relativePath = raw.relativePath || path.relative(root, path.join(raw.dir, raw.file));
    const identity = parseMediaIdentity({
      filename: raw.file,
      relativePath,
      source_path: relativePath,
      title: raw.file,
    });
    let type = rootHint;
    if (rootHint === 'movie' && identity.kind === 'episode' && identity.confidence === 'high') {
      type = 'episode';
      reclassified.push({ relativePath, seriesName: identity.seriesName, season: identity.season, episode: identity.episode, reason: identity.reason });
    }
    const id = stableMediaId(type, relativePath);
    const existing = seenIds.get(id);
    if (existing && existing !== `${type}:${relativePath}`) {
      throw new Error(`Stable media ID collision: ${id}`);
    }
    seenIds.set(id, `${type}:${relativePath}`);
    media.push(addFileStats({
      ...raw,
      id,
      type,
      relativePath,
      mediaIdentity: {
        kind: identity.kind,
        confidence: identity.confidence,
        reason: identity.reason,
        seriesName: identity.seriesName,
        season: identity.season,
        episode: identity.episode,
      },
    }));
  };
  movieScan.files.forEach(entry => append(entry, 'movie', moviesDir));
  seriesScan.files.forEach(entry => append(entry, 'episode', seriesDir));
  media.sort((a, b) => a.id.localeCompare(b.id));

  const builtSeries = buildSeriesCatalog(media, posterCache);
  const movies = movieList(media, posterCache);
  const stats = {
    movies: movies.length,
    series: builtSeries.shows.length,
    seasons: builtSeries.diagnostics.seasons,
    episodes: builtSeries.diagnostics.episodesParsed - builtSeries.diagnostics.duplicates,
    unparsedEpisodes: builtSeries.diagnostics.unparsed,
    duplicates: builtSeries.diagnostics.duplicates,
  };
  for (const relativePath of builtSeries.diagnostics.sampleUnparsed) {
    logger.warn?.('[Catalog] UNPARSED EPISODE', { path: relativePath, filename: path.basename(relativePath), reason: 'No supported season/episode pattern' });
  }
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    media: Object.fromEntries(media.map(entry => [entry.id, entry])),
    movies,
    series: builtSeries.shows,
    stats,
    diagnostics: {
      ...builtSeries.diagnostics,
      reclassifiedMovieEpisodes: reclassified.length,
      sampleReclassifiedMovieEpisodes: reclassified.slice(0, 25),
      scanErrors: [...movieScan.errors.map(error => ({ root: 'movies', ...error })), ...seriesScan.errors.map(error => ({ root: 'series', ...error }))],
    },
    availability,
  };
}

function validateCatalog(catalog) {
  if (!catalog || catalog.version !== 2 || !catalog.media || typeof catalog.media !== 'object') throw new Error('Catalog schema is invalid');
  if (!Array.isArray(catalog.movies) || !Array.isArray(catalog.series)) throw new Error('Catalog lists are invalid');
  const ids = Object.keys(catalog.media);
  if (new Set(ids).size !== ids.length) throw new Error('Catalog contains duplicate media IDs');
  for (const id of ids) {
    const entry = catalog.media[id];
    if (!entry || entry.id !== id || !entry.file || !entry.dir || !['movie', 'episode'].includes(entry.type)) {
      throw new Error(`Catalog media entry is invalid: ${id}`);
    }
  }
  const actual = {
    movies: catalog.movies.length,
    series: catalog.series.length,
    seasons: catalog.series.reduce((n, show) => n + Object.keys(show.seasons || {}).length, 0),
    episodes: catalog.series.reduce((n, show) => n + Object.values(show.seasons || {}).reduce((m, episodes) => m + (Array.isArray(episodes) ? episodes.length : 0), 0), 0),
  };
  for (const field of Object.keys(actual)) {
    if (Number(catalog.stats?.[field]) !== actual[field]) throw new Error(`Catalog ${field} count is inconsistent`);
  }
  return catalog;
}

module.exports = { CatalogStorageUnavailableError, inspectRoot, scanCatalog, validateCatalog };
