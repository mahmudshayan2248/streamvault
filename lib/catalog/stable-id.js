'use strict';

const crypto = require('crypto');

function normalizeRelativePath(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();
}

function digest(value, length = 24) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function stableMediaId(kind, relativePath) {
  const type = kind === 'episode' ? 'episode' : 'movie';
  return `media_${digest(`${type}|${normalizeRelativePath(relativePath)}`)}`;
}

function stableSeriesId(seriesKey) {
  return `series_${digest(`series|${String(seriesKey || '').normalize('NFKC').toLowerCase()}`, 16)}`;
}

module.exports = { digest, normalizeRelativePath, stableMediaId, stableSeriesId };
