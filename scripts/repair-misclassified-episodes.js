#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env.local'), override: false });

const { parseMediaIdentity, stableEpisodeKey, stableSeriesKey } = require('../lib/media-identity');

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const APPLY = process.argv.includes('--apply');
const LIMIT = Math.max(0, Number(arg('limit', '0')) || 0);
const INCLUDE_MEDIUM = process.argv.includes('--include-medium');
const SAMPLE_LIMIT = Math.max(1, Number(arg('samples', '20')) || 20);
const STATUS_FILTER = arg('status', 'episode_like');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.DB_HOST || process.env.MYSQL_HOST;
  const name = process.env.DB_NAME || process.env.MYSQL_DATABASE;
  const user = process.env.DB_USER || process.env.MYSQL_USER;
  const pass = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD;
  const port = process.env.DB_PORT || process.env.MYSQL_PORT || '3306';
  if (!host || !name || !user) return '';
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(pass || '')}@${host}:${port}/${encodeURIComponent(name)}`;
}

async function connect() {
  let mysql;
  try { mysql = require('mysql2/promise'); }
  catch (error) {
    console.error('mysql2 is required. Run npm install before using this repair script.');
    process.exit(2);
  }
  const databaseUrl = loadDatabaseUrl();
  if (!databaseUrl) {
    console.error('Missing database configuration. Set DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD.');
    process.exit(2);
  }
  return mysql.createConnection({ uri: databaseUrl, multipleStatements: false, namedPlaceholders: false });
}

async function columns(conn, table) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
  return new Set(rows.map(row => row.Field));
}

function has(cols, name) { return cols.has(name); }
function col(cols, name, expr = `NULL AS ${name}`) { return has(cols, name) ? `m.\`${name}\`` : expr; }
function invCol(cols, name, expr = `NULL AS ${name}`) { return has(cols, name) ? `inv.\`${name}\`` : expr; }

function compactList(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function inventoryScore(row) {
  const source = String(row.source_path || '');
  let score = 0;
  if (/^https?:/i.test(source) || source.includes('/') || source.includes('\\')) score += 1000;
  if (/Season[ ._-]*\d{1,4}|S\d{1,4}E\d{1,3}|\d{1,3}x\d{1,3}|TV[ ._-]*(?:Series|Documentary)/i.test(source)) score += 500;
  if (row.media_type === 'episode') score += 100;
  score += Math.min(source.length, 2000) / 1000;
  return score;
}

function chooseInventory(current, candidate) {
  if (!current) return candidate;
  const currentScore = inventoryScore(current);
  const candidateScore = inventoryScore(candidate);
  if (candidateScore !== currentScore) return candidateScore > currentScore ? candidate : current;
  return String(candidate.inventory_key || '').localeCompare(String(current.inventory_key || '')) < 0 ? candidate : current;
}

async function queryInventoryBy(conn, field, values, invCols) {
  if (!values.length || !has(invCols, field)) return [];
  const selected = [
    invCol(invCols, 'inventory_key', 'NULL AS inventory_key').replace(/inv\./g, ''),
    invCol(invCols, 'stream_id', 'NULL AS stream_id').replace(/inv\./g, ''),
    invCol(invCols, 'title', 'NULL AS title').replace(/inv\./g, ''),
    invCol(invCols, 'source_path', 'NULL AS source_path').replace(/inv\./g, ''),
    invCol(invCols, 'source_catalog', 'NULL AS source_catalog').replace(/inv\./g, ''),
    invCol(invCols, 'media_type', 'NULL AS media_type').replace(/inv\./g, ''),
  ].join(', ');
  const out = [];
  const chunkSize = 250;
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(',');
    const [rows] = await conn.query(`SELECT ${selected} FROM media_cache_inventory WHERE \`${field}\` IN (${placeholders})`, chunk);
    out.push(...rows);
  }
  return out;
}

