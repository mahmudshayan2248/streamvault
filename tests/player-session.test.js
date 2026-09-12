'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {PlayerSession,MasterClock,BufferManager,SeekGeometry,windowVtt} = require('../hostinger/player-session');
const {migrateApp,migrateIndex} = require('../scripts/migrate-player-session');
const fs = require('node:fs');
const deferred = () => {let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick = () => new Promise(resolve=>setImmediate(resolve));
const ranges = (start,end) => ({length:1,start:()=>start,end:()=>end});
class Video extends EventTarget {
  constructor() {super();Object.assign(this,{currentTime:0,duration:35,readyState:0,volume:1,muted:false,paused:true,playbackRate:1,buffered:ranges(0,35),seekable:ranges(0,35),src:''});}
  load() {this.readyState=0; if(this.src) queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('loadedmetadata'));});}
  pause() {this.paused=true;this.dispatchEvent(new Event('pause'));}
  play() {this.paused=false;this.dispatchEvent(new Event('playing'));return Promise.resolve();}
  removeAttribute(name) {if(name==='src')this.src='';}
  canPlayType() {return '';}
}
class Hls {
  static instances=[];
  static Events=Object.fromEntries(['FRAG_LOADED','AUDIO_TRACKS_UPDATED','AUDIO_TRACK_SWITCHED','MEDIA_ATTACHED','MANIFEST_PARSED','FRAG_BUFFERED','ERROR'].map(name=>[name,name]));
  static isSupported(){return true;}
  constructor(config){this.config=config;this.handlers={};this.audioTracks=[{id:0},{id:1}];Hls.instances.push(this);}
  on(event,handler){(this.handlers[event]||=[]).push(handler);}
  emit(event,data={}){for(const h of this.handlers[event]||[])h(event,data);}
  attachMedia(video){this.video=video;this.emit('MEDIA_ATTACHED');}
  loadSource(url){this.url=url;this.video.src=url;queueMicrotask(()=>{if(!this.destroyed){this.emit('MANIFEST_PARSED');this.emit('FRAG_BUFFERED');}});}
  destroy(){this.destroyed=true;}
}
const capability = (mode='direct',start=0,id='media') => ({mode,duration:3009.877,windowStart:start,directUrl:`/${id}.mp4`,hlsUrl:`/${id}-${start}.m3u8`,cacheKey:mode==='hls'?`${id}-${start}`:null,id,source:{canonicalId:id,fingerprint:id},audioTracks:[{default:true},{default:false}],subtitleTracks:[]});
function session(t,options={}) {const s=new PlayerSession({video:new Video(),resolve:async()=>capability(),loadHls:async()=>Hls,...options});t.after(()=>s.close());return s;}

