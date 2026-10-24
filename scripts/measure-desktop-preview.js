'use strict';
// Run only against the loopback adaptive preview with a completed package.
// Start Chrome with --headless=new --remote-debugging-port=9229 and an isolated
// --user-data-dir, then run: node scripts/measure-desktop-preview.js 1 adaptive 600
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const speedProfile=process.argv[2]||'20';
const mode=process.argv[3]||'adaptive';
const duration=Number(process.argv[4]||600);
const port=Number(process.env.SV_CDP_PORT||9229);
const WebSocket=globalThis.WebSocket || require('ws');let activeTarget=null;
process.on('SIGINT',async()=>{if(activeTarget)await fetch(`http://127.0.0.1:${port}/json/close/${activeTarget}`).catch(()=>{});process.exit(130)});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const presets={
  '20':()=>20,'5':()=>5,'1':()=>1,'0.5':()=>.5,
  fluctuate:t=>[.5,1,5,1,0.5,5][Math.floor(t/30)%6],
  disconnect:t=>(t>=180&&t<190)||(t>=360&&t<370)?0:2,
};
if(!presets[speedProfile]||!['adaptive','single'].includes(mode)||duration<1)throw new Error('Invalid profile, mode, or duration');
async function run(){
 const existing=(await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(x=>x.type==='page'&&x.url.includes('/adaptive-preview.html'));if(existing.length>=2)throw Error('Too many active preview tabs for a controlled test');
 const target=await (await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:8765/adaptive-preview.html`,{method:'PUT'})).json();
 activeTarget=target.id;const ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
 let nextId=1;const pending=new Map(),requestUrls=new Map();const network={bytes:0,failures:[],statuses:[],responses:0};
 ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}else if(m.method==='Network.requestWillBeSent')requestUrls.set(m.params.requestId,m.params.request.url);else if(m.method==='Network.responseReceived'){const u=requestUrls.get(m.params.requestId)||'';if(/\/api\/adaptive-hls\//.test(u)){network.responses++;if(m.params.response.status>=400)network.statuses.push({status:m.params.response.status,path:u.split('/').slice(-3).join('/')})}}else if(m.method==='Network.loadingFinished'){const u=requestUrls.get(m.params.requestId)||'';if(/\/api\/adaptive-hls\//.test(u))network.bytes+=m.params.encodedDataLength||0}else if(m.method==='Network.loadingFailed'){const u=requestUrls.get(m.params.requestId)||'';if(!m.params.canceled)network.failures.push({error:m.params.errorText,path:u.split('/').slice(-3).join('/')})}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=nextId++;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
 const evalJs=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
 const link=async speed=>send('Network.emulateNetworkConditions',{offline:speed===0,latency:100,downloadThroughput:speed*1e6/8,uploadThroughput:speed*1e6/8});
 await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Page.enable');await send('Runtime.enable');
 await link(presets[speedProfile](0));
 await send('Page.navigate',{url:`http://127.0.0.1:8765/adaptive-preview.html?${mode==='single'?'single=1&':''}case=${speedProfile}&t=${Date.now()}`});
 let loaded=false;for(let i=0;i<120;i++){loaded=await evalJs('typeof Hls !== "undefined" && typeof session !== "undefined"');if(loaded)break;await sleep(500)}
 if(!loaded)throw Error('Hls.js or PlayerSession did not load');
 const started=Date.now();await evalJs('void session.start({id:"preview"}); true');
 const samples=[];let lastSpeed=presets[speedProfile](0),lastBytes=0;let lastTime=0;
 for(let sec=1;sec<=duration;sec++){
  const wanted=presets[speedProfile](sec);
  if(wanted!==lastSpeed){await link(wanted);lastSpeed=wanted}
  const targetAt=started+sec*1000;await sleep(Math.max(0,targetAt-Date.now()));
  const state=await evalJs(`(()=>({state:session.state,time:video.currentTime,ready:video.readyState,paused:video.paused,bufferAhead:session.bufferManager.secondsAhead,bufferEnd:video.buffered.length?video.buffered.end(video.buffered.length-1):0,playbackRate:video.playbackRate,droppedFrames:video.getVideoPlaybackQuality?.().droppedVideoFrames??null,totalFrames:video.getVideoPlaybackQuality?.().totalVideoFrames??null,level:session.hls?.currentLevel??null,levels:session.hls?.levels?.map(x=>({height:x.height,bitrate:x.bitrate}))||[],errors:session.metrics.errors.length,stalls:session.metrics.stalls.length,firstFrameAt:session.metrics.firstFrameAt,readyAt:session.metrics.readyAt,startedAt:session.metrics.startedAt,metrics:session.metrics.stalls}))()`);
  samples.push({sec,linkMbps:wanted,state:state.state,time:state.time,advanced:Math.max(0,state.time-lastTime),bufferAhead:state.bufferAhead,bufferEnd:state.bufferEnd,playbackRate:state.playbackRate,droppedFrames:state.droppedFrames,totalFrames:state.totalFrames,level:state.level,bytes:network.bytes-lastBytes,errors:state.errors,stalls:state.stalls});
  lastTime=state.time;lastBytes=network.bytes;
  if(sec%60===0)process.stdout.write(JSON.stringify({profile:speedProfile,mode,sec,time:Number(state.time.toFixed(2)),state:state.state,level:state.level,stalls:state.stalls,bytes:network.bytes})+'\n');
  if(state.state==='ERROR')break;
 }
 const final=await evalJs(`(()=>({state:session.state,time:video.currentTime,firstFrameAt:session.metrics.firstFrameAt,readyAt:session.metrics.readyAt,startedAt:session.metrics.startedAt,stalls:session.metrics.stalls,errors:session.metrics.errors,levels:session.hls?.levels?.map(x=>({height:x.height,bitrate:x.bitrate}))||[]}))()`);
 const result={profile:speedProfile,mode,duration,wallSeconds:(Date.now()-started)/1000,final,network,samples};
 const outputDir=process.env.SV_BENCH_OUTPUT_DIR || os.tmpdir();
 const label=process.env.SV_BENCH_LABEL || String(Date.now());
 if(!/^[A-Za-z0-9_-]+$/.test(label)) throw Error('Invalid benchmark label');
 fs.mkdirSync(outputDir,{recursive:true});
 const out=path.join(outputDir,`sv-sustain-${speedProfile.replace('.','p')}-${mode}-${label}.json`);
 fs.writeFileSync(out,JSON.stringify(result));
 const played=samples.reduce((a,x)=>a+x.advanced,0), stalled=samples.filter(x=>x.state==='BUFFERING').length;
 const transitions=samples.reduce((a,x,i)=>a+(i&&x.level!==samples[i-1].level?1:0),0);const lowAdvancementSeconds=samples.filter(x=>x.sec>5&&x.state==='PLAYING'&&x.advanced<0.1).length;const mediaJumps=samples.filter(x=>x.advanced>1.5).map(x=>({sec:x.sec,advanced:x.advanced}));
 process.stdout.write(JSON.stringify({file:out,profile:speedProfile,mode,observedSeconds:samples.length,startupMs:final.firstFrameAt&&final.startedAt?final.firstFrameAt-final.startedAt:null,readyMs:final.readyAt&&final.startedAt?final.readyAt-final.startedAt:null,played,bufferingSampleSeconds:stalled,bufferingRatio:stalled/samples.length,transitions,lowAdvancementSeconds,mediaJumps,networkBytes:network.bytes,uncanceledNetworkFailures:network.failures.length,finalState:final.state,finalTime:final.time,errors:final.errors.length,stalls:final.stalls.length})+'\n');
 ws.close();await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(()=>{});activeTarget=null;
}
run().catch(async e=>{console.error(e.stack);if(activeTarget)await fetch(`http://127.0.0.1:${port}/json/close/${activeTarget}`).catch(()=>{});process.exitCode=1});
