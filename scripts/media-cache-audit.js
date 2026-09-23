#!/usr/bin/env node
'use strict';

const path = require('path');
try { require('dotenv').config({ path: path.join(process.cwd(), '.env'), quiet: true }); } catch (_) {}
try { require('dotenv').config({ path: path.join(process.cwd(), '.env.local'), override: false, quiet: true }); } catch (_) {}

const TABLES = [
  'media_cache_inventory',
  'media_cache_movies',
  'media_cache_series',
  'media_cache_episodes',
  'media_cache_repair_audit',
];

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
  catch (_) {
    throw new Error('mysql2 is required. Run npm install before using this audit script.');
  }
  const config = dbConfig();
  if (!config) throw new Error('Missing database configuration. Set DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD.');
  return config.uri
    ? mysql.createConnection({ uri: config.uri, multipleStatements: false })
    : mysql.createConnection(config);
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

async function count(conn, table, where = '1=1', params = []) {
  if (!await tableExists(conn, table)) return 0;
  const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${where}`, params);
  return Number(rows[0]?.n || 0);
}

async function groupCounts(conn, table, column) {
  if (!await tableExists(conn, table)) return {};
  const cols = await columns(conn, table);
  if (!cols.has(column)) return {};
  const [rows] = await conn.query(`SELECT COALESCE(NULLIF(\`${column}\`, ''), '(blank)') AS k, COUNT(*) AS n FROM \`${table}\` GROUP BY k ORDER BY n DESC`);
  return Object.fromEntries(rows.map(row => [String(row.k), Number(row.n || 0)]));
}

function has(cols, column) {
  return cols.has(column);
}

async function inventoryReport(conn) {
  const table = 'media_cache_inventory';
  const cols = await columns(conn, table);
  if (!cols.size) return { exists: false };
  return {
    exists: true,
    total: await count(conn, table),
    byMediaType: has(cols, 'media_type') ? await groupCounts(conn, table, 'media_type') : {},
    withTmdbId: has(cols, 'tmdb_id') ? await count(conn, table, '`tmdb_id` IS NOT NULL AND `tmdb_id` <> 0') : null,
    withLocalPoster: has(cols, 'poster_url') ? await count(conn, table, "`poster_url` LIKE 'https://streamvault.fit/cache/posters/%' OR `poster_url` LIKE '/cache/posters/%'") : null,
    byMetadataStatus: has(cols, 'metadata_status') ? await groupCounts(conn, table, 'metadata_status') : {},
  };
}

async function movieReport(conn) {
  const table = 'media_cache_movies';
  const cols = await columns(conn, table);
  if (!cols.size) return { exists: false };
  return {
    exists: true,
    total: await count(conn, table),
    tmdbMatched: has(cols, 'tmdb_id') ? await count(conn, table, '`tmdb_id` IS NOT NULL AND `tmdb_id` <> 0') : null,
    localPosters: has(cols, 'poster_url') ? await count(conn, table, "`poster_url` LIKE 'https://streamvault.fit/cache/posters/movies/%' OR `poster_url` LIKE '/cache/posters/movies/%'") : null,
    localPosterAny: has(cols, 'poster_url') ? await count(conn, table, "`poster_url` LIKE 'https://streamvault.fit/cache/posters/%' OR `poster_url` LIKE '/cache/posters/%'") : null,
    remotePosterQueued: has(cols, 'remote_poster_url') ? await count(conn, table, "`remote_poster_url` IS NOT NULL AND `remote_poster_url` <> ''") : null,
    failedPoster: has(cols, 'poster_url') ? await count(conn, table, "`poster_url` LIKE 'failed:%'") : null,
    missingPoster: has(cols, 'poster_url') ? await count(conn, table, "`poster_url` IS NULL OR `poster_url` = ''") : null,
    episodeLikeRemaining: has(cols, 'repair_status') ? await count(conn, table, "`repair_status` = 'episode_like'") : null,
    episodeMigrated: has(cols, 'repair_status') ? await count(conn, table, "`repair_status` = 'episode_migrated'") : null,
    unresolvedRepair: has(cols, 'repair_status') ? await count(conn, table, "`repair_status` LIKE 'episode_unresolved%'") : null,
    byLookupStatus: has(cols, 'lookup_status') ? await groupCounts(conn, table, 'lookup_status') : {},
    byRepairStatus: has(cols, 'repair_status') ? await groupCounts(conn, table, 'repair_status') : {},
  };
}

async function seriesReport(conn) {
  const table = 'media_cache_series';
  const cols = await columns(conn, table);
  if (!cols.size) return { exists: false };
  return {
    exists: true,
    total: await count(conn, table),
    tmdbMatched: has(cols, 'tmdb_id') ? await count(conn, table, '`tmdb_id` IS NOT NULL AND `tmdb_id` <> 0') : null,
    localPosters: has(cols, 'poster_url') ? await count(conn, table, "`poster_url` LIKE 'https://streamvault.fit/cache/posters/series/%' OR `poster_url` LIKE '/cache/posters/series/%'") : null,
    localPosterAny: has(cols, 'poster_url') ? await count(conn, table, "`poster_url` LIKE 'https://streamvault.fit/cache/posters/%' OR `poster_url` LIKE '/cache/posters/%'") : null,
    failedPoster: has(cols, 'poster_url') ? await count(conn, table, "`poster_url` LIKE 'failed:%'") : null,
    missingPoster: has(cols, 'poster_url') ? await count(conn, table, "`poster_url` IS NULL OR `poster_url` = ''") : null,
    byLookupStatus: has(cols, 'lookup_status') ? await groupCounts(conn, table, 'lookup_status') : {},
  };
}

async function episodeReport(conn) {
  const table = 'media_cache_episodes';
  const cols = await columns(conn, table);
  if (!cols.size) return { exists: false };
  return {
    exists: true,
    total: await count(conn, table),
    tmdbMatched: has(cols, 'tmdb_id') ? await count(conn, table, '`tmdb_id` IS NOT NULL AND `tmdb_id` <> 0') : null,
    localImages: has(cols, 'poster_url') ? await count(conn, table, "`poster_url` LIKE 'https://streamvault.fit/cache/posters/episodes/%' OR `poster_url` LIKE '/cache/posters/episodes/%'") : null,
    localImageAny: has(cols, 'poster_url') ? await count(conn, table, "`poster_url` LIKE 'https://streamvault.fit/cache/posters/%' OR `poster_url` LIKE '/cache/posters/%'") : null,
    remoteImageQueued: has(cols, 'remote_poster_url') ? await count(conn, table, "`remote_poster_url` IS NOT NULL AND `remote_poster_url` <> ''") : null,
    failedImage: has(cols, 'poster_url') ? await count(conn, table, "`poster_url` LIKE 'failed:%'") : null,
    missingImage: has(cols, 'poster_url') ? await count(conn, table, "`poster_url` IS NULL OR `poster_url` = ''") : null,
  };
}

async function repairAuditReport(conn) {
  const table = 'media_cache_repair_audit';
  const cols = await columns(conn, table);
  if (!cols.size) return { exists: false };
  return {
    exists: true,
    total: await count(conn, table),
    byAction: has(cols, 'action') ? await groupCounts(conn, table, 'action') : {},
  };
}

async function main() {
  const conn = await connect();
  try {
    const tableAvailability = {};
    for (const table of TABLES) tableAvailability[table] = await tableExists(conn, table);
    const report = {
      ok: true,
      generatedAt: new Date().toISOString(),
      readOnly: true,
      tables: tableAvailability,
      inventory: await inventoryReport(conn),
      movies: await movieReport(conn),
      series: await seriesReport(conn),
      episodes: await episodeReport(conn),
      repairAudit: await repairAuditReport(conn),
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
