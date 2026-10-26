'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {PlayerSession,CompatibilityTransport}=require(process.env.SV_PLAYER_UNDER_TEST||'../hostinger/player-session');
const ranges=(start,end)=>({length:1,start:()=>start,end:()=>end});
class Video extends EventTarget {
  constructor(){super();Object.assign(this,{volume:1,muted:false,currentTime:5,readyState:4,seeking:false,paused:true,
    buffered:ranges(0,100),seekable:ranges(0,10)});}
  pause(){this.paused=true;}
  async play(){this.paused=false;}
  removeAttribute(){}
  load(){}
}
function active(t){
  const video=new Video();
  const session=new PlayerSession({video,resolve:async()=>{},loadHls:async()=>{}});
  Object.assign(session,{active:true,sequence:1,seekSequence:1,mode:'DIRECT',state:'PAUSED',wantsPlay:false});
  session.masterClock.reset(100,5,0);
  session.capability={mode:'direct',duration:100};
  t.after(()=>session.close());
  return {session,video,op:{sequence:1,seek:1,signal:new AbortController().signal}};
}
test('a seek that never reaches its target fails instead of reporting success',async t=>{
  const {session,op}=active(t);
  await assert.rejects(session.waitForPresentation(50,op,0));
  assert.equal(session.getCurrentTime(),5);
});
test('currentTime assignment alone is not decoded-frame readiness',async t=>{
  const {session,video,op}=active(t);
  video.currentTime=50;video.seeking=true;
  await assert.rejects(session.waitForPresentation(50,op,0));
  video.seeking=false;video.readyState=1;
  await assert.rejects(session.waitForPresentation(50,op,0));
  video.readyState=4;
  await session.waitForPresentation(50,op,0);
});
test('seek requests during capability resolution retain the latest destination',async t=>{
  const video=new Video();let finishResolve;
  const session=new PlayerSession({video,resolve:()=>new Promise(r=>finishResolve=r),loadHls:async()=>{}});
  t.after(()=>session.close());
  const attached=[];
  session.attach=async(cap,target)=>{attached.push(target);session.masterClock.commitWindow(0,target);};
  session.hydrateSubtitles=()=>{};
  const started=session.start({id:'episode'},{resume:10});
  const first=session.seekTo(25),last=session.seekTo(75);
  finishResolve({id:'episode',mode:'direct',duration:100,audioTracks:[],subtitleTracks:[]});
  assert.equal(await started,true);
  assert.equal(await first,false);
  assert.equal(await last,true);
  assert.deepEqual(attached,[75]);
});
test('closing resolves queued seeks without transferring them to another title',async t=>{
  const {session}=active(t);session.capability=null;
  const pending=session.seekTo(50);
  session.close();
  assert.equal(await pending,false);
});
test('late native events cannot complete the owning seek or overwrite its state',t=>{
  const {session,video}=active(t);
  session.bindEvents();session.seeking=true;session.state='BUFFERING';session.wantsPlay=true;
  video.dispatchEvent(new Event('seeked'));
  video.dispatchEvent(new Event('playing'));
  assert.equal(session.seeking,true);
  assert.equal(session.state,'BUFFERING');
});
test('complete VOD seeks use its segments beyond the native seekable window',t=>{
  const {session}=active(t);
  const transport=new CompatibilityTransport(session);
  transport.hls={currentLevel:0,levels:[{details:{live:false,totalduration:100,fragments:[{start:0}]}}]};
  assert.equal(transport.contains(90),true);
  assert.equal(transport.contains(110),false);
});
test('rapid seeks retain confirmed time until the latest media position is ready',async t=>{
  const {session,video}=active(t);const waits=[];
  session.adapter={contains:()=>true,isBuffered:()=>true,seek:time=>{video.currentTime=time;},destroy(){}};
  session.waitForPresentation=()=>new Promise(resolve=>waits.push(resolve));
  const old=session.seekTo(25),latest=session.seekTo(90);
  assert.equal(session.getCurrentTime(),5,'the clock must not claim a requested position is presented');
  waits[0]();assert.equal(await old,false);
  waits[1]();assert.equal(await latest,true);
  assert.equal(session.getCurrentTime(),90);
  assert.equal(session.state,'PAUSED');assert.equal(video.paused,true);
  assert.equal(session.metrics.seeks.length,1);
});
test('relative seeks accumulate against the pending destination',async t=>{
  const {session,video}=active(t);const waits=[];
  session.adapter={contains:()=>true,isBuffered:()=>true,seek:time=>{video.currentTime=time;},destroy(){}};
  session.waitForPresentation=()=>new Promise(resolve=>waits.push(resolve));
  const first=session.seekBy(10),second=session.seekBy(10),last=session.seekBy(-10);
  assert.equal(session.lastSeekTarget,15);
  waits.forEach(resolve=>resolve());
  assert.deepEqual(await Promise.all([first,second,last]),[false,false,true]);
  assert.equal(session.getCurrentTime(),15);
});
test('HLS seeks preserve active audio/init loading and resume stopped loading at the new time',t=>{
  const {session,video}=active(t);const calls=[];
  const transport=new CompatibilityTransport(session);
  transport.hls={loadingEnabled:true,startLoad:time=>calls.push([time,video.currentTime])};
  transport.seek(30,{buffered:false});
  assert.equal(video.currentTime,30);assert.deepEqual(calls,[]);
  transport.hls.loadingEnabled=false;
  transport.seek(60,{buffered:false});
  assert.deepEqual(calls,[[60,60]]);
});
