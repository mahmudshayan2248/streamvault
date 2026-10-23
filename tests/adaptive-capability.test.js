'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createAdaptiveCapability,sha256}=require('../lib/adaptive-capability');

test('passive capability uses only complete matching local media and expiring remote bindings',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sv-adaptive-capability-'));
  try {
    const input=path.join(root,'movie.mp4');fs.writeFileSync(input,'media');
    const bridge=createAdaptiveCapability({cacheDir:path.join(root,'cache'),allowedOrigin:'https://example.test'});
    const stat=fs.statSync(input);
    const localIdentity={input:fs.realpathSync(input),fingerprint:`${stat.size}:${stat.mtimeMs}`};
    const localKey=bridge.cache.keyFor(localIdentity);
    assert.equal(bridge.select({input,remote:false},{duration:60}),null);
    const localDir=path.join(bridge.cache.root,localKey);fs.mkdirSync(localDir);
    fs.writeFileSync(path.join(localDir,'master.m3u8'),'#EXTM3U\n');
    fs.writeFileSync(path.join(localDir,'complete.json'),JSON.stringify({version:'desktop-adaptive-fmp4-v2',key:localKey,
      sourceFingerprint:localIdentity.fingerprint,duration:60,profiles:[{name:'360p'}],files:['master.m3u8'],audioTracks:[]}));
    assert.equal(bridge.select({input,remote:false},{duration:60}).key,localKey);
    assert.equal(bridge.select({input,remote:false},{duration:90}),null);
    fs.appendFileSync(input,'changed');
    assert.equal(bridge.select({input,remote:false},{duration:60}),null);

    const remote='https://example.test/approved-title.mp4';
    const sourceVersion='d'.repeat(64);
    const catalogFingerprint='e'.repeat(20);
    const remoteKey=bridge.cache.keyFor({input:remote,fingerprint:sourceVersion});
    const remoteDir=path.join(bridge.cache.root,remoteKey);fs.mkdirSync(remoteDir);
    fs.writeFileSync(path.join(remoteDir,'master.m3u8'),'#EXTM3U\n');
    fs.writeFileSync(path.join(remoteDir,'complete.json'),JSON.stringify({version:'desktop-adaptive-fmp4-v2',key:remoteKey,
      sourceFingerprint:sourceVersion,duration:60,profiles:[{name:'360p'}],files:['master.m3u8'],audioTracks:[]}));
    const bindingFile=path.join(bridge.cache.root,'bindings.json');
    const remoteSource={input:remote,remote:true,fingerprint:catalogFingerprint};
    assert.equal(bridge.select(remoteSource,{duration:60}),null);
    const binding={catalogFingerprint,sourceVersion,expiresAt:new Date(Date.now()+3600000).toISOString()};
    fs.writeFileSync(bindingFile,JSON.stringify({[sha256(remote)]:binding}));
    assert.equal(bridge.select(remoteSource,{duration:60}).key,remoteKey);
    fs.writeFileSync(bindingFile,JSON.stringify({[sha256(remote)]:{...binding,expiresAt:new Date(Date.now()-1000).toISOString()}}));
    assert.equal(bridge.select(remoteSource,{duration:60}),null);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
