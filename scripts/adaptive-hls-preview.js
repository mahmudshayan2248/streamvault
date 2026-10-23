'use strict';

// Explicitly configured, loopback-only preview. No public prepare endpoint.
const fs=require('node:fs');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {AdaptiveHlsCache}=require('../lib/adaptive-hls');

async function main() {
  const local=process.env.SV_ADAPTIVE_PREVIEW_SOURCE;
  const remote=process.env.SV_ADAPTIVE_PREVIEW_SOURCE_URL;
  if(Boolean(local)===Boolean(remote)) throw new Error('Set exactly one preview source');
  const cacheDir=process.env.SV_ADAPTIVE_PREVIEW_CACHE || path.join(os.tmpdir(),'streamvault-adaptive-preview-cache');
  const port=Number(process.env.SV_ADAPTIVE_PREVIEW_PORT || 8766);
  if(!Number.isInteger(port)||port<1024||port>65535) throw new Error('Invalid preview port');
  let source,allowedRoots=[],allowedHosts=[];
  if(local) {
    const input=fs.realpathSync(local);
    const stat=fs.statSync(input);
    if(!stat.isFile()) throw new Error('Preview source must be a regular file');
    source={input,fingerprint:`${stat.size}:${stat.mtimeMs}`,remote:false};
    allowedRoots=[path.dirname(input)];
  } else {
    const host=process.env.SV_ADAPTIVE_PREVIEW_ALLOWED_HOST;
    const fingerprint=process.env.SV_ADAPTIVE_PREVIEW_SOURCE_FINGERPRINT;
    if(!host||!fingerprint) throw new Error('Remote preview requires explicit approved host and source fingerprint');
    source={input:remote,fingerprint,remote:true,authorized:true};
    allowedHosts=[host];
  }
  const cache=new AdaptiveHlsCache({cacheDir,allowedRoots,allowedHosts,
    allowedOrigin:'http://127.0.0.1:8765',
    maxCacheBytes:Number(process.env.SV_ADAPTIVE_PREVIEW_MAX_CACHE_BYTES)||12*1024**3,
    minFreeBytes:process.env.SV_ADAPTIVE_PREVIEW_MIN_FREE_BYTES===undefined
      ? undefined:Number(process.env.SV_ADAPTIVE_PREVIEW_MIN_FREE_BYTES)});
  const metadata=await cache.encode(source);
  const origin=`http://127.0.0.1:${port}`;
  const frontendOrigin='http://127.0.0.1:8765';
  const sendJson=(res,status,value)=>{
    const body=JSON.stringify(value);
    res.writeHead(status,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store',
      'Access-Control-Allow-Origin':frontendOrigin,'Vary':'Origin','Access-Control-Allow-Headers':'Range, Content-Type'});
    res.end(body);
  };
  const server=http.createServer((req,res)=>{
    if(req.headers.origin && req.headers.origin!==frontendOrigin) {res.writeHead(403);res.end();return;}
    if(req.method==='OPTIONS') {res.writeHead(204,{'Access-Control-Allow-Origin':frontendOrigin,'Vary':'Origin','Access-Control-Allow-Methods':'GET, HEAD, POST, OPTIONS','Access-Control-Allow-Headers':'Range, Content-Type'});res.end();return;}
    const url=new URL(req.url,origin);
    if(url.pathname==='/api/playback/preview' && req.method==='GET') {
      sendJson(res,200,{ok:true,id:'preview',title:'Adaptive preview',mode:'hls',strategy:'offline-adaptive',
        duration:metadata.duration,windowStart:0,hlsUrl:`${origin}/api/adaptive-hls/${metadata.key}/master.m3u8`,
        cacheKey:metadata.key,audioTracks:metadata.audioTracks,subtitleTracks:[],
        source:{canonicalId:`preview-${metadata.key}`,kind:source.remote?'remote':'local',fingerprint:source.fingerprint}});
      return;
    }
    if(url.pathname==='/api/playback/status' && req.method==='GET') {
      sendJson(res,200,{ok:true,activeWorkers:0,sessions:[{key:metadata.key,state:'complete',strategy:'offline-adaptive',speed:0,
        windowStart:0,outTimeSeconds:metadata.duration,running:false}]});return;
    }
    if(url.pathname===`/api/playback-hls/${metadata.key}/release` && req.method==='POST') {res.writeHead(204,{'Access-Control-Allow-Origin':frontendOrigin,'Vary':'Origin'});res.end();return;}
    const match=/^\/api\/adaptive-hls\/([a-f0-9]{32})\/(.+)$/.exec(url.pathname);
    if(match && ['GET','HEAD'].includes(req.method)) {cache.serve(req,res,match[1],match[2]);return;}
    sendJson(res,404,{ok:false,error:'Not found'});
  });
  server.listen(port,'127.0.0.1',()=>{
    process.stdout.write(`Adaptive backend preview ${origin} key=${metadata.key} profiles=${metadata.profiles.map(p=>p.name).join(',')}\n`);
  });
}
main().catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1;});
