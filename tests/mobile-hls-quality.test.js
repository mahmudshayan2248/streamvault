'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMobileQuality, mobileQualityProfile } = require('../lib/mobile-hls-quality');

test('unrecognized quality leaves existing auto mode unchanged', () => {
  for (const input of [undefined, '', 'auto', '720p', '1080p', '../../foo']) {
    assert.equal(normalizeMobileQuality(input), 'auto');
    assert.equal(mobileQualityProfile(input), null);
  }
});
test('low-data quality levels cap actual video and audio bitrates', () => {
  const p360 = mobileQualityProfile('360p');
  const p480 = mobileQualityProfile('480p');
  assert.equal(p360.width, 640);
  assert.equal(p480.width, 854);
  assert.ok(parseInt(p360.maxrate) < parseInt(p480.maxrate));
  assert.ok(parseInt(p360.audioBitrate) < parseInt(p480.audioBitrate));
  assert.ok(Object.isFrozen(p360));
});
