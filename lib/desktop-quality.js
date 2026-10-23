'use strict';

// Opt-in desktop HLS profiles. Direct playback remains the default.
const DESKTOP_PROFILES = Object.freeze({
  '360p': Object.freeze({ width: 640, fps: 24, videoRate: '550k', bufferRate: '1100k', audioRate: '64k', crf: 32 }),
  '480p': Object.freeze({ width: 854, fps: 24, videoRate: '950k', bufferRate: '1900k', audioRate: '80k', crf: 31 }),
});

function getDesktopProfile(quality) {
  return Object.prototype.hasOwnProperty.call(DESKTOP_PROFILES, quality)
    ? DESKTOP_PROFILES[quality] : null;
}

function validStart(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n >= 0 && n <= 86400 ? Math.floor(n) : null;
}

function validAudio(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) && n >= 0 && n <= 32 ? n : null;
}

module.exports = { DESKTOP_PROFILES, getDesktopProfile, validStart, validAudio };
