'use strict';

// Opt-in mobile encodes. Auto continues to use the original server configuration.
const LOW_DATA_PROFILES = Object.freeze({
  '360p': Object.freeze({ width: 640, fps: 24, crf: 32, maxrate: '550k', bufsize: '1100k', audioBitrate: '64k' }),
  '480p': Object.freeze({ width: 854, fps: 24, crf: 31, maxrate: '950k', bufsize: '1900k', audioBitrate: '80k' }),
});

function normalizeMobileQuality(value) {
  return Object.prototype.hasOwnProperty.call(LOW_DATA_PROFILES, value) ? value : 'auto';
}

function mobileQualityProfile(quality) {
  return LOW_DATA_PROFILES[normalizeMobileQuality(quality)] || null;
}

module.exports = { LOW_DATA_PROFILES, normalizeMobileQuality, mobileQualityProfile };
