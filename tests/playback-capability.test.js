'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  installPlaybackCapability,
  playbackDecision,
  normalizedAudioTrack,
  normalizedSubtitleTrack,
} = require('../lib/playback-capability');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const chrome = {
  h264: true,
  hevc: false,
  vp8: true,
  vp9: true,
  av1: true,
  aac: true,
  mp3: true,
  opus: true,
  vorbis: true,
};

test('direct plays compatible single-audio H.264 MP4', () => {
  const decision = playbackDecision({
    container: 'mov,mp4,m4a,3gp,3g2,mj2',
    videoCodec: 'h264',
    audioTracks: [{ index: 1, codec: 'aac', language: 'eng', channels: 2 }],
  }, '/movie.mp4', 'movie.mp4', chrome);
  assert.equal(decision.mode, 'direct');
  assert.equal(decision.strategy, 'direct');
});

test('uses one alternate-audio HLS session for multi-audio H.264 MKV', () => {
  const decision = playbackDecision({
    container: 'matroska,webm',
    videoCodec: 'h264',
    audioTracks: [
      { index: 1, codec: 'aac', language: 'eng' },
      { index: 2, codec: 'aac', language: 'jpn' },
    ],
  }, '/movie.mkv', 'movie.mkv', chrome);
  assert.equal(decision.mode, 'hls');
  assert.equal(decision.strategy, 'alternate-audio-remux');
  assert.equal(decision.videoAction, 'copy');
  assert.equal(decision.audioAction, 'copy');
});

test('copies compatible video and converts only DTS audio', () => {
  const decision = playbackDecision({
    container: 'matroska,webm',
    videoCodec: 'h264',
    audioTracks: [{ index: 1, codec: 'dts', language: 'eng', channels: 6 }],
  }, '/movie.mkv', 'movie.mkv', chrome);
  assert.equal(decision.strategy, 'audio-transcode');
  assert.equal(decision.videoAction, 'copy');
  assert.equal(decision.audioAction, 'transcode-aac');
  assert.equal(decision.audioTracks[0].outputChannels, 2);
});

test('normalizes multichannel and HE-AAC tracks instead of copying incompatible MSE audio', () => {
  const decision = playbackDecision({
    container: 'matroska,webm',
    videoCodec: 'hevc',
    audioTracks: [
      { index: 1, codec: 'aac', profile: 'LC', language: 'eng', channels: 8, channelLayout: '7.1' },
      { index: 2, codec: 'aac', profile: 'HE-AAC', language: 'eng', channels: 2, channelLayout: 'stereo' },
    ],
  }, '/avengers.mkv', 'avengers.mkv', { ...chrome, hevc: true });
  assert.equal(decision.mode, 'hls');
  assert.equal(decision.videoAction, 'copy');
  assert.equal(decision.audioAction, 'transcode-aac');
  assert.equal(decision.strategy, 'alternate-audio-transcode');
  assert.deepEqual(decision.audioTracks.map(track => track.outputAction), ['transcode-aac', 'transcode-aac']);
  assert.deepEqual(decision.audioTracks.map(track => track.outputChannels), [2, 2]);
});

test('transcodes HEVC only when the requesting browser cannot decode it', () => {
  const media = {
    container: 'mov,mp4,m4a,3gp,3g2,mj2',
    videoCodec: 'hevc',
    audioTracks: [{ index: 1, codec: 'aac' }],
  };
  assert.equal(playbackDecision(media, '/movie.mp4', 'movie.mp4', chrome).videoAction, 'transcode-h264');
  assert.equal(playbackDecision(media, '/movie.mp4', 'movie.mp4', { ...chrome, hevc: true }).mode, 'direct');
});

test('track metadata exposes bitmap subtitle manifests only for renderable image codecs', () => {
  assert.equal(normalizedAudioTrack({}, 0).title, 'Audio Track 1');
  const bitmap = normalizedSubtitleTrack(
    { codec: 'dvd_subtitle', streamIndex: 7, relativeIndex: 2, timeline: 'local' },
    0,
    () => '/unused.vtt',
    streamIndex => `/bitmap/${streamIndex}/manifest.json`
  );
  assert.equal(bitmap.supported, true);
  assert.equal(bitmap.format, 'bitmap');
  assert.equal(bitmap.renderer, 'bitmap-overlay');
  assert.equal(bitmap.timeline, 'global');
  assert.equal(bitmap.url, '/bitmap/7/manifest.json');
  assert.equal(bitmap.unsupportedReason, '');

  const pgs = normalizedSubtitleTrack(
    { codec: 'hdmv_pgs_subtitle', streamIndex: 8 },
    1,
    () => '/unused.vtt',
    streamIndex => `/bitmap/${streamIndex}/manifest.json`
  );
  assert.equal(pgs.supported, true);
  assert.equal(pgs.url, '/bitmap/8/manifest.json');

  const unsupported = normalizedSubtitleTrack({ codec: 'xsub', streamIndex: 9 }, 2, () => '/unused.vtt');
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.url, null);
  assert.match(unsupported.unsupportedReason, /bitmap overlay renderer/);
});

test('canonical ID capability preserves a remote source returned by the authoritative resolver', async () => {
  const routes = new Map();
  const app = {
    get(route, handler) { routes.set(`GET ${route}`, handler); },
    post(route, handler) { routes.set(`POST ${route}`, handler); },
  };
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streamvault-playback-'));
  let receivedRequest = null;
  const installed = installPlaybackCapability({
    app,
    cacheDir,
    getMediaInfo: async () => ({
      container: 'mov,mp4,m4a,3gp,3g2,mj2',
      videoCodec: 'h264',
      duration: 120,
      audioTracks: [{ index: 1, codec: 'aac', channels: 2 }],
    }),
    resolveLocal(id, req) {
      receivedRequest = req;
      return {
        id,
        canonicalId: id,
        remote: true,
        input: 'http://catalog.example/Movie%20One.mp4',
        filename: 'Movie One.mp4',
        directUrl: '/api/ftp/proxy?url=movie',
        fingerprint: 'authoritative-source',
      };
    },
    resolveRemote: () => null,
  });
  let status = 200;
  let payload = null;
  const req = { params: { id: 'ftp_1' }, query: { title: 'Movie One' } };
  const res = {
    setHeader() {},
    status(value) { status = value; return this; },
    json(value) { payload = value; return value; },
  };
  await routes.get('GET /api/playback/:id')(req, res);
  installed.stopWorkers();
  fs.rmSync(cacheDir, { recursive: true, force: true });

  assert.equal(status, 200);
  assert.equal(receivedRequest, req);
  assert.equal(payload.mode, 'direct');
  assert.equal(payload.directUrl, '/api/ftp/proxy?url=movie');
  assert.deepEqual(payload.source, {
    canonicalId: 'ftp_1',
    kind: 'remote',
    fingerprint: 'authoritative-source',
  });
});
