'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { RecoveryController, PlayerSession } = require('../hostinger/player-session');

test('fatal network errors retry with bounded backoff without changing pause intent', t => {
  const scheduled = new Map();
  const delays = [];
  let nextId = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    const id = ++nextId;
    scheduled.set(id, callback);
    delays.push(delay);
    return id;
  });
  t.mock.method(globalThis, 'clearTimeout', id => scheduled.delete(id));
  t.mock.method(Math, 'random', () => 0);
  const starts = [];
  const hls = {startLoad: position => starts.push(position)};
  const session = {
    active:true, sequence:1, seekSequence:1, hls, wantsPlay:false,
    masterClock:{globalToLocal: time => time - 10}, getCurrentTime:() => 22,
  };
  const recovery = new RecoveryController(session);
  const failure = {fatal:true,type:'networkError'};
  for (const delay of [500, 1000, 2000]) {
    assert.equal(recovery.recoverHls(failure,hls),true);
    assert.equal(recovery.recoverHls(failure,hls),true, 'duplicate error shares pending retry');
    assert.equal(delays.at(-1),delay);
    const [id, callback] = scheduled.entries().next().value;
    scheduled.delete(id);
    callback();
  }
  assert.deepEqual(starts,[12,12,12]);
  assert.equal(session.wantsPlay,false);
  assert.equal(recovery.recoverHls(failure,hls),false);
  recovery.fragmentLoaded();
  assert.equal(recovery.recoverHls(failure,hls),true, 'a good fragment starts a new burst');
  recovery.reset();
  assert.equal(scheduled.size,0);
});

test('closed or superseded sessions cannot restart an old HLS load', t => {
  let callback;
  t.mock.method(globalThis, 'setTimeout', fn => { callback=fn; return 1; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  const starts = [];
  const hls = {startLoad: position => starts.push(position)};
  const session = {
    active:true, sequence:1, seekSequence:1, hls,
    masterClock:{globalToLocal: time => time}, getCurrentTime:() => 3,
  };
  const recovery = new RecoveryController(session);
  recovery.recoverStall(hls);
  session.seekSequence++;
  callback();
  assert.deepEqual(starts,[]);
  recovery.reset();
  recovery.recoverStall(hls);
  session.active=false;
  callback();
  assert.deepEqual(starts,[]);
});

test('healthy low buffer does not restart an active HLS loader', t => {
  const video = {volume:1,muted:false};
  const session = new PlayerSession({video,resolve:async()=>{},loadHls:async()=>{}});
  t.after(() => session.recoveryController.reset());
  let starts=0;
  session.active=true;
  session.adapter={};
  session.mode='COMPATIBILITY';
  session.state='PLAYING';
  session.wantsPlay=true;
  session.hls={startLoad:() => starts++};
  session.lastStatusPollAt=Date.now();
  session.maintainForwardBuffer({secondsAhead:2});
  assert.equal(starts,0);
});

test('manual quality changes the next load without seeking or changing play state', () => {
  const video={volume:1,muted:false,currentTime:42};
  const session=new PlayerSession({video,resolve:async()=>{},loadHls:async()=>{}});
  session.active=true;
  session.wantsPlay=false;
  session.mode='COMPATIBILITY';
  session.hls={levels:[{height:360,bitrate:320000},{height:720,bitrate:1800000}],loadLevel:-1,currentLevel:0};
  assert.equal(session.setQuality('720p'),true);
  assert.equal(session.hls.loadLevel,1);
  assert.equal(session.qualityHeight,720);
  assert.equal(video.currentTime,42);
  assert.equal(session.wantsPlay,false);
  assert.equal(session.setQuality('1080p'),false);
  assert.equal(session.hls.loadLevel,1);
  session.hls={levels:[{height:360,bitrate:320000},{height:720,bitrate:1800000}],loadLevel:-1,currentLevel:0};
  session.applyQuality();
  assert.equal(session.hls.loadLevel,1,'manual selection survives HLS reattachment');
  assert.equal(session.setQuality('auto'),true);
  assert.equal(session.hls.loadLevel,-1);
});

test('startup enters a small encoded video gap once the first segment is decodable', async () => {
  const video={volume:1,muted:false,currentTime:0,readyState:4,
    buffered:{length:1,start:()=>.083333,end:()=>4.01}};
  const session=new PlayerSession({video,resolve:async()=>{},loadHls:async()=>{}});
  session.active=true;
  session.sequence=1;
  session.seekSequence=1;
  session.mode='COMPATIBILITY';
  session.globalDuration=60;
  const op={sequence:1,seek:1,signal:new AbortController().signal};
  await session.waitForPresentation(0,op,100);
  assert.equal(video.currentTime,.083333);
  assert.ok(session.bufferManager.secondsAhead>3);
  video.currentTime=0;
  video.buffered={length:1,start:()=>.5,end:()=>4.5};
  await session.waitForPresentation(0,op,0);
  assert.equal(video.currentTime,0,'a larger unbuffered gap is never skipped');
});
