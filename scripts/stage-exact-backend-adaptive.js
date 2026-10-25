'use strict';

// Loopback-only integration check for a guarded candidate built from exact
// deployed playback-capability.js bytes. Never points at production media or
// caches: the caller supplies an isolated local copy and completed package.
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const express=require('express');

function requiredPath(name) {
  const value=process.env[name];
  if(!value) throw new Error(`${name} is required`);
  return fs.realpathSync(value);
}

function mediaInfo(file) {
  const result=spawnSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],
    {encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
  if(result.status!==0) throw new Error(`ffprobe failed: ${String(result.stderr).slice(-300)}`);
  const probe=JSON.parse(result.stdout);
  const video=probe.streams.find(stream=>stream.codec_type==='video');
  if(!video) throw new Error('Staged source has no video');
  const tracks=type=>probe.streams.filter(stream=>stream.codec_type===type).map((stream,index)=>({
    index,streamIndex:stream.index,relativeIndex:index,codec:stream.codec_name,
    profile:stream.profile||'',channels:stream.channels||0,channelLayout:stream.channel_layout||'',
    language:stream.tags?.language||'und',title:stream.tags?.title||'',
    default:stream.disposition?.default===1,forced:stream.disposition?.forced===1,
    bitrate:Number(stream.bit_rate)||0,
  }));
  return {duration:Number(probe.format.duration),container:probe.format.format_name,
    videoCodec:video.codec_name,width:video.width,height:video.height,
    frameRate:video.avg_frame_rate,hasBFrames:video.has_b_frames,
    audioTracks:tracks('audio'),subtitleTracks:tracks('subtitle')};
}

function main() {
  const candidate=requiredPath('SV_STAGE_CANDIDATE');
  const source=requiredPath('SV_STAGE_SOURCE');
  const adaptiveCache=requiredPath('SV_STAGE_ADAPTIVE_CACHE');
  const stageRoot=requiredPath('SV_STAGE_ROOT');
  if(!fs.statSync(source).isFile() || !fs.statSync(candidate).isFile()) throw new Error('Stage inputs must be files');
  if(!source.startsWith(`${stageRoot}${path.sep}`))
    throw new Error('Staged media must be an isolated copy inside the stage root');
  if(adaptiveCache===stageRoot || !adaptiveCache.startsWith(`${stageRoot}${path.sep}`))
    throw new Error('Adaptive cache must be inside the isolated stage root');
  const info=mediaInfo(source);
  const port=Number(process.env.SV_STAGE_PORT||8766);
  if(!Number.isInteger(port)||port<1024||port>65535) throw new Error('Invalid stage port');
  const origin='http://127.0.0.1:8765';
  process.env.SV_ADAPTIVE_HLS_ENABLED='1';
  process.env.SV_ADAPTIVE_HLS_CACHE_DIR=adaptiveCache;
  process.env.SV_ADAPTIVE_HLS_ORIGIN=origin;
  const app=express();
  app.use((req,res,next)=>{
    if(req.headers.origin && req.headers.origin!==origin) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Access-Control-Allow-Methods','GET, HEAD, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Range, Content-Type');
    if(req.method==='OPTIONS') return res.status(204).end();
    next();
  });
  const fingerprint=crypto.createHash('sha1').update(source).digest('hex').slice(0,20);
  const local={id:'preview',canonicalId:'stage-real-catalog-copy',input:source,remote:false,
    filename:path.basename(source),label:'Isolated real catalog excerpt',fingerprint,
    directUrl:`http://127.0.0.1:${port}/stage/source`};
  require(candidate).installPlaybackCapability({app,cacheDir:path.join(stageRoot,'legacy-cache'),
    ffmpegBin:'ffmpeg',ffprobeBin:'ffprobe',getMediaInfo:async()=>info,
    resolveLocal:id=>id==='preview'?local:null,resolveRemote:()=>null,
    getLocalSidecars:()=>[],getRemoteSidecars:async()=>[],isRemoteSidecarAllowed:()=>false});
  app.get('/stage/source',(req,res)=>res.sendFile(source));
  app.listen(port,'127.0.0.1',()=>process.stdout.write(JSON.stringify({port,candidate,source,
    candidateSha256:crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex'),
    duration:info.duration,audioTracks:info.audioTracks.length,subtitleTracks:info.subtitleTracks.length})+'\n'));
}

try {main();} catch(error) {process.stderr.write(`${error.stack}\n`);process.exitCode=1;}
