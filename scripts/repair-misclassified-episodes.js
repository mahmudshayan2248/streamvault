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
  let join = 'LEFT JOIN media_cache_inventory inv ON 1=0';
  if (has(invCols, 'inventory_key')) {
    const streamMatch = has(invCols, 'stream_id') && has(movieCols, 'stream_id')
      ? "((m.`stream_id` IS NOT NULL AND m.`stream_id` <> '' AND inv2.`stream_id` = m.`stream_id`))"
      : 'FALSE';
    const titleMatch = has(invCols, 'title') && has(movieCols, 'title')
      ? "((m.`stream_id` IS NULL OR m.`stream_id` = '') AND inv2.`title` = m.`title`)"
      : 'FALSE';
    join = `LEFT JOIN media_cache_inventory inv ON inv.\`inventory_key\` = (
      SELECT inv2.\`inventory_key\`
      FROM media_cache_inventory inv2
      WHERE ${streamMatch} OR ${titleMatch}
      ORDER BY
        CASE WHEN ${streamMatch} THEN 0 ELSE 1 END,
        CASE WHEN inv2.\`source_path\` LIKE 'http%' OR inv2.\`source_path\` LIKE '%/%' OR inv2.\`source_path\` LIKE '%\\%' THEN 0 ELSE 1 END,
        CASE WHEN inv2.\`source_path\` REGEXP 'Season[ ._-]*[0-9]{1,4}|S[0-9]{1,4}E[0-9]{1,3}|[0-9]{1,3}x[0-9]{1,3}|TV[ ._-]*(Series|Documentary)' THEN 0 ELSE 1 END,
        CHAR_LENGTH(inv2.\`source_path\`) DESC,
        inv2.\`inventory_key\` ASC
      LIMIT 1
    )`;
  }
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
      ${invCol(invCols, 'inventory_key', 'NULL AS inventory_key')} AS inventory_key,
      ${invCol(invCols, 'source_path', 'NULL AS source_path')} AS source_path,
      ${invCol(invCols, 'source_catalog', 'NULL AS source_catalog')} AS source_catalog,
      ${invCol(invCols, 'media_type', 'NULL AS inventory_media_type')} AS inventory_media_type
    FROM media_cache_movies m
    ${join}
    WHERE ${where.join(' AND ')}
    ${orderBy}${limitSql}`;
  const [rows] = await conn.query(sql, params);
  return rows;
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

async function applyMigrations(conn, schema, items) {
  await ensureAuditTable(conn);
  let migrated = 0;
  await conn.beginTransaction();
  try {
    for (const item of items) {
      if (!item.migratable) {
        await writeAudit(conn, item, item.status);
        await updateMovieStatus(conn, schema.movieCols, item, item.status);
        continue;
      }
      await upsertSeries(conn, schema.seriesCols, item);
      await upsertEpisode(conn, schema.episodeCols, item);
      await writeAudit(conn, item, 'episode_migrated');
      await updateMovieStatus(conn, schema.movieCols, item, 'episode_migrated');
      migrated++;
      if (migrated % 500 === 0) console.log(`migrated=${migrated}`);
    }
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
