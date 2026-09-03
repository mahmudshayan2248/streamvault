'use strict';

const http = require('http');
const WebSocket = require('ws');

const port = Number(process.env.SV_CDP_PORT || 9223);
const durationMs = Math.max(60_000, Number(process.env.SV_ACCEPTANCE_MS || 15 * 60_000));

function jsonRequest(method, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path: pathname }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const target = await jsonRequest('PUT', `/json/new?${encodeURIComponent('https://streamvault.fit/?debug=1&acceptance=player-v7')}`);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const network = [];
  const consoleErrors = [];
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method === 'Network.requestWillBeSent' && /(?:playback|playback-source)/.test(message.params.request.url)) {
      network.push({ event: 'request', at: Date.now(), url: message.params.request.url, range: message.params.request.headers.Range || '' });
    }
    if (message.method === 'Network.responseReceived' && /(?:playback|playback-source)/.test(message.params.response.url)) {
      const headers = message.params.response.headers || {};
      network.push({ event: 'response', at: Date.now(), url: message.params.response.url, status: message.params.response.status,
        range: headers['content-range'] || headers['Content-Range'] || '', sourceKind: headers['x-streamvault-source-kind'] || headers['X-StreamVault-Source-Kind'] || '' });
    }
    if (message.method === 'Network.loadingFailed' && /(?:playback|playback-source)/.test(message.params.blockedReason || message.params.errorText || '')) {
      network.push({ event: 'failed', at: Date.now(), error: message.params.errorText, canceled: message.params.canceled });
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(message.params.args.map(arg => arg.value || arg.description || '').join(' ').slice(0, 500));
    }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'browser evaluation failed');
    return result.result.value;
  };

  await new Promise(resolve => socket.once('open', resolve));
  await Promise.all([call('Page.enable'), call('Runtime.enable'), call('Network.enable')]);
  const readyDeadline = Date.now() + 120_000;
  while (Date.now() < readyDeadline) {
    const ready = await evaluate(`document.readyState==='complete' && window.STREAMVAULT_PLAYER_VERSION==='player-v7'`);
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const installed = await evaluate(`(()=>{
    const video=document.getElementById('videoPlayer');
    if(!video||window.__svProdAcceptance)return false;
    const state={startedAt:performance.now(),events:[],firstPlayingMs:null,seeks:[]};
    for(const type of ['loadstart','loadedmetadata','canplay','playing','waiting','stalled','seeking','seeked','pause','error','ended']){
      video.addEventListener(type,()=>{
        const row={type,ms:Math.round(performance.now()-state.startedAt),time:Number(video.currentTime.toFixed(3)),readyState:video.readyState,networkState:video.networkState};
        if(type==='playing'&&state.firstPlayingMs===null)state.firstPlayingMs=row.ms;
        state.events.push(row);
      });
    }
    window.addEventListener('streamvault:playback-state',event=>state.events.push({type:'state:'+event.detail.state,ms:Math.round(performance.now()-state.startedAt),time:Number(video.currentTime.toFixed(3))}));
    window.__svProdAcceptance=state;
    return true;
  })()`);
  if (!installed) throw new Error('player-v7 acceptance hooks did not install');
  await evaluate(`window.playMedia('ftp_8761','Avengers of Justice-Farce Wars (2018)','2018')`);

  const startedAt = Date.now();
  const seekSchedule = [
    { at: 3 * 60_000, ratio: 0.25 },
    { at: 6 * 60_000, ratio: 0.75 },
    { at: 10 * 60_000, ratio: 0.93 },
  ];
  let nextSeek = 0;
  while (Date.now() - startedAt < durationMs) {
    const elapsed = Date.now() - startedAt;
    if (nextSeek < seekSchedule.length && elapsed >= seekSchedule[nextSeek].at) {
      const ratio = seekSchedule[nextSeek].ratio;
      await evaluate(`(()=>{const v=document.getElementById('videoPlayer');const target=v.duration*${ratio};window.__svProdAcceptance.seeks.push({requested:target,at:performance.now()});v.currentTime=target;return target})()`);
      nextSeek += 1;
    }
    const snapshot = await evaluate(`(()=>{const v=document.getElementById('videoPlayer');return {elapsedMs:Math.round(performance.now()-window.__svProdAcceptance.startedAt),currentTime:v.currentTime,duration:v.duration,paused:v.paused,readyState:v.readyState,buffered:v.buffered.length?[v.buffered.start(0),v.buffered.end(v.buffered.length-1)]:[],decoded:v.webkitDecodedFrameCount||0,dropped:v.webkitDroppedFrameCount||0}})()`);
    process.stdout.write(`${JSON.stringify({ progress: snapshot })}\n`);
    await new Promise(resolve => setTimeout(resolve, 30_000));
  }

  const result = await evaluate(`(()=>{
    const v=document.getElementById('videoPlayer');
    const wrap=document.getElementById('progressWrap');
    const thumb=document.getElementById('progressThumb');
    const played=document.getElementById('progressPlayed');
    const controls=[...document.querySelectorAll('.player-controls .ctrl')];
    const wr=wrap?.getBoundingClientRect(),tr=thumb?.getBoundingClientRect();
    const expectedX=wr&&Number.isFinite(v.duration)&&v.duration>0?wr.left+wr.width*(v.currentTime/v.duration):null;
    return {version:window.STREAMVAULT_PLAYER_VERSION,state:window.StreamVaultVlcPlayerV1?.session?.state,
      source:window.StreamVaultVlcPlayerV1?.session?.source,capability:window.StreamVaultVlcPlayerV1?.session?.capability,
      firstPlayingMs:window.__svProdAcceptance.firstPlayingMs,events:window.__svProdAcceptance.events,seeks:window.__svProdAcceptance.seeks,
      media:{currentTime:v.currentTime,duration:v.duration,paused:v.paused,ended:v.ended,error:v.error&&{code:v.error.code,message:v.error.message},readyState:v.readyState,networkState:v.networkState,decoded:v.webkitDecodedFrameCount||0,dropped:v.webkitDroppedFrameCount||0,audioBytes:v.webkitAudioDecodedByteCount||0,textTracks:v.textTracks.length},
      ui:{thumbCenterX:tr?tr.left+tr.width/2:null,expectedX,thumbErrorPx:tr&&expectedX!==null?Math.abs((tr.left+tr.width/2)-expectedX):null,playedWidth:played?.getBoundingClientRect().width||0,progressWidth:wr?.width||0,roundedControls:controls.length>0&&controls.every(el=>parseFloat(getComputedStyle(el).borderRadius)>0),controlCount:controls.length,subtitleLabel:document.getElementById('subLabel')?.textContent||'',subtitleMenu:document.getElementById('subList')?.textContent||''}};
  })()`);
  process.stdout.write(`${JSON.stringify({ final: result, network, consoleErrors }, null, 2)}\n`);
  socket.close();
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
