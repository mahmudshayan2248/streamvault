#!/usr/bin/env node
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env.local'), override: false });

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
  catch (_) {
    console.error('mysql2 is required. Run npm install before using this script.');
    process.exit(2);
  }
  const databaseUrl = loadDatabaseUrl();
  if (!databaseUrl) {
    console.error('Missing database configuration. Set DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD.');
    process.exit(2);
  }
  return mysql.createConnection({ uri: databaseUrl, multipleStatements: false });
}

async function indexExists(conn, table, name) {
  const [rows] = await conn.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [name]);
  return rows.length > 0;
}

async function ensureIndex(conn, spec) {
  if (await indexExists(conn, spec.table, spec.name)) {
    console.log(`existing ${spec.table}.${spec.name}`);
    return { ...spec, status: 'existing' };
  }
  console.log(`creating ${spec.table}.${spec.name}`);
  await conn.query(`ALTER TABLE \`${spec.table}\` ADD INDEX \`${spec.name}\` (${spec.columns})`);
  console.log(`created ${spec.table}.${spec.name}`);
  return { ...spec, status: 'created' };
}

async function main() {
  const indexes = [
    { table: 'media_cache_inventory', name: 'idx_inventory_stream_id', columns: '`stream_id`' },
    { table: 'media_cache_movies', name: 'idx_movies_repair_status_id', columns: '`repair_status`, `id`' },
    { table: 'media_cache_movies', name: 'idx_movies_stream_id', columns: '`stream_id`' },
  ];
  const conn = await connect();
  try {
    const results = [];
    for (const spec of indexes) results.push(await ensureIndex(conn, spec));
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
