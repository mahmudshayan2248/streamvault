'use strict';

// Passive adapter for the deployed playback capability. It never starts FFmpeg.
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {AdaptiveHlsCache}=require('./adaptive-hls');

function sha256(value) {return crypto.createHash('sha256').update(value).digest('hex');}
function localIdentity(source) {
  const input=fs.realpathSync(source.input);
  const stat=fs.statSync(input);
  if(!stat.isFile()) return null;
  return {input,fingerprint:`${stat.size}:${stat.mtimeMs}`};
}
function createAdaptiveCapability({cacheDir,allowedOrigin}) {
  if(!cacheDir || !allowedOrigin || !/^https?:\/\/[^/]+$/.test(allowedOrigin)) {
    throw new Error('Adaptive capability requires a cache directory and exact browser origin');
  }
  const cache=new AdaptiveHlsCache({cacheDir,allowedOrigin});
  function remoteBinding(source) {
    // Explicit, expiring binding prevents a URL-only fingerprint from silently
    // selecting stale media if a catalog URL is reused for different bytes.
    try {
      const bindings=JSON.parse(fs.readFileSync(path.join(cache.root,'bindings.json'),'utf8'));
      const binding=bindings[sha256(source.input)];
      if(!binding || binding.catalogFingerprint!==source.fingerprint ||
         !Number.isFinite(Date.parse(binding.expiresAt)) || Date.parse(binding.expiresAt)<=Date.now() ||
         !/^[a-f0-9]{64}$/.test(binding.sourceVersion)) return null;
      return {input:source.input,fingerprint:binding.sourceVersion};
    } catch {return null;}
  }
  function select(source,info) {
    let identity;
    try {identity=source.remote?remoteBinding(source):localIdentity(source);} catch {return null;}
    if(!identity) return null;
    const key=cache.keyFor(identity);
    const completed=cache.completed(key);
    if(!completed || completed.metadata.sourceFingerprint!==identity.fingerprint ||
       Math.abs(Number(completed.metadata.duration)-Number(info.duration))>2) return null;
    cache.hold(key);
    cache.touch(key,completed.dir);
    return {key,metadata:completed.metadata,hlsUrl:`/api/adaptive-hls/${key}/master.m3u8`};
  }
  function serve(req,res) {
    cache.serve(req,res,req.params.key,req.params[0]);
  }
  function release(key) {
    if(!cache.completed(key)) return false;
    cache.release(key);
    return true;
  }
  return {select,serve,release,cache};
}

module.exports={createAdaptiveCapability,localIdentity,sha256};
