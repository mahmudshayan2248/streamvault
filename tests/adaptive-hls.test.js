'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {spawnSync}=require('node:child_process');
const {AdaptiveHlsCache,approvedInput,PROFILES,parsePlaylist}=require('../lib/adaptive-hls');

function run(bin,args) {
  const result=spawnSync(bin,args,{encoding:'utf8',timeout:90000});
  if(result.status!==0) throw new Error(`${bin} failed: ${(result.stderr||'').slice(-1000)}`);
  return result.stdout;
}

test('source boundaries reject unapproved local and remote inputs',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sv-adaptive-boundary-'));
  try {
    const input=path.join(root,'video.mp4');fs.writeFileSync(input,'fixture');
    assert.throws(()=>approvedInput({input,fingerprint:'x'},[],[]),/outside approved/);
    assert.equal(approvedInput({input,fingerprint:'x'},[root],[]),fs.realpathSync(input));
    assert.throws(()=>approvedInput({input:'http://127.0.0.1/private',fingerprint:'x',remote:true,authorized:true},[],['example.com']),/not approved/);
    assert.throws(()=>approvedInput({input:'https://user:pass@example.com/file',fingerprint:'x',remote:true,authorized:true},[],['example.com']),/not approved/);
    assert.equal(PROFILES.length,4);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('offline package has four real aligned renditions, alternate audio, cache reuse and byte ranges',{timeout:180000},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sv-adaptive-encode-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const sourceFile=path.join(root,'source.mp4');
  run('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=1920x1080:rate=24',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-f','lavfi','-i','sine=frequency=660:sample_rate=48000',
    '-t','12','-map','0:v:0','-map','1:a:0','-map','2:a:0','-c:v','libx264','-preset','ultrafast',
    '-crf','28','-threads','2','-c:a','aac','-b:a','96k','-metadata:s:a:0','language=eng',
    '-metadata:s:a:1','language=hin',sourceFile]);
  const stat=fs.statSync(sourceFile);
  const source={input:sourceFile,fingerprint:`${stat.size}:${stat.mtimeMs}`,remote:false};
  const cache=new AdaptiveHlsCache({cacheDir:path.join(root,'cache'),allowedRoots:[root],minFreeBytes:0,maxCacheBytes:2*1024**3,maxJobMs:120000});
  const metadata=await cache.encode(source);
  assert.deepEqual(metadata.profiles.map(profile=>profile.name),['360p','480p','720p','1080p']);
  assert.equal(metadata.audioTracks.length,2);
  assert.equal(metadata.audioTracks[0].language,'eng');
  assert.equal(metadata.audioTracks[1].language,'hin');
  const complete=cache.completed(metadata.key);
  assert.ok(complete);
  const master=fs.readFileSync(path.join(complete.dir,'master.m3u8'),'utf8');
  assert.equal((master.match(/#EXT-X-STREAM-INF:/g)||[]).length,4);
  assert.equal((master.match(/TYPE=AUDIO/g)||[]).length,8);
  const dimensions=[];
  const segmentDurations=[];
  for(const profile of metadata.profiles) {
    const playlist=path.join(complete.dir,profile.name,'video','index.m3u8');
    const probe=JSON.parse(run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,codec_name','-of','json',playlist]));
    dimensions.push([probe.streams[0].width,probe.streams[0].height]);
    assert.equal(probe.streams[0].codec_name,'h264');
    const parsed=parsePlaylist(playlist);
    segmentDurations.push(parsed.segments.map(segment=>segment.duration));
    assert.ok(profile.averageBandwidth>0 && profile.peakBandwidth>=profile.averageBandwidth);
    for(const track of [0,1]) assert.ok(parsePlaylist(path.join(complete.dir,profile.name,`audio-${track}`,'index.m3u8')).segments.length>0);
  }
  assert.deepEqual(dimensions,[[640,360],[854,480],[1280,720],[1920,1080]]);
  for(const durations of segmentDurations.slice(1)) assert.deepEqual(durations,segmentDurations[0]);
  assert.ok(new Set(metadata.profiles.map(profile=>profile.averageBandwidth)).size===4,'encoded bitrates differ');
  const second=await cache.encode(source);
  assert.equal(second.createdAt,metadata.createdAt,'completed cache is reused');
  fs.writeFileSync(path.join(cache.root,'.adaptive-encode.lock'),'existing job');
  await assert.rejects(cache.encode({...source,fingerprint:'new-version'}),/already locked/);
  fs.unlinkSync(path.join(cache.root,'.adaptive-encode.lock'));

  const server=http.createServer((req,res)=>cache.serve(req,res,metadata.key,'360p/video/seg_000000.m4s'));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>server.close());
  const response=await fetch(`http://127.0.0.1:${server.address().port}/`,{headers:{Range:'bytes=0-99'}});
  assert.equal(response.status,206);
  assert.match(response.headers.get('content-range'),/^bytes 0-99\/\d+$/);
  assert.equal((await response.arrayBuffer()).byteLength,100);
  const suffix=await fetch(`http://127.0.0.1:${server.address().port}/`,{headers:{Range:'bytes=-32'}});
  assert.equal(suffix.status,206);
  assert.equal((await suffix.arrayBuffer()).byteLength,32);
  const invalid=await fetch(`http://127.0.0.1:${server.address().port}/`,{headers:{Range:'bytes=-0'}});
  assert.equal(invalid.status,416);
  assert.equal((await invalid.text()).length,0);
  const crossOrigin=await fetch(`http://127.0.0.1:${server.address().port}/`,{headers:{Origin:'https://unapproved.example'}});
  assert.equal(crossOrigin.status,403);
  assert.equal(cache.completed('wrong-key'),null);

  const subtitleFile=path.join(root,'caption.srt');
  const remoteFile=path.join(root,'remote-with-subtitle.mp4');
  fs.writeFileSync(subtitleFile,'1\n00:00:00,000 --> 00:00:02,000\nCaption\n');
  run('ffmpeg',['-hide_banner','-loglevel','error','-i',sourceFile,'-f','srt','-i',subtitleFile,
    '-map','0:v:0','-map','1:s:0','-map','0:a:0','-map','0:a:1','-c:v','copy','-c:a','copy','-c:s','mov_text',remoteFile]);
  const remoteStreams=JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=index,codec_type','-of','json',remoteFile])).streams;
  assert.deepEqual(remoteStreams.filter(stream=>stream.codec_type==='audio').map(stream=>stream.index),[2,3]);
  let sourceRequests=0;
  const sourceServer=http.createServer((req,res)=>{
    sourceRequests++;
    const size=fs.statSync(remoteFile).size;
    const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
    const start=match?Number(match[1]):0;
    const end=match&&match[2]?Math.min(Number(match[2]),size-1):size-1;
    res.writeHead(match?206:200,{'Content-Type':'video/mp4','Content-Length':end-start+1,'Accept-Ranges':'bytes',
      ...(match?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
    fs.createReadStream(remoteFile,{start,end}).pipe(res);
  });
  await new Promise(resolve=>sourceServer.listen(0,'127.0.0.1',resolve));
  t.after(()=>sourceServer.close());
  const remoteCache=new AdaptiveHlsCache({cacheDir:path.join(root,'remote-cache'),allowedHosts:['127.0.0.1'],
    minFreeBytes:0,maxCacheBytes:2*1024**3,maxJobMs:120000});
  const remote=await remoteCache.encode({input:`http://127.0.0.1:${sourceServer.address().port}/source.mp4`,
    fingerprint:String(fs.statSync(remoteFile).size),remote:true,authorized:true});
  assert.equal(remote.profiles.length,4);
  assert.equal(remote.audioTracks.length,2);
  assert.deepEqual(remote.audioTracks.map(track=>track.streamIndex),[2,3]);
  assert.ok(sourceRequests<=6,`remote source was fetched ${sourceRequests} times`);
  assert.equal(fs.existsSync(path.join(remoteCache.completed(remote.key).dir,'source.mkv')),false);
});
