const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const sqlite3 = require('sqlite3');
const { normalizeTitle, extractYear, normalizedKey } = require('./normalize-title');
const { validateMediaItem } = require('./media-validator');
const { dedupeCatalog } = require('./catalog-dedupe');
const { parseMediaIdentity } = require('./media-identity');

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.mpg', '.mpeg', '.3gp']);
const HOME_FILE_MAP = {
  trending: 'trending',
  netflix: 'netflix',
  marvel: 'marvel',
  dc: 'dc',
  disney: 'disney',
  hbo: 'hbo',
  apple: 'apple',
  anime: 'anime',
  koreanDrama: 'korean',
  indian: 'indian',
  horrorNights: 'horror',
  cyberpunkScifi: 'scifi',
  topRated: 'topRated',
  new: 'newItems',
  recentlyAdded: 'newItems',
  allMovies: 'newItems'
};
const SEARCH_SCHEMA_VERSION = '3';

function hash(value, length = 16) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, length);
}

function safeDecode(value) {
  const text = String(value || '');
  try { return decodeURIComponent(text); } catch { return text; }
}

function cleanTitle(value) {
  return normalizeTitle(safeDecode(value));
}

function normalize(value) {
  return normalizedKey(value);
}

function yearFromText(value) {
  return extractYear(value);
}

