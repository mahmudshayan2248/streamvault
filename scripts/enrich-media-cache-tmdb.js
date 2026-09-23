#!/usr/bin/env node
'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');
const { extractReleaseYear, normalizedKey, parseMediaIdentity } = require('../lib/media-identity');

try { require('dotenv').config({ path: path.join(process.cwd(), '.env'), quiet: true }); } catch (_) {}
try { require('dotenv').config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true }); } catch (_) {}

const TMDB_IMG = 'https://image.tmdb.org/t/p';

function parseArgs(argv) {
  const args = {
    apply: false,
    mode: 'all',
    limit: 100,
    offset: 0,
    includeMisses: false,
    sleepMs: 250,
    maxEpisodesPerSeries: 10000,
  };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--include-misses') args.includeMisses = true;
    else if (arg.startsWith('--mode=')) args.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--limit=')) args.limit = Math.max(1, Number(arg.slice('--limit='.length)) || args.limit);
    else if (arg.startsWith('--offset=')) args.offset = Math.max(0, Number(arg.slice('--offset='.length)) || 0);
    else if (arg.startsWith('--sleep-ms=')) args.sleepMs = Math.max(0, Number(arg.slice('--sleep-ms='.length)) || 0);
    else if (arg.startsWith('--max-episodes-per-series=')) args.maxEpisodesPerSeries = Math.max(1, Number(arg.slice('--max-episodes-per-series='.length)) || args.maxEpisodesPerSeries);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['all', 'movies', 'series', 'episodes'].includes(args.mode)) throw new Error('--mode must be all, movies, series, or episodes');
  return args;
}

function usage() {
  return `Usage: node scripts/enrich-media-cache-tmdb.js [--mode=all|movies|series|episodes] [--limit=100] [--offset=0] [--include-misses] [--apply]\n\nDry-run is default. --apply is required to write DB changes. Requires DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD and TMDB_TOKEN/TMDB_BEARER_TOKEN, or the existing server.js TMDB_TOKEN constant.`;
}

function dbConfig() {
  if (process.env.DATABASE_URL) return { uri: process.env.DATABASE_URL };
  const host = process.env.DB_HOST || process.env.MYSQL_HOST;
  const database = process.env.DB_NAME || process.env.MYSQL_DATABASE;
  const user = process.env.DB_USER || process.env.MYSQL_USER;
  const password = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '';
  const port = Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306) || 3306;
  if (!host || !database || !user) return null;
  return { host, port, database, user, password, multipleStatements: false };
}

async function connect() {
  let mysql;
  try { mysql = require('mysql2/promise'); }
  catch (_) { throw new Error('mysql2 is required. Run npm install before using this script.'); }
  const config = dbConfig();
  if (!config) throw new Error('Missing database configuration. Set DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD.');
  return config.uri
    ? mysql.createConnection({ uri: config.uri, multipleStatements: false })
    : mysql.createConnection(config);
}

function serverTmdbToken() {
  try {
    const serverPath = path.join(process.cwd(), 'server.js');
    const source = fs.readFileSync(serverPath, 'utf8');
    return source.match(/const\s+TMDB_TOKEN\s*=\s*['"]([^'"]+)['"]/m)?.[1] || '';
  } catch (_) {
    return '';
  }
}

function tmdbToken() {
  return process.env.TMDB_TOKEN || process.env.TMDB_BEARER_TOKEN || process.env.TMDB_READ_TOKEN || serverTmdbToken() || '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function tmdbImage(size, value) {
  return value ? `${TMDB_IMG}/${size}${value}` : '';
}

function cleanYear(value) {
  return String(value || '').match(/(?:19|20)\d{2}/)?.[0] || '';
}

function titleKey(value) {
  return normalizedKey(value || '');
}

