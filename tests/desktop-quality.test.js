'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getDesktopProfile, validStart, validAudio } = require('../lib/desktop-quality');

test('only opt-in 360p and 480p are transcoded', () => {
  assert.equal(getDesktopProfile('auto'), null);
  assert.equal(getDesktopProfile('720p'), null);
  assert.equal(getDesktopProfile('360p').width, 640);
  assert.equal(getDesktopProfile('480p').width, 854);
  assert.ok(Number.parseInt(getDesktopProfile('360p').videoRate) < Number.parseInt(getDesktopProfile('480p').videoRate));
});
test('rejects nonfinite/negative/huge seek offsets', () => {
  for (const v of ['NaN', Infinity, -1, '1e309', 90000]) assert.equal(validStart(v), null);
  assert.equal(validStart(1.95), 1);
});
test('audio indexes are bounded', () => {
  for (const v of [-1, 500, 'Infinity', 1.5]) assert.equal(validAudio(v), null);
  assert.equal(validAudio(3), 3);
});
