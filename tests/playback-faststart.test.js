'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { cacheKey, isMp4Source } = require('../lib/playback-faststart');

test('fast-start cache identity is stable and changes with the canonical source fingerprint', () => {
  const source = {
    canonicalId: 'ftp_8761',
    fingerprint: '0e6820ada25850a061ef',
    remote: true,
    input: 'http://media.example/movie.mp4',
  };
  assert.equal(cacheKey(source), cacheKey({ ...source }));
  assert.notEqual(cacheKey(source), cacheKey({ ...source, fingerprint: 'changed' }));
});

test('fast-start accepts only canonical remote MP4-family sources', () => {
  assert.equal(isMp4Source({ remote: true, input: 'https://media.example/Movie.MP4?token=1' }), true);
  assert.equal(isMp4Source({ remote: true, input: 'https://media.example/Movie.m4v' }), true);
  assert.equal(isMp4Source({ remote: true, input: 'https://media.example/Movie.mkv' }), false);
  assert.equal(isMp4Source({ remote: false, input: '/media/Movie.mp4' }), false);
});