function scoreCandidate(queryTitle, queryYear, candidate, type) {
  const wanted = titleKey(queryTitle);
  const foundTitle = candidate?.title || candidate?.name || '';
  const originalTitle = candidate?.original_title || candidate?.original_name || '';
  const found = titleKey(foundTitle);
  const original = titleKey(originalTitle);
  if (!wanted || (!found && !original)) return { ok: false, score: 0, reason: 'empty-title' };

  let score = 0;
  if (wanted === found || wanted === original) score += 1000;
  else if (found && (found.startsWith(wanted + ' ') || wanted.startsWith(found + ' '))) score += 650;
  else if (original && (original.startsWith(wanted + ' ') || wanted.startsWith(original + ' '))) score += 600;
  else return { ok: false, score, reason: 'title-mismatch', foundTitle };

  const date = type === 'tv' ? candidate?.first_air_date : candidate?.release_date;
  const foundYear = cleanYear(date);
  const year = cleanYear(queryYear);
  if (year && foundYear) {
    if (year === foundYear) score += 250;
    else if (Math.abs(Number(year) - Number(foundYear)) <= 1) score += 80;
    else score -= 300;
  } else if (!year || !foundYear) {
    score += 25;
  }
  if (candidate?.poster_path) score += 60;
  if (candidate?.overview) score += 25;
  score += Math.min(50, Number(candidate?.popularity || 0) / 2);
  const ok = score >= (year ? 920 : 1000);
  return { ok, score, reason: ok ? 'verified' : 'low-confidence', foundTitle, foundYear };
}