async function hydrateInventoryContext(conn, rows, invCols) {
  if (!rows.length || !has(invCols, 'inventory_key')) return rows;
  const streamIds = compactList(rows.map(row => row.stream_id));
  const blankStreamTitles = compactList(rows.filter(row => !String(row.stream_id || '').trim()).map(row => row.title));
  const byStream = new Map();
  const byTitle = new Map();
  for (const inv of await queryInventoryBy(conn, 'stream_id', streamIds, invCols)) {
    if (!String(inv.stream_id || '').trim()) continue;
    const key = String(inv.stream_id);
    byStream.set(key, chooseInventory(byStream.get(key), inv));
  }
  for (const inv of await queryInventoryBy(conn, 'title', blankStreamTitles, invCols)) {
    if (!String(inv.title || '').trim()) continue;
    const key = String(inv.title);
    byTitle.set(key, chooseInventory(byTitle.get(key), inv));
  }
  for (const row of rows) {
    const streamKey = String(row.stream_id || '').trim();
    const inv = streamKey ? byStream.get(streamKey) : byTitle.get(String(row.title || ''));
    row.inventory_key = inv?.inventory_key || null;
    row.source_path = inv?.source_path || null;
    row.source_catalog = inv?.source_catalog || null;
    row.inventory_media_type = inv?.media_type || null;
  }
  return rows;
}

async function fetchCandidates(conn, movieCols, invCols) {
  const where = [];
  const params = [];
  if (has(movieCols, 'repair_status') && STATUS_FILTER) {
    where.push('m.`repair_status` = ?');
    params.push(STATUS_FILTER);
  }
  const episodeLike = [
    'm.`title` REGEXP ?',
    has(movieCols, 'stream_id') ? 'm.`stream_id` REGEXP ?' : null,
  ].filter(Boolean);
  const episodePattern = '(S[0-9]{1,4}E[0-9]{1,3}|[0-9]{1,3}x[0-9]{1,3}|Episode[ ._-]*[0-9]{1,3}|Ep[ ._-]*[0-9]{1,3})';
  if (!where.length) {
    where.push(`(${episodeLike.join(' OR ')})`);
    params.push(...episodeLike.map(() => episodePattern));
  }
  const limitSql = LIMIT ? ' LIMIT ' + LIMIT : '';
  const orderBy = has(movieCols, 'id')
    ? 'ORDER BY m.`id` ASC'
    : (has(movieCols, 'media_key') ? 'ORDER BY m.`media_key` ASC' : '');
  const sql = `
    SELECT
      ${col(movieCols, 'id', 'NULL AS id')} AS movie_id,
      ${col(movieCols, 'media_key', 'NULL AS media_key')} AS media_key,
      ${col(movieCols, 'stream_id', 'NULL AS stream_id')} AS stream_id,
      ${col(movieCols, 'title', "'' AS title")} AS title,
      ${col(movieCols, 'year', 'NULL AS year')} AS movie_year,
      ${col(movieCols, 'poster_url', 'NULL AS movie_poster_url')} AS movie_poster_url,
      ${col(movieCols, 'remote_poster_url', 'NULL AS movie_remote_poster_url')} AS movie_remote_poster_url,
      ${col(movieCols, 'lookup_status', 'NULL AS lookup_status')} AS lookup_status,
      ${col(movieCols, 'repair_status', 'NULL AS repair_status')} AS repair_status,
      NULL AS inventory_key,
      NULL AS source_path,
      NULL AS source_catalog,
      NULL AS inventory_media_type
    FROM media_cache_movies m
    WHERE ${where.join(' AND ')}
    ${orderBy}${limitSql}`;
  const [rows] = await conn.query(sql, params);
  return hydrateInventoryContext(conn, rows, invCols);
}

