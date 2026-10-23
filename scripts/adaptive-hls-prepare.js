'use strict';

// Offline operator job. No web route starts this process.
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {AdaptiveHlsCache}=require('../lib/adaptive-hls');
const {localIdentity,sha256}=require('../lib/adaptive-capability');

async function main() {
  const cacheDir=process.env.SV_ADAPTIVE_CACHE_DIR;
  const local=process.env.SV_ADAPTIVE_SOURCE;
  const remote=process.env.SV_ADAPTIVE_SOURCE_URL;
  if(!cacheDir || Boolean(local)===Boolean(remote)) throw new Error('Set cache dir and exactly one source');
  const options={cacheDir,ffmpegBin:process.env.SV_ADAPTIVE_FFMPEG||'ffmpeg',
    ffprobeBin:process.env.SV_ADAPTIVE_FFPROBE||'ffprobe'};
  let source;
  if(local) {
    const identity=localIdentity({input:local});
    if(!identity) throw new Error('Local source must be a file');
    options.allowedRoots=[path.dirname(identity.input)];
    source={...identity,remote:false};
  } else {
    const host=process.env.SV_ADAPTIVE_ALLOWED_HOST;
    const sourceVersion=process.env.SV_ADAPTIVE_SOURCE_VERSION;
    if(!host || !/^[a-f0-9]{64}$/.test(sourceVersion||'')) throw new Error('Remote job needs approved host and 64-digit source version');
    const url=new URL(remote);
    if(url.hostname.toLowerCase()!==host.toLowerCase()) throw new Error('Remote host does not match approval');
    options.allowedHosts=[host];
    source={input:remote,fingerprint:sourceVersion,remote:true,authorized:true};
  }
  const cache=new AdaptiveHlsCache(options);
  const metadata=await cache.encode(source);
  if(remote) {
    const file=path.join(cache.root,'bindings.json');
    let bindings={};
    try {bindings=JSON.parse(fs.readFileSync(file,'utf8'));} catch(error) {
      if(error.code!=='ENOENT') throw error;
    }
    if(!bindings || Array.isArray(bindings) || typeof bindings!=='object') throw new Error('Invalid remote binding file');
    const catalogFingerprint=crypto.createHash('sha1').update(remote).digest('hex').slice(0,20);
    bindings[sha256(remote)]={catalogFingerprint,sourceVersion:source.fingerprint,
      expiresAt:new Date(Date.now()+24*60*60*1000).toISOString()};
    const temp=path.join(cache.root,`.bindings-${process.pid}.tmp`);
    try {fs.writeFileSync(temp,JSON.stringify(bindings,null,2),{mode:0o600,flag:'wx'});fs.renameSync(temp,file);}
    finally {if(fs.existsSync(temp)) fs.unlinkSync(temp);}
  }
  process.stdout.write(JSON.stringify({key:metadata.key,duration:metadata.duration,
    profiles:metadata.profiles.map(item=>item.name),audioTracks:metadata.audioTracks.length})+'\n');
}

main().catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1;});