function requestJson(apiPath, token, attempt = 1) {
  return new Promise((resolve, reject) => {
    const url = apiPath.startsWith('http') ? apiPath : `https://api.themoviedb.org/3${apiPath}`;
    const req = https.get(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      timeout: 12000,
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', async () => {
        if (res.statusCode === 429 && attempt <= 4) {
          const retryAfter = Math.min(15000, Math.max(1000, Number(res.headers['retry-after'] || 2) * 1000));
          await sleep(retryAfter);
          try { resolve(await requestJson(apiPath, token, attempt + 1)); }
          catch (error) { reject(error); }
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`TMDB HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); }
        catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('TMDB timeout')));
    req.on('error', reject);
  });
}

async function tableExists(conn, table) {
  const [rows] = await conn.query('SHOW TABLES LIKE ?', [table]);
  return rows.length > 0;
}

async function columns(conn, table) {
  if (!await tableExists(conn, table)) return new Set();
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
  return new Set(rows.map(row => row.Field));
}

function col(cols, name) {
  return cols.has(name) ? `\`${name}\`` : 'NULL';
}

function nonempty(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function isLocalPoster(value) {
  return /^https?:\/\/(?:www\.)?streamvault\.fit\/cache\/posters\//i.test(String(value || ''))
    || /^\/cache\/posters\//i.test(String(value || ''));
}

function metadataPatch(row, mapping) {
  const patch = {};
  for (const [column, value] of Object.entries(mapping)) {
    if (!nonempty(value)) continue;
    if (column === 'remote_poster_url' && nonempty(row.remote_poster_url)) continue;
    if (column === 'poster_url' && isLocalPoster(row.poster_url)) continue;
    if (['overview', 'year', 'rating', 'genre', 'runtime', 'director', 'language', 'backdrop_url', 'episode_title', 'source'].includes(column) && nonempty(row[column])) continue;
    if (column === 'tmdb_id' && nonempty(row.tmdb_id) && Number(row.tmdb_id) !== 0) continue;
    patch[column] = value;
  }
  return patch;
}

async function updateRow(conn, table, keyColumn, keyValue, patch, cols, apply) {
  const entries = Object.entries(patch).filter(([name]) => cols.has(name));
  if (!entries.length) return { written: false, columns: [] };
  if (!apply) return { written: false, columns: entries.map(([name]) => name) };
  const sets = entries.map(([name]) => `\`${name}\` = ?`).join(', ');
  const values = entries.map(([, value]) => value);
  values.push(keyValue);
  const updatedAt = cols.has('updated_at') ? ', `updated_at` = CURRENT_TIMESTAMP' : '';
  await conn.query(`UPDATE \`${table}\` SET ${sets}${updatedAt} WHERE \`${keyColumn}\` = ?`, values);
  return { written: true, columns: entries.map(([name]) => name) };
}

async function searchTmdb(token, title, year, type) {
  const endpoint = type === 'tv' ? '/search/tv' : '/search/movie';
  const yearParam = year ? `&${type === 'tv' ? 'first_air_date_year' : 'year'}=${encodeURIComponent(year)}` : '';
  const first = await requestJson(`${endpoint}?query=${encodeURIComponent(title)}${yearParam}&include_adult=false&language=en-US&page=1`, token);
  let results = Array.isArray(first?.results) ? first.results : [];
  let ranked = results
    .map(candidate => ({ candidate, confidence: scoreCandidate(title, year, candidate, type) }))
    .filter(hit => hit.confidence.ok)
    .sort((a, b) => b.confidence.score - a.confidence.score);
  if (!ranked.length && year) {
    const fallback = await requestJson(`${endpoint}?query=${encodeURIComponent(title)}&include_adult=false&language=en-US&page=1`, token);
    results = Array.isArray(fallback?.results) ? fallback.results : [];
    ranked = results
      .map(candidate => ({ candidate, confidence: scoreCandidate(title, '', candidate, type) }))
      .filter(hit => hit.confidence.ok)
      .sort((a, b) => b.confidence.score - a.confidence.score);
  }
  if (!ranked.length) return null;
  const top = ranked[0];
  const ambiguous = ranked[1] && Math.abs(top.confidence.score - ranked[1].confidence.score) < 80;
  if (ambiguous) return { ambiguous: true, ranked: ranked.slice(0, 3) };
  return { ambiguous: false, item: top.candidate, confidence: top.confidence };
}

function moviePatch(row, match) {
  const item = match.item;
  return metadataPatch(row, {
    tmdb_id: item.id,
    remote_poster_url: tmdbImage('w500', item.poster_path),
    backdrop_url: tmdbImage('w1280', item.backdrop_path || item.poster_path),
    overview: item.overview || '',
    year: cleanYear(item.release_date) || row.year,
    rating: item.vote_average || '',
    language: item.original_language || '',
    lookup_status: item.poster_path ? 'ok' : 'ok_no_poster',
  });
}

function seriesPatch(row, match) {
  const item = match.item;
  return metadataPatch(row, {
    tmdb_id: item.id,
    remote_poster_url: tmdbImage('w500', item.poster_path),
    backdrop_url: tmdbImage('w1280', item.backdrop_path || item.poster_path),
    overview: item.overview || '',
    year: cleanYear(item.first_air_date) || row.year,
    rating: item.vote_average || '',
    language: item.original_language || '',
    lookup_status: item.poster_path ? 'ok' : 'ok_no_poster',
  });
}

function episodePatch(row, tmdbEpisode) {
  const still = tmdbImage('w500', tmdbEpisode?.still_path);
  return metadataPatch(row, {
    tmdb_id: tmdbEpisode?.id || '',
    episode_title: tmdbEpisode?.name || '',
    remote_poster_url: still,
    source: still ? 'tmdb' : 'tmdb-no-still',
  });
}

async function fetchMovieRows(conn, limit, offset, includeMisses) {
  const cols = await columns(conn, 'media_cache_movies');
  if (!cols.size) return { cols, rows: [] };
  const missClause = includeMisses ? " OR m.`lookup_status` IN ('miss','ambiguous','network_error','temporary_error')" : '';
  const [rows] = await conn.query(`
    SELECT
      ${col(cols, 'id')} AS id,
      ${col(cols, 'media_key')} AS media_key,
      ${col(cols, 'stream_id')} AS stream_id,
      ${col(cols, 'title')} AS title,
      ${col(cols, 'year')} AS year,
      ${col(cols, 'tmdb_id')} AS tmdb_id,
      ${col(cols, 'poster_url')} AS poster_url,
      ${col(cols, 'remote_poster_url')} AS remote_poster_url,
      ${col(cols, 'backdrop_url')} AS backdrop_url,
      ${col(cols, 'overview')} AS overview,
      ${col(cols, 'rating')} AS rating,
      ${col(cols, 'language')} AS language,
      ${col(cols, 'lookup_status')} AS lookup_status,
      ${col(cols, 'repair_status')} AS repair_status
    FROM media_cache_movies m
    WHERE (
      m.${cols.has('tmdb_id') ? '`tmdb_id` IS NULL OR m.`tmdb_id` = 0' : '`id` IS NOT NULL'}
      ${cols.has('remote_poster_url') ? " OR m.`remote_poster_url` IS NULL OR m.`remote_poster_url` = ''" : ''}
      ${cols.has('lookup_status') ? missClause : ''}
    )
    ${cols.has('repair_status') ? "AND (m.`repair_status` IS NULL OR m.`repair_status` = '' OR m.`repair_status` NOT LIKE 'episode_%')" : ''}
    ORDER BY m.${cols.has('id') ? '`id`' : '`media_key`'}
    LIMIT ? OFFSET ?
  `, [limit, offset]);
  return { cols, rows };
}

async function fetchSeriesRows(conn, limit, offset, includeMisses, episodesOnly = false) {
  const cols = await columns(conn, 'media_cache_series');
  const epCols = await columns(conn, 'media_cache_episodes');
  if (!cols.size) return { cols, epCols, rows: [] };
  if (episodesOnly && epCols.size && cols.has('series_key') && epCols.has('series_key')) {
    const [rows] = await conn.query(`
      SELECT DISTINCT s.*
      FROM media_cache_series s
      JOIN media_cache_episodes e ON e.\`series_key\` = s.\`series_key\`
      WHERE s.\`tmdb_id\` IS NOT NULL AND s.\`tmdb_id\` <> 0
        AND (e.\`tmdb_id\` IS NULL OR e.\`tmdb_id\` = 0 OR e.\`remote_poster_url\` IS NULL OR e.\`remote_poster_url\` = '')
      ORDER BY s.\`series_key\`
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    return { cols, epCols, rows };
  }
  const missClause = includeMisses ? " OR s.`lookup_status` IN ('miss','ambiguous','network_error','temporary_error')" : '';
  const [rows] = await conn.query(`
    SELECT * FROM media_cache_series s
    WHERE (
      ${cols.has('tmdb_id') ? "s.`tmdb_id` IS NULL OR s.`tmdb_id` = 0" : '1=1'}
      ${cols.has('remote_poster_url') ? " OR s.`remote_poster_url` IS NULL OR s.`remote_poster_url` = ''" : ''}
      ${cols.has('lookup_status') ? missClause : ''}
    )
    ORDER BY s.${cols.has('series_key') ? '`series_key`' : '`series_name`'}
    LIMIT ? OFFSET ?
  `, [limit, offset]);
  return { cols, epCols, rows };
}

async function fetchEpisodesForSeries(conn, seriesRow, maxEpisodes) {
  const cols = await columns(conn, 'media_cache_episodes');
  if (!cols.size || !cols.has('series_key')) return { cols, rows: [] };
  const [rows] = await conn.query(`
    SELECT * FROM media_cache_episodes
    WHERE \`series_key\` = ?
      AND (\`tmdb_id\` IS NULL OR \`tmdb_id\` = 0 OR \`remote_poster_url\` IS NULL OR \`remote_poster_url\` = '')
    ORDER BY \`season_num\`, \`episode_num\`
    LIMIT ?
  `, [seriesRow.series_key, maxEpisodes]);
  return { cols, rows };
}

async function processMovies(conn, token, args, totals) {
  const { cols, rows } = await fetchMovieRows(conn, args.limit, args.offset, args.includeMisses);
  for (const row of rows) {
    totals.movies.scanned++;
    const identity = parseMediaIdentity({ title: row.title, source_path: row.stream_id || '', streamUrl: row.stream_id || '' });
    if (identity.kind === 'episode' && identity.confidence !== 'low') {
      totals.movies.skippedEpisodeLike++;
      const patch = cols.has('repair_status') ? { repair_status: 'episode_like' } : {};
      await updateRow(conn, 'media_cache_movies', cols.has('id') ? 'id' : 'media_key', cols.has('id') ? row.id : row.media_key, patch, cols, args.apply);
      continue;
    }
    const year = extractReleaseYear(`${row.title || ''} ${row.year || ''}`) || cleanYear(row.year);
    const match = await searchTmdb(token, row.title, year, 'movie');
    await sleep(args.sleepMs);
    if (!match) {
      totals.movies.miss++;
      const patch = cols.has('lookup_status') ? { lookup_status: 'miss' } : {};
      await updateRow(conn, 'media_cache_movies', cols.has('id') ? 'id' : 'media_key', cols.has('id') ? row.id : row.media_key, patch, cols, args.apply);
      continue;
    }
    if (match.ambiguous) {
      totals.movies.ambiguous++;
      const patch = cols.has('lookup_status') ? { lookup_status: 'ambiguous' } : {};
      await updateRow(conn, 'media_cache_movies', cols.has('id') ? 'id' : 'media_key', cols.has('id') ? row.id : row.media_key, patch, cols, args.apply);
      continue;
    }
    const patch = moviePatch(row, match);
    patch.lookup_status = patch.lookup_status || 'ok';
    const result = await updateRow(conn, 'media_cache_movies', cols.has('id') ? 'id' : 'media_key', cols.has('id') ? row.id : row.media_key, patch, cols, args.apply);
    totals.movies.matched++;
    totals.movies.columnsUpdated += result.columns.length;
  }
}

async function processSeriesAndEpisodes(conn, token, args, totals, episodesOnly = false) {
  const { cols, epCols, rows } = await fetchSeriesRows(conn, args.limit, args.offset, args.includeMisses, episodesOnly);
  const seasonCache = new Map();
  for (const row of rows) {
    totals.series.scanned++;
    let tmdbId = row.tmdb_id;
    let matchedSeries = null;
    if (!tmdbId && !episodesOnly) {
      const year = extractReleaseYear(`${row.series_name || ''} ${row.year || ''}`) || cleanYear(row.year);
      const match = await searchTmdb(token, row.series_name, year, 'tv');
      await sleep(args.sleepMs);
      if (!match) {
        totals.series.miss++;
        const patch = cols.has('lookup_status') ? { lookup_status: 'miss' } : {};
        await updateRow(conn, 'media_cache_series', 'series_key', row.series_key, patch, cols, args.apply);
        continue;
      }
      if (match.ambiguous) {
        totals.series.ambiguous++;
        const patch = cols.has('lookup_status') ? { lookup_status: 'ambiguous' } : {};
        await updateRow(conn, 'media_cache_series', 'series_key', row.series_key, patch, cols, args.apply);
        continue;
      }
      matchedSeries = match.item;
      tmdbId = matchedSeries.id;
      const patch = seriesPatch(row, match);
      patch.lookup_status = patch.lookup_status || 'ok';
      const result = await updateRow(conn, 'media_cache_series', 'series_key', row.series_key, patch, cols, args.apply);
      totals.series.matched++;
      totals.series.columnsUpdated += result.columns.length;
    }

    if (!tmdbId) continue;
    const { rows: episodes } = await fetchEpisodesForSeries(conn, row, args.maxEpisodesPerSeries);
    const bySeason = new Map();
    for (const ep of episodes) {
      const season = Number(ep.season_num);
      if (!Number.isFinite(season)) continue;
      if (!bySeason.has(season)) bySeason.set(season, []);
      bySeason.get(season).push(ep);
    }
    for (const [season, eps] of bySeason) {
      const cacheKey = `${tmdbId}|${season}`;
      let seasonData = seasonCache.get(cacheKey);
      if (!seasonData) {
        seasonData = await requestJson(`/tv/${encodeURIComponent(tmdbId)}/season/${encodeURIComponent(season)}?language=en-US`, token).catch(error => ({ error }));
        seasonCache.set(cacheKey, seasonData);
        await sleep(args.sleepMs);
      }
      if (seasonData.error) {
        totals.episodes.errors++;
        continue;
      }
      const tmdbEpisodes = new Map((Array.isArray(seasonData.episodes) ? seasonData.episodes : []).map(ep => [Number(ep.episode_number), ep]));
      for (const ep of eps) {
        totals.episodes.scanned++;
        const tmdbEp = tmdbEpisodes.get(Number(ep.episode_num));
        if (!tmdbEp) {
          totals.episodes.miss++;
          continue;
        }
        const patch = episodePatch(ep, tmdbEp);
        const result = await updateRow(conn, 'media_cache_episodes', 'episode_key', ep.episode_key, patch, epCols, args.apply);
        totals.episodes.matched++;
        if (!tmdbEp.still_path) totals.episodes.noStill++;
        totals.episodes.columnsUpdated += result.columns.length;
      }
    }
  }
}

function emptyTotals() {
  return {
    dryRun: true,
    movies: { scanned: 0, matched: 0, miss: 0, ambiguous: 0, skippedEpisodeLike: 0, columnsUpdated: 0 },
    series: { scanned: 0, matched: 0, miss: 0, ambiguous: 0, columnsUpdated: 0 },
    episodes: { scanned: 0, matched: 0, miss: 0, noStill: 0, errors: 0, columnsUpdated: 0 },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const token = tmdbToken();
  if (!token) throw new Error('Missing TMDB_TOKEN/TMDB_BEARER_TOKEN/TMDB_READ_TOKEN.');
  const conn = await connect();
  const totals = emptyTotals();
  totals.dryRun = !args.apply;
  totals.mode = args.mode;
  totals.limit = args.limit;
  totals.offset = args.offset;
  try {
    if (args.mode === 'all' || args.mode === 'movies') await processMovies(conn, token, args, totals);
    if (args.mode === 'all' || args.mode === 'series') await processSeriesAndEpisodes(conn, token, args, totals, false);
    if (args.mode === 'episodes') await processSeriesAndEpisodes(conn, token, args, totals, true);
    console.log(JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), ...totals }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