function classifyRow(row) {
  const identity = parseMediaIdentity({
    title: row.title || '',
    filename: row.title || '',
    streamUrl: row.stream_id || '',
    source_path: row.source_path || row.stream_id || row.title || '',
  });
  const migratable = identity.kind === 'episode' && identity.seriesKey && identity.season !== null &&
    (identity.confidence === 'high' || (INCLUDE_MEDIUM && identity.confidence === 'medium'));
  return {
    row,
    identity,
    migratable,
    status: migratable ? 'episode_migratable' : (identity.kind === 'episode' ? 'episode_unresolved' : 'not_episode'),
    targetEpisodeKey: identity.kind === 'episode' ? stableEpisodeKey(identity) : '',
    targetSeriesKey: identity.kind === 'episode' ? stableSeriesKey(identity.seriesName) : '',
  };
}

function countBy(items, fn) {
  const out = new Map();
  for (const item of items) {
    const key = fn(item);
    out.set(key, (out.get(key) || 0) + 1);
  }
  return Object.fromEntries([...out.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

async function ensureAuditTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS media_cache_repair_audit (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      source_media_key VARCHAR(255) NULL,
      original_title TEXT NULL,
      original_year VARCHAR(16) NULL,
      source_path TEXT NULL,
      inferred_series VARCHAR(512) NULL,
      inferred_season INT NULL,
      inferred_episode INT NULL,
      confidence VARCHAR(32) NULL,
      reason VARCHAR(255) NULL,
      target_episode_key VARCHAR(128) NULL,
      status VARCHAR(64) NOT NULL,
      details JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_repair_source_media_key (source_media_key),
      KEY idx_repair_episode_key (target_episode_key),
      KEY idx_repair_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

function assignments(cols, values) {
  const names = Object.keys(values).filter(name => has(cols, name));
  return { names, vals: names.map(name => values[name]) };
}

async function upsertSeries(conn, seriesCols, item) {
  const values = {
    series_key: item.targetSeriesKey,
    series_name: item.identity.seriesName,
    lookup_status: 'pending_tmdb',
    updated_at: new Date(),
  };
  const { names, vals } = assignments(seriesCols, values);
  if (!names.includes('series_key') || !names.includes('series_name')) return;
  const colsSql = names.map(name => `\`${name}\``).join(',');
  const placeholders = names.map(() => '?').join(',');
  const updates = names
    .filter(name => !['series_key'].includes(name))
    .map(name => `\`${name}\`=COALESCE(NULLIF(\`${name}\`,''), VALUES(\`${name}\`))`)
    .join(',');
  await conn.query(`INSERT INTO media_cache_series (${colsSql}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates || '`series_key`=`series_key`'}`, vals);
}

async function upsertEpisode(conn, episodeCols, item) {
  const row = item.row;
  const id = item.identity;
  const values = {
    episode_key: item.targetEpisodeKey,
    stream_id: row.stream_id || null,
    series_key: item.targetSeriesKey,
    series_name: id.seriesName,
    season_num: id.season,
    episode_num: id.episode,
    episode_title: id.episodeTitle || `Episode ${id.episode}`,
    tmdb_id: null,
    poster_url: '',
    remote_poster_url: '',
    source: row.source_catalog || 'repair-misclassified-episodes',
    updated_at: new Date(),
  };
  const { names, vals } = assignments(episodeCols, values);
  if (!names.includes('episode_key') || !names.includes('series_key')) return;
  const colsSql = names.map(name => `\`${name}\``).join(',');
  const placeholders = names.map(() => '?').join(',');
  const updates = names
    .filter(name => !['episode_key'].includes(name))
    .map(name => {
      if (['poster_url','remote_poster_url','tmdb_id'].includes(name)) return `\`${name}\`=COALESCE(NULLIF(\`${name}\`,''), VALUES(\`${name}\`))`;
      return `\`${name}\`=VALUES(\`${name}\`)`;
    })
    .join(',');
  await conn.query(`INSERT INTO media_cache_episodes (${colsSql}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates || '`episode_key`=`episode_key`'}`, vals);
}

async function writeAudit(conn, item, status) {
  await conn.query(`
    INSERT INTO media_cache_repair_audit
      (source_media_key, original_title, original_year, source_path, inferred_series, inferred_season, inferred_episode, confidence, reason, target_episode_key, status, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    item.row.media_key || String(item.row.movie_id || ''),
    item.row.title || '',
    item.row.movie_year || '',
    item.row.source_path || item.row.stream_id || '',
    item.identity.seriesName || '',
    item.identity.season,
    item.identity.episode,
    item.identity.confidence,
    item.identity.reason,
    item.targetEpisodeKey,
    status,
    JSON.stringify({ stream_id: item.row.stream_id || null, inventory_key: item.row.inventory_key || null, source_catalog: item.row.source_catalog || null }),
  ]);
}

async function updateMovieStatus(conn, movieCols, item, status) {
  if (!has(movieCols, 'repair_status')) return;
  if (item.row.movie_id == null) return;
  await conn.query('UPDATE media_cache_movies SET `repair_status` = ? WHERE `id` = ?', [status, item.row.movie_id]);
}

function chunkArray(values, size = 500) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

async function bulkInsert(conn, table, names, rows, updateSql = '') {
  if (!names.length || !rows.length) return;
  const colsSql = names.map(name => `\`${name}\``).join(',');
  const rowPlaceholder = `(${names.map(() => '?').join(',')})`;
  for (const chunk of chunkArray(rows, 300)) {
    const placeholders = chunk.map(() => rowPlaceholder).join(',');
    const vals = chunk.flat();
    await conn.query(`INSERT INTO ${table} (${colsSql}) VALUES ${placeholders}${updateSql}`, vals);
  }
}

async function bulkUpsertSeries(conn, seriesCols, items) {
  const unique = new Map();
  for (const item of items) {
    if (!item.migratable || !item.targetSeriesKey) continue;
    unique.set(item.targetSeriesKey, item);
  }
  const rows = [...unique.values()];
  if (!rows.length) return;
  const valueObjects = rows.map(item => ({
    series_key: item.targetSeriesKey,
    series_name: item.identity.seriesName,
    lookup_status: 'pending_tmdb',
    updated_at: new Date(),
  }));
  const { names } = assignments(seriesCols, valueObjects[0]);
  if (!names.includes('series_key') || !names.includes('series_name')) return;
  const vals = valueObjects.map(values => names.map(name => values[name]));
  const updates = names
    .filter(name => name !== 'series_key')
    .map(name => `\`${name}\`=COALESCE(NULLIF(\`${name}\`,''), VALUES(\`${name}\`))`)
    .join(',');
  await bulkInsert(conn, 'media_cache_series', names, vals, ` ON DUPLICATE KEY UPDATE ${updates || '`series_key`=`series_key`'}`);
}

async function bulkUpsertEpisodes(conn, episodeCols, items) {
  const unique = new Map();
  for (const item of items) {
    if (!item.migratable || !item.targetEpisodeKey) continue;
    unique.set(item.targetEpisodeKey, item);
  }
  const rows = [...unique.values()];
  if (!rows.length) return;
  const valueObjects = rows.map(item => {
    const row = item.row;
    const id = item.identity;
    return {
      episode_key: item.targetEpisodeKey,
      stream_id: row.stream_id || null,
      series_key: item.targetSeriesKey,
      series_name: id.seriesName,
      season_num: id.season,
      episode_num: id.episode,
      episode_title: id.episodeTitle || `Episode ${id.episode}`,
      tmdb_id: null,
      poster_url: '',
      remote_poster_url: '',
      source: row.source_catalog || 'repair-misclassified-episodes',
      updated_at: new Date(),
    };
  });
  const { names } = assignments(episodeCols, valueObjects[0]);
  if (!names.includes('episode_key') || !names.includes('series_key')) return;
  const vals = valueObjects.map(values => names.map(name => values[name]));
  const updates = names
    .filter(name => name !== 'episode_key')
    .map(name => {
      if (['poster_url','remote_poster_url','tmdb_id'].includes(name)) return `\`${name}\`=COALESCE(NULLIF(\`${name}\`,''), VALUES(\`${name}\`))`;
      return `\`${name}\`=VALUES(\`${name}\`)`;
    })
    .join(',');
  await bulkInsert(conn, 'media_cache_episodes', names, vals, ` ON DUPLICATE KEY UPDATE ${updates || '`episode_key`=`episode_key`'}`);
}

async function bulkWriteAudit(conn, items) {
  const names = ['source_media_key', 'original_title', 'original_year', 'source_path', 'inferred_series', 'inferred_season', 'inferred_episode', 'confidence', 'reason', 'target_episode_key', 'status', 'details'];
  const vals = items.map(item => {
    const status = item.migratable ? 'episode_migrated' : item.status;
    return [
      item.row.media_key || String(item.row.movie_id || ''),
      item.row.title || '',
      item.row.movie_year || '',
      item.row.source_path || item.row.stream_id || '',
      item.identity.seriesName || '',
      item.identity.season,
      item.identity.episode,
      item.identity.confidence,
      item.identity.reason,
      item.targetEpisodeKey,
      status,
      JSON.stringify({ stream_id: item.row.stream_id || null, inventory_key: item.row.inventory_key || null, source_catalog: item.row.source_catalog || null }),
    ];
  });
  await bulkInsert(conn, 'media_cache_repair_audit', names, vals);
}

async function bulkUpdateMovieStatuses(conn, movieCols, items) {
  if (!has(movieCols, 'repair_status')) return;
  const groups = new Map();
  for (const item of items) {
    if (item.row.movie_id == null) continue;
    const status = item.migratable ? 'episode_migrated' : item.status;
    if (!groups.has(status)) groups.set(status, []);
    groups.get(status).push(item.row.movie_id);
  }
  for (const [status, ids] of groups) {
    for (const chunk of chunkArray(ids, 500)) {
      await conn.query(`UPDATE media_cache_movies SET \`repair_status\` = ? WHERE \`id\` IN (${chunk.map(() => '?').join(',')})`, [status, ...chunk]);
    }
  }
}

async function applyMigrations(conn, schema, items) {
  await ensureAuditTable(conn);
  const migrated = items.filter(item => item.migratable).length;
  await conn.beginTransaction();
  try {
    await bulkUpsertSeries(conn, schema.seriesCols, items);
    await bulkUpsertEpisodes(conn, schema.episodeCols, items);
    await bulkWriteAudit(conn, items);
    await bulkUpdateMovieStatuses(conn, schema.movieCols, items);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }
  return migrated;
}

async function main() {
  const conn = await connect();
  try {
    const schema = {
      movieCols: await columns(conn, 'media_cache_movies'),
      invCols: await columns(conn, 'media_cache_inventory'),
      seriesCols: await columns(conn, 'media_cache_series'),
      episodeCols: await columns(conn, 'media_cache_episodes'),
    };
    const rows = await fetchCandidates(conn, schema.movieCols, schema.invCols);
    const classified = rows.map(classifyRow);
    const migratable = classified.filter(item => item.migratable);
    console.log(JSON.stringify({
      mode: APPLY ? 'apply' : 'dry-run',
      statusFilter: STATUS_FILTER || null,
      rows: rows.length,
      migratable: migratable.length,
      byStatus: countBy(classified, item => item.status),
      byConfidence: countBy(classified, item => item.identity.confidence),
      includeMedium: INCLUDE_MEDIUM,
    }, null, 2));
    for (const item of classified.slice(0, SAMPLE_LIMIT)) {
      console.log(JSON.stringify({
        title: item.row.title,
        source_path: item.row.source_path,
        status: item.status,
        confidence: item.identity.confidence,
        reason: item.identity.reason,
        series: item.identity.seriesName,
        season: item.identity.season,
        episode: item.identity.episode,
        targetEpisodeKey: item.targetEpisodeKey,
      }));
    }
    if (!APPLY) {
      console.log('Dry run only. Re-run with --apply to write audit/upsert episode rows/mark movie rows.');
      return;
    }
    const migrated = await applyMigrations(conn, schema, classified);
    console.log(JSON.stringify({ applied: true, migrated, examined: classified.length }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