function imageSize(url, wide) {
  const raw = String(url || '');
  if (!raw.includes('image.tmdb.org/t/p/')) return raw || null;
  return raw.replace(/\/t\/p\/(?:original|w\d+)\//, `/t/p/${wide ? 'w780' : 'w342'}/`);
}

function summaryItem(row, typeOverride) {
  const type = typeOverride || row.type || 'movie';
  const cleanName = normalizeTitle(row.name || row.title || row.filename || '');
  if (!cleanName || cleanName.length < 3) return null;
  return {
    id: row.id,
    name: cleanName,
    title: cleanName,
    poster: imageSize(row.poster || '', false),
    backdrop: imageSize(row.backdrop || row.poster || '', true),
    rating: row.rating || null,
    year: row.year || '',
    genre: row.genre || '',
    type,
    sectionKey: row.sectionKey || '',
    streamAvailable: !!row.streamUrl,
    hasStream: !!row.streamUrl,
    tmdbId: row.tmdbId || null,
    isFtp: row.isFtp !== false,
    isSummary: type === 'tv' || type === 'series',
    seasonCount: row.seasonCount || 0,
    episodeCount: row.episodeCount || 0,
    seasons: (type === 'tv' || type === 'series') ? {} : undefined,
    streamUrl: row.streamUrl || undefined
  };
}

function safeJsonParse(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function fileMtime(file) {
  try {
    const stat = fs.statSync(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return 'missing';
  }
}

function sourceDir(value) {
  try {
    const parsed = new URL(String(value || ''));
    return safeDecode(path.posix.basename(path.posix.dirname(parsed.pathname)));
  } catch {
    return '';
  }
}

function parseEpisode(raw) {
  const text = safeDecode(raw.filename || raw.title || '');
  const source = sourceDir(raw.streamUrl || raw.source);
  const identity = parseMediaIdentity({
    title: raw.title || raw.name || text,
    filename: raw.filename || raw.file || text,
    streamUrl: raw.streamUrl || raw.url || raw.source || '',
    source_path: raw.source_path || raw.sourcePath || raw.path || raw.streamUrl || raw.url || raw.source || '',
  });
  if (identity.kind === 'episode' && identity.seriesName && identity.season !== null) {
    return {
      showName: identity.seriesName,
      season: identity.season,
      episode: identity.episode,
      epTitle: raw.epTitle || identity.episodeTitle || cleanTitle(text) || `Episode ${identity.episode}`,
    };
  }
  if (raw.seriesName && Number(raw.season) >= 0 && Number(raw.episode) >= 0) {
    return {
      showName: cleanTitle(raw.seriesName),
      season: Number(raw.season),
      episode: Number(raw.episode),
      epTitle: raw.epTitle || cleanTitle(text) || `Episode ${raw.episode}`,
    };
  }
  const showGuess = source || cleanTitle(text.replace(/\bS\d{1,2}E\d{1,3}\b/i, ' '));
  const sxe = text.match(/\bS(\d{1,2})E(\d{1,3})\b/i);
  const dash = text.match(/(?:^|\s)-\s*(\d{1,3})(?:\s|$)/);
  const season = sxe ? parseInt(sxe[1], 10) : 1;
  const episode = sxe ? parseInt(sxe[2], 10) : (dash ? parseInt(dash[1], 10) : 0);
  return {
    showName: cleanTitle(showGuess) || 'Unknown Series',
    season: Number.isFinite(season) && season > 0 ? season : 1,
    episode: Number.isFinite(episode) && episode > 0 ? episode : 0,
    epTitle: cleanTitle(text)
  };
}

function createCatalogIndex(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const catalogDir = options.catalogDir || path.join(rootDir, 'catalog');
  const dbFile = options.dbFile || path.join(rootDir, 'data', 'db', 'file-index.db');
  const moviesFile = path.join(catalogDir, 'movies.ndjson');
  const seriesFile = path.join(catalogDir, 'series.ndjson');
  const homeDir = path.join(catalogDir, 'home');
  let db = null;
  let ready = false;
  let building = false;
  let initPromise = null;

  function openDb() {
    if (db) return db;
    db = new sqlite3.Database(dbFile);
    db.configure('busyTimeout', 5000);
    return db;
  }

  function run(sql, params = []) {
    return new Promise((resolve, reject) => {
      openDb().run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  function get(sql, params = []) {
    return new Promise((resolve, reject) => {
      openDb().get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
  }

  function all(sql, params = []) {
    return new Promise((resolve, reject) => {
      openDb().all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    });
  }

  async function currentSourceVersion() {
    return `${SEARCH_SCHEMA_VERSION}|${fileMtime(moviesFile)}|${fileMtime(seriesFile)}`;
  }

  async function createSchema() {
    await run('PRAGMA journal_mode = WAL');
    await run('PRAGMA synchronous = NORMAL');
    await run('PRAGMA temp_store = MEMORY');
    await run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
    const searchSchema = await get('SELECT value FROM meta WHERE key = ?', ['searchSchema']).catch(() => null);
    if (searchSchema?.value !== SEARCH_SCHEMA_VERSION) {
      await run('DROP TABLE IF EXISTS titles_fts');
      await run('INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)', ['searchSchema', SEARCH_SCHEMA_VERSION]);
    }
    await run(`CREATE TABLE IF NOT EXISTS movies (
      id TEXT PRIMARY KEY, name TEXT, title TEXT, filename TEXT, streamUrl TEXT, source TEXT,
      poster TEXT, backdrop TEXT, year TEXT, rating REAL, genre TEXT, overview TEXT,
      language TEXT, tmdbId TEXT, addedAt TEXT, sortYear INTEGER DEFAULT 0, searchText TEXT
    )`);
    await run(`CREATE TABLE IF NOT EXISTS series (
      id TEXT PRIMARY KEY, name TEXT, title TEXT, poster TEXT, backdrop TEXT, year TEXT,
      rating REAL, genre TEXT, overview TEXT, language TEXT, tmdbId TEXT, seasonCount INTEGER DEFAULT 0,
      episodeCount INTEGER DEFAULT 0, firstStreamUrl TEXT, addedAt TEXT, sortYear INTEGER DEFAULT 0,
      searchText TEXT
    )`);
    await run(`CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY, seriesId TEXT, showName TEXT, season INTEGER, episode INTEGER,
      epTitle TEXT, filename TEXT, streamUrl TEXT, source TEXT, addedAt TEXT, searchText TEXT
    )`);
    await run('CREATE VIRTUAL TABLE IF NOT EXISTS titles_fts USING fts5(id, kind, name, searchText)');
    await run('CREATE INDEX IF NOT EXISTS idx_movies_sort ON movies(sortYear DESC, rating DESC)');
    await run('CREATE INDEX IF NOT EXISTS idx_series_sort ON series(sortYear DESC, rating DESC)');
    await run('CREATE INDEX IF NOT EXISTS idx_episodes_series ON episodes(seriesId, season, episode)');
  }

async function insertMovie(stmt, ftsStmt, raw) {
    const streamUrl = raw.streamUrl || raw.url || '';
    const filename = safeDecode(raw.filename || path.posix.basename(streamUrl));
    if (!streamUrl || !VIDEO_EXTS.has(path.extname(filename).toLowerCase())) return;
    const valid = validateMediaItem({ ...raw, filename, streamUrl }, { kind: 'movie' });
    if (!valid.ok) return;
    const name = cleanTitle(raw.name || raw.title || filename);
    if (!name || /^url\?q=/i.test(name)) return;
    const id = raw.id ? String(raw.id) : `idx_m_${hash(streamUrl || filename)}`;
    const year = raw.year || valid.year || yearFromText(`${filename} ${raw.title || ''}`);
    const searchText = [name, raw.title, raw.genre, raw.overview, raw.language, raw.director, year].filter(Boolean).join(' ');
    await stmt.run([
      id, name, raw.title || name, filename, streamUrl, raw.source || '', raw.poster || null, raw.backdrop || raw.poster || null,
      year, Number(raw.rating || raw.vote_average || 0) || null, raw.genre || '', raw.overview || '', raw.language || '',
      raw.tmdbId || null, raw.discoveredAt || raw.addedAt || '', parseInt(year, 10) || 0, searchText
    ]);
    await ftsStmt.run([id, 'movie', name, searchText]);
  }

  async function buildFromNdjson() {
    building = true;
    await createSchema();
    const version = await currentSourceVersion();
    const meta = await get('SELECT value FROM meta WHERE key = ?', ['sourceVersion']).catch(() => null);
    const count = await get('SELECT (SELECT COUNT(*) FROM movies) AS movies, (SELECT COUNT(*) FROM series) AS series').catch(() => null);
    if (meta?.value === version && ((count?.movies || 0) || (count?.series || 0))) {
      ready = true;
      building = false;
      return;
    }

    await run('BEGIN IMMEDIATE');
    try {
      await run('DELETE FROM movies');
      await run('DELETE FROM series');
      await run('DELETE FROM episodes');
      await run('DELETE FROM titles_fts');
      const movieStmt = await prepare(`INSERT OR REPLACE INTO movies
        (id,name,title,filename,streamUrl,source,poster,backdrop,year,rating,genre,overview,language,tmdbId,addedAt,sortYear,searchText)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const ftsStmt = await prepare('INSERT INTO titles_fts (id,kind,name,searchText) VALUES (?,?,?,?)');
      await streamMovies(movieStmt, ftsStmt);
      await movieStmt.finalize();

      const episodeStmt = await prepare(`INSERT OR REPLACE INTO episodes
        (id,seriesId,showName,season,episode,epTitle,filename,streamUrl,source,addedAt,searchText)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      const seriesAgg = new Map();
      await streamEpisodes(episodeStmt, seriesAgg);
      await episodeStmt.finalize();

      const seriesStmt = await prepare(`INSERT OR REPLACE INTO series
        (id,name,title,poster,backdrop,year,rating,genre,overview,language,tmdbId,seasonCount,episodeCount,firstStreamUrl,addedAt,sortYear,searchText)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const show of seriesAgg.values()) {
        const seasonCount = show.seasons.size;
        const searchText = [show.name, show.source, show.year].filter(Boolean).join(' ');
        await seriesStmt.run([
          show.id, show.name, show.name, null, null, show.year || '', null, '', '', '', null,
          seasonCount, show.episodeCount, show.firstStreamUrl, show.addedAt || '', parseInt(show.year, 10) || 0, searchText
        ]);
        await ftsStmt.run([show.id, 'series', show.name, searchText]);
      }
      await seriesStmt.finalize();
      await ftsStmt.finalize();
      await run('INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)', ['sourceVersion', version]);
      await run('INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)', ['builtAt', new Date().toISOString()]);
      await run('COMMIT');
      ready = true;
    } catch (err) {
      await run('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      building = false;
    }
  }

  function prepare(sql) {
    return new Promise((resolve, reject) => {
      const stmt = openDb().prepare(sql, err => {
        if (err) reject(err);
        else {
          stmt.run = params => new Promise((res, rej) => stmt.constructor.prototype.run.call(stmt, params, e => e ? rej(e) : res()));
          stmt.finalize = () => new Promise((res, rej) => stmt.constructor.prototype.finalize.call(stmt, e => e ? rej(e) : res()));
          resolve(stmt);
        }
      });
    });
  }

  async function streamMovies(movieStmt, ftsStmt) {
    if (!fs.existsSync(moviesFile)) return;
    const rl = readline.createInterface({ input: fs.createReadStream(moviesFile), crlfDelay: Infinity });
    let pending = [];
    for await (const line of rl) {
      const raw = safeJsonParse(line);
      if (!raw) continue;
      pending.push(insertMovie(movieStmt, ftsStmt, raw));
      if (pending.length >= 250) {
        await Promise.all(pending);
        pending = [];
      }
    }
    if (pending.length) await Promise.all(pending);
  }

  async function streamEpisodes(episodeStmt, seriesAgg) {
    if (!fs.existsSync(seriesFile)) return;
    const rl = readline.createInterface({ input: fs.createReadStream(seriesFile), crlfDelay: Infinity });
    let pending = [];
    for await (const line of rl) {
      const raw = safeJsonParse(line);
      if (!raw) continue;
      const streamUrl = raw.streamUrl || raw.url || '';
      const filename = safeDecode(raw.filename || path.posix.basename(streamUrl));
      if (!streamUrl || !VIDEO_EXTS.has(path.extname(filename).toLowerCase())) continue;
      const valid = validateMediaItem({ ...raw, filename, streamUrl }, { kind: 'episode' });
      if (!valid.ok) continue;
      const parsed = parseEpisode(raw);
      const seriesId = `idx_s_${hash(normalize(parsed.showName) || parsed.showName)}`;
      const episodeId = `idx_e_${hash(streamUrl || filename)}`;
      const year = yearFromText(`${raw.source || ''} ${filename}`);
      if (!seriesAgg.has(seriesId)) {
        seriesAgg.set(seriesId, {
          id: seriesId,
          name: parsed.showName,
          seasons: new Set(),
          episodeCount: 0,
          firstStreamUrl: streamUrl,
          source: raw.source || '',
          addedAt: raw.discoveredAt || raw.addedAt || '',
          year
        });
      }
      const show = seriesAgg.get(seriesId);
      show.seasons.add(parsed.season);
      show.episodeCount += 1;
      const searchText = [parsed.showName, parsed.epTitle, raw.source].filter(Boolean).join(' ');
      pending.push(episodeStmt.run([
        episodeId, seriesId, parsed.showName, parsed.season, parsed.episode, parsed.epTitle,
        filename, streamUrl, raw.source || '', raw.discoveredAt || raw.addedAt || '', searchText
      ]));
      if (pending.length >= 250) {
        await Promise.all(pending);
        pending = [];
      }
    }
    if (pending.length) await Promise.all(pending);
  }

  async function init() {
    if (initPromise) return initPromise;
    initPromise = buildFromNdjson().catch(err => {
      ready = false;
      building = false;
      console.warn('[CatalogIndex] SQLite index unavailable:', err.message);
    });
    return initPromise;
  }

  function initBackground() {
    setImmediate(() => init());
  }

  function readyForRead() {
    if (ready) return true;
    if (!building) init().catch(() => {});
    return false;
  }

  function pageParams(query, fallbackLimit = 60) {
    const rawPage = parseInt(query.page || '1', 10);
    const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
    const limit = Math.min(120, Math.max(1, parseInt(query.limit || String(fallbackLimit), 10) || fallbackLimit));
    return { page, limit, offset: (page - 1) * limit };
  }

  async function pagedMovies(query = {}) {
    if (!readyForRead()) return null;
    const { page, limit, offset } = pageParams(query);
    const rows = await all('SELECT * FROM movies ORDER BY sortYear DESC, rating DESC, name LIMIT ? OFFSET ?', [limit, offset]);
    const total = await get('SELECT COUNT(*) AS count FROM movies');
    return {
      movies: dedupeCatalog(rows.map(row => summaryItem({ ...row, type: 'movie', isFtp: true })).filter(Boolean), { kind: 'movie', allowMetadataOnly: true }),
      total: total?.count || 0,
      page,
      limit,
      pages: Math.ceil((total?.count || 0) / limit)
    };
  }

  async function pagedSeries(query = {}) {
    if (!readyForRead()) return null;
    const { page, limit, offset } = pageParams(query);
    const rows = await all('SELECT * FROM series ORDER BY sortYear DESC, rating DESC, name LIMIT ? OFFSET ?', [limit, offset]);
    const total = await get('SELECT COUNT(*) AS count FROM series');
    const items = dedupeCatalog(rows.map(row => summaryItem({ ...row, type: 'tv', streamUrl: row.firstStreamUrl })).filter(Boolean), { kind: 'series', allowMetadataOnly: true });
    return { items, series: items, total: total?.count || 0, page, limit, pages: Math.ceil((total?.count || 0) / limit) };
  }

  async function search(query = {}) {
    if (!readyForRead()) return null;
    const q = normalizedKey(query.q || '');
    const { page, limit, offset } = pageParams(query, 48);
    if (!q) return { items: [], total: 0, page, pages: 0 };
    const fts = q.split(/\s+/).filter(Boolean).map(term => `${term.replace(/["']/g, '')}*`).join(' ');
    const rows = await all(`SELECT f.id, f.kind, bm25(titles_fts) AS rank
      FROM titles_fts f WHERE titles_fts MATCH ? ORDER BY rank LIMIT ? OFFSET ?`, [fts, limit, offset]);
    const total = await get('SELECT COUNT(*) AS count FROM titles_fts WHERE titles_fts MATCH ?', [fts]).catch(() => ({ count: 0 }));
    const items = [];
    for (const row of rows) {
      if (row.kind === 'movie') {
        const movie = await get('SELECT * FROM movies WHERE id = ?', [row.id]);
        if (movie) {
          const item = summaryItem({ ...movie, type: 'movie', isFtp: true });
          if (item) items.push(item);
        }
      } else if (row.kind === 'series') {
        const show = await get('SELECT * FROM series WHERE id = ?', [row.id]);
        if (show) {
          const item = summaryItem({ ...show, type: 'tv', streamUrl: show.firstStreamUrl });
          if (item) items.push(item);
        }
      }
    }
    return { items, total: total?.count || items.length, page, limit, pages: Math.ceil((total?.count || items.length) / limit) };
  }

  async function title(id) {
    if (!readyForRead()) return null;
    const cleanId = String(id || '');
    let row = await get('SELECT * FROM movies WHERE id = ?', [cleanId]);
    if (row) {
      const item = summaryItem({ ...row, type: 'movie' });
      return item ? { ...item, streamUrl: row.streamUrl, overview: row.overview } : null;
    }
    row = await get('SELECT * FROM series WHERE id = ?', [cleanId]);
    if (!row) return null;
    const episodes = await all('SELECT season, episode, epTitle, filename, streamUrl, id AS streamId FROM episodes WHERE seriesId = ? ORDER BY season, episode, filename LIMIT 1000', [cleanId]);
    const seasons = {};
    for (const ep of episodes) {
      const s = ep.season || 1;
      if (!seasons[s]) seasons[s] = [];
      seasons[s].push(ep);
    }
    const item = summaryItem({ ...row, type: 'tv', streamUrl: row.firstStreamUrl });
    return item ? { ...item, seasons, overview: row.overview } : null;
  }

  function readHomeFile(name, limit) {
    const file = path.join(homeDir, `${name}.json`);
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return (Array.isArray(data) ? data : []).slice(0, limit).map(item => summaryItem({
        id: item.id || `home_${hash(`${name}:${item.title || item.name}`)}`,
        name: item.name || item.title,
        title: item.title || item.name,
        poster: item.poster,
        backdrop: item.backdrop,
        year: item.year,
        rating: item.rating,
        type: item.type === 'series' ? 'tv' : item.type || 'movie',
        sectionKey: name
      }, item.type === 'series' ? 'tv' : item.type || 'movie')).filter(Boolean);
    } catch {
      return [];
    }
  }

  async function homeFeed(limit = 36, rowSpecs = []) {
    const rows = [];
    for (const spec of rowSpecs) {
      const rowId = spec.rowId || spec[0];
      const key = spec.key || spec[1];
      const fileKey = HOME_FILE_MAP[key] || key;
      const items = readHomeFile(fileKey, limit);
      if (items.length) rows.push({ rowId, key, items, total: items.length });
    }
    return {
      generatedAt: Date.now(),
      hero: (rows.find(r => r.rowId === 'newRow')?.items || rows[0]?.items || []).slice(0, 10),
      rows
    };
  }

  async function section(key, query = {}) {
    const { page, limit, offset } = pageParams(query, 60);
    const fileKey = HOME_FILE_MAP[key] || key;
    const allItems = readHomeFile(fileKey, offset + limit + 1);
    const items = allItems.slice(offset, offset + limit);
    return { key, items, total: Math.max(allItems.length, offset + items.length), page: page - 1, pages: items.length < limit ? page : page + 1 };
  }

  function status() {
    return { ready, building, dbFile, moviesFile, seriesFile };
  }

  return { init, initBackground, status, pagedMovies, pagedSeries, search, title, homeFeed, section };
}

module.exports = { createCatalogIndex };
