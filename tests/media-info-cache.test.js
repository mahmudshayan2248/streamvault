'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

test('persisted media timing cache rejects old and incomplete metadata', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-media-info-test-'));
  try {
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const start = source.indexOf('const SV_REMOTE_MEDIA_INFO_CACHE_VERSION');
    const end = source.indexOf('\nfunction getCachedMediaInfo', start);
    const context = vm.createContext({ fs, path, crypto, process, console, SV_CACHE_DIR: directory });
    vm.runInContext(source.slice(start, end), context);
    const url = 'https://example.test/media.mkv';
    const filename = context.svRemoteMediaInfoCachePath(url);
    const info = { videoCodec: 'hevc', duration: 3009.877, hasBFrames: 2 };
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, JSON.stringify({ version: 2, sourceUrl: url, info }));
    assert.equal(context.svReadRemoteMediaInfoCache(url), null);
    context.svWriteRemoteMediaInfoCache(url, { videoCodec: 'hevc', duration: 3009.877 });
    assert.equal(context.svReadRemoteMediaInfoCache(url), null);
    context.svWriteRemoteMediaInfoCache(url, info);
    assert.equal(context.svReadRemoteMediaInfoCache(url).hasBFrames, 2);
    assert.equal(context.svReadRemoteMediaInfoCache(url).duration, info.duration);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