test('canonical duration cannot be overwritten by a temporary source duration',async t=>{
  const s=session(t,{resolve:async()=>capability('hls',1800)});
  await s.start({id:'media'});
  s.video.currentTime=4;
  s.video.dispatchEvent(new Event('timeupdate'));
  s.video.dispatchEvent(new Event('durationchange'));
  assert.equal(s.globalDuration,3009.877);
  assert.equal(s.globalCurrentTime,1804);
});
test('master clock owns global-local mapping and freezes during seek',()=>{
  const clock=new MasterClock();clock.reset(3009.877,2400,2399.147);
  assert.ok(Math.abs(clock.globalToLocal(2400)-.853)<1e-9);
  clock.freezeAt(1200);clock.update(42);
  assert.equal(clock.globalCurrentTime,1200);
  clock.commitWindow(1197.5,2.5);
  assert.equal(clock.globalCurrentTime,1200);
  assert.equal(clock.canonicalDuration,3009.877);
});
test('shared seek geometry uses the rendered rectangle for input and output',()=>{
  const track={getBoundingClientRect:()=>({left:100,width:800})};
  for(const ratio of [0,.1,.25,.5,.75,.9,1]) {
    assert.equal(SeekGeometry.ratioFromClientX(track,100+800*ratio),ratio);
    assert.equal(SeekGeometry.time(ratio,3000),ratio*3000);
    assert.equal(SeekGeometry.percent(ratio,1),`${(ratio*100).toFixed(3)}%`);
  }
  assert.equal(SeekGeometry.ratioFromClientX(track,-50),0);
  assert.equal(SeekGeometry.ratioFromClientX(track,1000),1);
});
test('buffer manager reports the range containing the presentation clock',()=>{
  const clock=new MasterClock();clock.reset(3009,1804,1800);
  const manager=new BufferManager(clock);
  const video={currentTime:4,buffered:ranges(1,94)};
  assert.deepEqual(manager.sample(video,'COMPATIBILITY'),{
    bufferedStart:1801,bufferedEnd:1894,secondsAhead:90,secondsBehind:3,
    targetBuffer:90,minimumSafeBuffer:6,networkThroughput:null,sourceThroughput:null,generationSpeed:null,
  });
});
test('concurrent starts and close invalidate old resolver responses',async t=>{
  const a=deferred(), b=deferred();
  const s=session(t,{resolve:source=>source.id==='a'?a.promise:b.promise});
  const first=s.start({id:'a'}), second=s.start({id:'b'});
  b.resolve(capability('direct',0,'b'));await second;
  a.resolve(capability('direct',0,'a'));await first;
  assert.equal(s.canonicalMediaId,'b');assert.equal(s.video.src,'/b.mp4');
  const c=deferred();s.resolve=()=>c.promise;
  const pending=s.start({id:'c'});s.close();c.resolve(capability('direct',0,'c'));await pending;
  assert.equal(s.state,'IDLE');assert.equal(s.video.src,'');
});
test('a newer in-buffer seek aborts a pending deep seek',async t=>{
  const deep=deferred();let signal;
  const s=session(t,{resolve:async (_source,options)=>{if(options.start){signal=options.signal;return deep.promise;}return capability('hls');}});
  await s.start({id:'media'});
  const pending=s.seekTo(1800);
  await s.seekTo(10);
  assert.equal(signal.aborted,true);
  deep.resolve(capability('hls',1800));await pending;
  assert.equal(s.windowStart,0);assert.equal(s.video.currentTime,10);assert.equal(s.globalDuration,3009.877);
});
test('out-of-order deep seeks never attach the older source',async t=>{
  const a=deferred(),b=deferred();
  const s=session(t,{resolve:async (_source,options)=>options.start===300?a.promise:options.start===1200?b.promise:capability('hls')});
  await s.start({id:'media'});
  const first=s.seekTo(300), second=s.seekTo(1200);
  b.resolve(capability('hls',1200));await second;
  a.resolve(capability('hls',300));await first;
  assert.equal(s.windowStart,1200);assert.equal(s.video.src,'/media-1200.m3u8');
});
test('30 deterministic seeks keep one timeline, one HLS instance, and one duration',async t=>{
  Hls.instances=[];
  const s=session(t,{resolve:async(_source,options)=>capability('hls',options.start?Math.max(0,options.start-1):0)});
  await s.start({id:'media'});
  const initialGeneration=s.seekSequence;
  const targets=Array.from({length:30},(_,i)=>((i*977+313)%2990)+.25);
  for(const target of targets) {
    assert.equal(await s.seekTo(target),true);
    assert.ok(Math.abs(s.getCurrentTime()-target)<.001);
    assert.equal(s.getDuration(),3009.877);
    assert.equal(Hls.instances.filter(instance=>!instance.destroyed).length,1);
  }
  assert.equal(s.seekSequence,initialGeneration+30);
});
test('a deferred HLS library load cannot attach after close and reopen',async t=>{
  const loading=deferred();const s=session(t,{resolve:async()=>capability('hls'),loadHls:()=>loading.promise});
  const first=s.start({id:'media'});await tick();
  s.close();s.resolve=async()=>capability('direct',0,'next');
  await s.start({id:'next'});loading.resolve(Hls);await first;
  assert.equal(s.video.src,'/next.mp4');assert.equal(s.hls,null);
});
test('audio switching preserves source, time, pause and preferences without timers',async t=>{
  const s=session(t,{resolve:async()=>capability('hls')});await s.start({id:'media'});
  s.pause();s.setSpeed(1.5);s.setVolume(.35);s.setMuted(true);s.video.currentTime=17;
  const source=s.video.src, hls=s.hls;
  assert.equal(s.setAudio(1),true);await tick();
  assert.equal(s.hls,hls);assert.equal(s.hls.audioTrack,1);assert.equal(s.video.src,source);
  assert.equal(s.video.currentTime,17);assert.equal(s.video.paused,true);assert.equal(s.video.playbackRate,1.5);assert.equal(s.video.volume,.35);assert.equal(s.video.muted,true);
});
test('deep seek uses latest pause and audio intent, not a snapshot from before the request',async t=>{
  const seek=deferred();const s=session(t,{resolve:async (_source,o)=>o.start?seek.promise:capability('hls')});
  await s.start({id:'media'});const pending=s.seekTo(1800);s.pause();s.setAudio(1);s.setSpeed(1.5);
  seek.resolve(capability('hls',1800));await pending;
  assert.equal(s.video.paused,true);assert.equal(s.hls.audioTrack,1);assert.equal(s.video.playbackRate,1.5);
});
test('VOD HLS explicitly starts at zero and disables live-edge catch-up',async t=>{
  const s=session(t,{resolve:async()=>capability('hls')});await s.start({id:'media'});
  assert.equal(s.hls.config.startPosition,0);assert.equal(s.hls.config.lowLatencyMode,false);assert.equal(s.hls.config.maxLiveSyncPlaybackRate,1);
});
test('only one session may own the video',t=>{const s=session(t);assert.throws(()=>new PlayerSession({video:s.video}),/already has/);});
test('WebVTT shifts full-media cues into a seek window, retaining overlapping cues',()=>{
  const text='WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nold\n\n00:29:59.000 --> 00:30:02.000\noverlap\n\n00:30:04.000 --> 00:30:06.000\ncurrent\n';
  const shifted=windowVtt(text,1800);
  assert.doesNotMatch(shifted,/old/);assert.match(shifted,/00:00:00.000 --> 00:00:02.000/);assert.match(shifted,/00:00:04.000 --> 00:00:06.000/);
});
test('deployment retires all competing hotfix scripts and installs the shared engine once',()=>{
  const challenge='<script>(function(){window.__CF$cv$params={};var a="/cdn-cgi/challenge-platform/scripts/jsd/main.js"})();</script>';
  const html='<script src="/instant-remux-v23.js?v=1"></script><script src="/vod-buffer-engine-v1.js?v=1"></script><script src="/playback-stability-hotfix-v2.js?v=1"></script><script defer src="/player-vlc-v1.js?v=old"></script>'+challenge;
  const migrated=migrateIndex(html);assert.doesNotMatch(migrated,/instant-remux|vod-buffer-engine|stability-hotfix|cdn-cgi\/challenge-platform/);assert.equal((migrated.match(/player-session.js/g)||[]).length,1);assert.equal(migrateIndex(migrated),migrated);
  const app=fs.readFileSync(require.resolve('../hostinger/app-v3.js'),'utf8');assert.equal(migrateApp(app),app);assert.match(app,/hls\.js@1\.7\.3\/dist\/hls\.min\.js/);assert.doesNotMatch(app,/hls\.js@latest/);
});
