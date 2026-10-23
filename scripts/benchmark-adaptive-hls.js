'use strict';

// Reproducible development-host benchmark; never contacts production.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {performance}=require('node:perf_hooks');
const {spawnSync}=require('node:child_process');
const {AdaptiveHlsCache}=require('../lib/adaptive-hls');

async function main() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sv-adaptive-benchmark-'));
  try {
    const sourceFile=path.join(root,'source.mp4');
    const generated=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=1920x1080:rate=24',
      '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-f','lavfi','-i','sine=frequency=660:sample_rate=48000',
      '-t','12','-map','0:v:0','-map','1:a:0','-map','2:a:0','-c:v','libx264','-preset','ultrafast','-crf','28',
      '-threads','2','-c:a','aac','-b:a','96k',sourceFile],{encoding:'utf8',timeout:90000});
    if(generated.status!==0) throw new Error(`Fixture failed: ${generated.stderr?.slice(-500)}`);
    const stat=fs.statSync(sourceFile);
    const source={input:sourceFile,fingerprint:`${stat.size}:${stat.mtimeMs}`,remote:false};
    const cache=new AdaptiveHlsCache({cacheDir:path.join(root,'cache'),allowedRoots:[root],minFreeBytes:0,maxCacheBytes:2*1024**3});
    let peakCpuPercent=0,peakRssMiB=0;
    const sampler=process.platform==='darwin'?setInterval(()=>{
      const ps=spawnSync('ps',['-A','-o','comm=,%cpu=,rss='],{encoding:'utf8'});
      for(const line of (ps.stdout||'').split('\n')) {
        const match=line.match(/(?:^|\/)ffmpeg\s+([\d.]+)\s+(\d+)$/);
        if(match) {peakCpuPercent=Math.max(peakCpuPercent,Number(match[1]));peakRssMiB=Math.max(peakRssMiB,Number(match[2])/1024);}
      }
    },200):null;
    const coldStart=performance.now();
    let metadata;
    try {metadata=await cache.encode(source);} finally {if(sampler) clearInterval(sampler);}
    const coldSeconds=(performance.now()-coldStart)/1000;
    const warmStart=performance.now();
    await cache.encode(source);
    const warmMs=performance.now()-warmStart;
    const served=cache.completed(metadata.key);
    const asset='360p/video/seg_000000.m4s';
    const server=http.createServer((req,res)=>cache.serve(req,res,metadata.key,asset));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let parallelMs;
    try {
      const start=performance.now();
      const responses=await Promise.all(Array.from({length:10},()=>fetch(`http://127.0.0.1:${server.address().port}/`)));
      const buffers=await Promise.all(responses.map(response=>response.arrayBuffer()));
      if(responses.some(response=>response.status!==200) || buffers.some(buffer=>buffer.byteLength===0)) throw new Error('Concurrent cache fetch failed');
      parallelMs=performance.now()-start;
    } finally {await new Promise(resolve=>server.close(resolve));}
    const diskBytes=fs.statSync(sourceFile).size;
    process.stdout.write(JSON.stringify({coldSeconds,warmMs,peakCpuPercent,peakRssMiB,
      sourceBytes:diskBytes,cacheBytes:directoryBytes(served.dir),profiles:metadata.profiles.map(p=>p.name),
      parallelClients:10,parallelMs,activeReadsAfter:cache.activeReads.size})+'\n');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}
function directoryBytes(root) {
  let sum=0;
  for(const entry of fs.readdirSync(root,{withFileTypes:true})) {
    const file=path.join(root,entry.name);
    sum+=entry.isDirectory()?directoryBytes(file):entry.isFile()?fs.statSync(file).size:0;
  }
  return sum;
}
main().catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1;});
