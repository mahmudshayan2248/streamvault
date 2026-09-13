'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  installPlaybackCapability,
  playbackDecision,
  normalizedAudioTrack,
  normalizedSubtitleTrack,
  normalizedSeekOrigin,
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

test('track metadata always has useful labels and bitmap subtitles are explicit', () => {
  assert.equal(normalizedAudioTrack({}, 0).title, 'Audio Track 1');
  const bitmap = normalizedSubtitleTrack({ codec: 'hdmv_pgs_subtitle' }, 0, () => '/unused');
  assert.equal(bitmap.supported, false);
  assert.equal(bitmap.url, null);
  assert.match(bitmap.unsupportedReason, /Image subtitles/);
});

test('keyframe origin accounts for B-frame decode reordering', () => {
  assert.equal(normalizedSeekOrigin({ pts_time: '2399.230000' }, { hasBFrames: 2, frameRate: '24000/1001' }, 2400), 2399.147);
  assert.equal(normalizedSeekOrigin({ pts_time: '10', dts_time: '9.5' }, {}, 12), 9.5);
  assert.equal(normalizedSeekOrigin([
    {pts_time:'2399.230',duration_time:'.041'},
    {pts_time:'2399.355',duration_time:'.042'},
    {pts_time:'2399.314',dts_time:'2399.230',duration_time:'.041'},
  ],{},2400),2399.147);
  const roundedMatroskaPackets = [
    { pts_time: '2399.230', duration_time: '.041' },
    { pts_time: '2399.355', duration_time: '.041' },
    { pts_time: '2399.314', dts_time: '2399.230', duration_time: '.041' },
  ];
  // Millisecond Matroska durations yield a 1 ms rounding difference from
  // FFmpeg's reconstructed 2399.147 DTS, independently of stale metadata.
  assert.equal(normalizedSeekOrigin(roundedMatroskaPackets, {}, 2400), 2399.148);
  assert.equal(normalizedSeekOrigin(roundedMatroskaPackets, { hasBFrames: 0 }, 2400), 2399.148);
  assert.equal(normalizedSeekOrigin(roundedMatroskaPackets, { hasBFrames: 2, frameRate: '24000/1001' }, 2400), 2399.148);
  assert.equal(normalizedSeekOrigin([
    { pts_time: '2953.826', duration_time: '.041' },
    { pts_time: '2953.742', duration_time: '.041' },
    { pts_time: '2953.659', dts_time: '2953.659', duration_time: '.041' },
  ], {}, 2960), 2953.744);
});

test('compatibility output keeps one timestamp epoch and does not force audio to zero', async () => {
  const routes = new Map();
  const app = { get(route,handler){routes.set(`GET ${route}`,handler);}, post(route,handler){routes.set(`POST ${route}`,handler);} };
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streamvault-timestamps-'));
  const installed = installPlaybackCapability({
    app,cacheDir,probeSeekOrigin:async()=>2399.147,
    getMediaInfo:async()=>({container:'matroska,webm',videoCodec:'hevc',hasBFrames:2,frameRate:'24000/1001',duration:3009.877,audioTracks:[{index:0,streamIndex:0,codec:'aac',channels:6}]}),
    resolveLocal:()=>({id:'media',canonicalId:'media',input:'/media.mkv',filename:'media.mkv',label:'Media',fingerprint:'source',directUrl:'/source'}),
    resolveRemote:()=>null,
  });
  let payload;
  await routes.get('GET /api/playback/:id')({params:{id:'media'},query:{start:'2400',hevc:'1'}},{setHeader(){},status(){return this;},json(value){payload=value;}});
  const session=installed.sessions.get(payload.cacheKey);
  const args=installed.buildFfmpegArgs(session);
  installed.stopWorkers();fs.rmSync(cacheDir,{recursive:true,force:true});
  assert.equal(payload.windowStart,2399.147);assert.equal(payload.requestedStart,2400);
  assert.deepEqual(args.slice(args.indexOf('-ss'),args.indexOf('-ss')+3),['-ss','2400.000','-noaccurate_seek']);
  assert.ok(args.includes('-copyts'));assert.ok(args.includes('-start_at_zero'));
  assert.equal(args[args.indexOf('-hls_fmp4_init_filename')+1],'init.mp4');
  assert.ok(args.includes('disabled'));assert.doesNotMatch(args.join(' '),/first_pts/);
  assert.equal(args.filter(value=>value==='-i').length,1);
});

test('canonical source resolution retries once before reporting missing', async () => {
  const routes=new Map();const app={get(route,handler){routes.set(`GET ${route}`,handler);},post(){}};
  const cacheDir=fs.mkdtempSync(path.join(os.tmpdir(),'streamvault-resolve-'));
  const calls=[];
  const installed=installPlaybackCapability({app,cacheDir,getMediaInfo:async()=>({}),resolveLocal(_id,_req,options){calls.push(options);return null;},resolveRemote:()=>null});
  let status=200,payload;
  await routes.get('GET /api/playback/:id')({params:{id:'missing'},query:{}},{setHeader(){},status(value){status=value;return this;},json(value){payload=value;}});
  installed.stopWorkers();fs.rmSync(cacheDir,{recursive:true,force:true});
  assert.equal(status,404);assert.equal(payload.code,'SOURCE_MISSING');assert.deepEqual(calls,[{refresh:false},{refresh:true}]);
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
