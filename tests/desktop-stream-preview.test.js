'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const code = fs.readFileSync(path.join(__dirname, '../public/desktop-stream-preview.js'),'utf8');
function fixture(search, mobile=false) {
  const controls = [], events = new Map(), timers = [], fetches = [];
  function element(tag) {return { tag, style:{},children:[],listeners:new Map(),value:'auto',textContent:'',
    classList:{add(){},remove(){}},setAttribute(){},appendChild(c){this.children.push(c)},addEventListener(k,f){this.listeners.set(k,f)} }; }
  const video = { paused:false, readyState:1, currentTime:15, _sourceOffset:0,
    play(){return Promise.resolve()},pause(){},addEventListener(n,fn){events.set(n,fn)} };
  const context = {
    location:{search},window:{},console,document:{querySelector:()=>({appendChild:n=>controls.push(n)}),
      getElementById:()=>element('spinner'),createElement:element},
    URLSearchParams,AbortController,HTMLMediaElement:{HAVE_FUTURE_DATA:3},
    setTimeout(fn,ms){const t={fn,ms};timers.push(t);return t}, clearTimeout(){},
    currentStreamId:42, currentAudioIdx:0,availableAudio:[], _ftpStreamUrl:'',
    isLiveMode:false, isMobilePlaybackClient:()=>mobile,vid:video,
    playMedia:async()=>{},playFtpMedia:async()=>{},seekToTime:()=>{},closePlayer:()=>{},
    playbackTime:()=>15,attachPlayerSource:async(src,mode)=>{fetches.push('ATTACH ' + mode + ' ' + src);return true;}, showToast(){},
    fetch:async url=>{fetches.push(url);return {ok:true,text:async()=> '#EXTM3U\n#EXTINF:3,\nseg_00000.ts'};},
    _ftpNeedsTranscode:false, _currentFtpPlaybackPlan:null,_currentPlaybackPlan:{mode:'direct',src:'/stream/42'},
    fetchLocalPlaybackPlan:async()=>({src:'/stream/42',mode:'direct'}),
    fetchFtpPlaybackPlan:async()=>({src:'/api/ftp/proxy',mode:'direct'}),
    planNeedsSourceSeek:()=>false,
  };
  vm.createContext(context);
  vm.runInContext(code,context);
  return {context,video,controls,events,timers,fetches};
}

test('desktop data saver is disabled by default and on phones',()=>{
  for(const [search,mobile] of [['',false],['?streamPreview=1',true]]){
    const x=fixture(search,mobile);
    assert.equal(x.controls.length,0);
    assert.equal(x.context.window.SV_DESKTOP_STREAM_PREVIEW,undefined);
  }
});
test('long desktop rebuffer requests lower-bitrate HLS, not a throttled original', async()=>{
  const x=fixture('?streamPreview=1');
  assert.equal(x.controls.length,1);
  assert.equal(x.context.window.SV_DESKTOP_STREAM_PREVIEW,true);
  assert.ok(x.events.has('waiting'));
  x.events.get('waiting')();
  const stall=x.timers.find(t=>t.ms===6000);
  assert.ok(stall,'stall debounce timer should exist');
  stall.fn();
  for(let i=0;i<12;i++) await Promise.resolve();
  assert.ok(x.fetches.some(url=>url.includes('/api/desktop-hls/local/42/index.m3u8?') && url.includes('quality=480p')));
  assert.ok(x.fetches.some(url=>url.startsWith('ATTACH hls /api/desktop-hls/local/42/')), 'HLS should attach after preflight');
});
