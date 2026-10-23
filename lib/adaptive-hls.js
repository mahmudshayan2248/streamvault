'use strict';

// Offline, single-host HLS packaging for sources already approved by a caller.
// Playback requests only read completed caches; they never start FFmpeg.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');

const FORMAT_VERSION = 'desktop-adaptive-fmp4-v2';
const SEGMENT_SECONDS = 4;
const PROFILES = Object.freeze([
  Object.freeze({name:'360p',height:360,videoKbps:280,audioKbps:48}),
  Object.freeze({name:'480p',height:480,videoKbps:650,audioKbps:64}),
  Object.freeze({name:'720p',height:720,videoKbps:1700,audioKbps:96}),
  Object.freeze({name:'1080p',height:1080,videoKbps:3500,audioKbps:128}),
]);

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function inside(parent, child) {
  const relative=path.relative(parent,child);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}
function directoryBytes(root) {
  let bytes=0;
  const stack=[root];
  while(stack.length) {
    const current=stack.pop();
    for(const entry of fs.readdirSync(current,{withFileTypes:true})) {
      const file=path.join(current,entry.name);
      if(entry.isDirectory()) stack.push(file);
      else if(entry.isFile()) bytes+=fs.statSync(file).size;
    }
  }
  return bytes;
}
function freeBytes(root) {
  if(typeof fs.statfsSync !== 'function') return Infinity;
  const stat=fs.statfsSync(root);
  return stat.bavail*stat.bsize;
}
function approvedInput(source, allowedRoots=[], allowedHosts=[]) {
  if(!source || !source.input || !source.fingerprint) throw new Error('Approved source and fingerprint required');
  if(source.remote) {
    if(source.authorized !== true) throw new Error('Remote source was not authorized');
    const url=new URL(source.input);
    if(!['https:','http:','ftp:'].includes(url.protocol) || url.username || url.password ||
       !allowedHosts.includes(url.hostname.toLowerCase())) throw new Error('Remote source host is not approved');
    return url.toString();
  }
  const real=fs.realpathSync(source.input);
  if(!fs.statSync(real).isFile() || !allowedRoots.some(root=>inside(fs.realpathSync(root),real))) {
    throw new Error('Local source is outside approved media roots');
  }
  return real;
}
function processOutput(bin,args,{timeoutMs=600000,watch}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(bin,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});
    let stdout='',stderr='',done=false,fatalError=null;
    const finish=(error)=>{
      if(done) return;
      done=true;
      clearTimeout(timer);
      clearInterval(watcher);
      error ? reject(error) : resolve({stdout,stderr});
    };
    const timer=setTimeout(()=>{fatalError=new Error(`${bin} timed out`);child.kill('SIGKILL');},timeoutMs);
    const watcher=watch ? setInterval(()=>{
      try { watch(); } catch(error) { fatalError=error; child.kill('SIGKILL'); }
    },5000) : null;
    child.stdout.on('data',part=>{stdout+=part; if(stdout.length>2_000_000){fatalError=new Error(`${bin} output limit exceeded`);child.kill('SIGKILL');}});
    child.stderr.on('data',part=>{stderr=(stderr+part).slice(-6000);});
    child.on('error',finish);
    child.on('close',code=>finish(fatalError||(code===0?null:new Error(`${bin} exited ${code}: ${stderr.slice(-1000)}`))));
  });
}
function parsePlaylist(file) {
  const text=fs.readFileSync(file,'utf8');
  if(!text.startsWith('#EXTM3U') || !text.includes('#EXT-X-ENDLIST') || !text.includes('#EXT-X-MAP')) {
    throw new Error(`Incomplete HLS playlist: ${path.basename(path.dirname(file))}`);
  }
  const lines=text.split(/\r?\n/);
  const segments=[];
  let duration=0;
  for(const line of lines) {
    if(line.startsWith('#EXTINF:')) duration=Number(line.slice(8).split(',')[0]);
    else if(line && !line.startsWith('#')) {
      if(!/^seg_\d{6}\.m4s$/.test(line) || !Number.isFinite(duration) || duration<=0) throw new Error('Invalid HLS segment entry');
      const filePath=path.join(path.dirname(file),line);
      const size=fs.statSync(filePath).size;
      if(size<=0) throw new Error('Empty HLS segment');
      segments.push({name:line,duration,size});
      duration=0;
    }
  }
  if(!segments.length || fs.statSync(path.join(path.dirname(file),'init.mp4')).size<=0) throw new Error('Missing HLS media');
  const totalDuration=segments.reduce((sum,item)=>sum+item.duration,0);
  const totalBytes=segments.reduce((sum,item)=>sum+item.size,0);
  return {
    segments,
    duration:totalDuration,
    averageBps:Math.ceil(totalBytes*8/totalDuration),
    peakBps:Math.ceil(Math.max(...segments.map(item=>item.size*8/item.duration))),
  };
}
function safeLabel(value,fallback) {return String(value||fallback).replace(/["\r\n]/g,"'").slice(0,80);}

class AdaptiveHlsCache {
  constructor(options={}) {
    if(!options.cacheDir) throw new Error('cacheDir is required');
    this.root=path.resolve(options.cacheDir);
    this.ffmpeg=options.ffmpegBin||'ffmpeg';
    this.ffprobe=options.ffprobeBin||'ffprobe';
    this.allowedRoots=options.allowedRoots||[];
    this.allowedHosts=(options.allowedHosts||[]).map(host=>host.toLowerCase());
    this.allowedOrigin=options.allowedOrigin||null;
    this.maxCacheBytes=options.maxCacheBytes===undefined?12*1024**3:options.maxCacheBytes;
    this.minFreeBytes=options.minFreeBytes===undefined?2*1024**3:options.minFreeBytes;
    this.maxJobMs=options.maxJobMs===undefined?12*60*60*1000:options.maxJobMs;
    if(!Number.isFinite(this.maxCacheBytes)||this.maxCacheBytes<=0||
       !Number.isFinite(this.minFreeBytes)||this.minFreeBytes<0||
       !Number.isFinite(this.maxJobMs)||this.maxJobMs<=0) throw new Error('Invalid adaptive cache limits');
    this.known=new Map();
    fs.mkdirSync(this.root,{recursive:true,mode:0o700});
    if(process.platform!=='win32' && (fs.statSync(this.root).mode&0o077)!==0) throw new Error('Adaptive cache directory must be owner-only');
  }
  keyFor(source) {return sha256(`${FORMAT_VERSION}|${source.input}|${source.fingerprint}|${SEGMENT_SECONDS}|${PROFILES.map(p=>`${p.name}:${p.videoKbps}:${p.audioKbps}`).join(',')}`).slice(0,32);}
  completed(key) {
    if(!/^[a-f0-9]{32}$/.test(key)) return null;
    if(this.known.has(key)) {
      const cached=this.known.get(key);
      if(fs.existsSync(path.join(cached.dir,'complete.json'))) return cached;
      this.known.delete(key);
    }
    const dir=path.join(this.root,key);
    try {
      const metadata=JSON.parse(fs.readFileSync(path.join(dir,'complete.json'),'utf8'));
      if(metadata.version!==FORMAT_VERSION || metadata.key!==key || !Array.isArray(metadata.files)) return null;
      if(!metadata.files.every(name=>/^([a-z0-9-]+\/){0,2}(?:index\.m3u8|init\.mp4|seg_\d{6}\.m4s|master\.m3u8)$/.test(name)
        && fs.statSync(path.join(dir,name)).size>0)) return null;
      const complete={dir,metadata,files:new Set(metadata.files)};
      this.known.set(key,complete);
      return complete;
    } catch {return null;}
  }
  async probe(input,remote) {
    const args=['-v','error'];
    if(remote) args.push('-rw_timeout','15000000',...(/^https?:/i.test(input)?['-max_redirects','0']:[]));
    args.push('-show_entries','format=duration:stream=index,codec_type,codec_name,width,height,channels:stream_tags=language,title','-of','json',input);
    const {stdout}=await processOutput(this.ffprobe,args,{timeoutMs:30000});
    const data=JSON.parse(stdout);
    const video=data.streams?.find(stream=>stream.codec_type==='video');
    const audio=data.streams?.filter(stream=>stream.codec_type==='audio')||[];
    const duration=Number(data.format?.duration);
    if(!video || !Number.isFinite(duration) || duration<=0 || duration>4*3600) throw new Error('Media must contain video with bounded duration');
    if(audio.length>8) throw new Error('More than eight audio tracks requires an explicit plan');
    return {video,audio,duration};
  }
  async encode(source) {
    const input=approvedInput(source,this.allowedRoots,this.allowedHosts);
    const key=this.keyFor({...source,input});
    const cached=this.completed(key);
    if(cached) return cached.metadata;
    const lock=path.join(this.root,'.adaptive-encode.lock');
    let fd;
    try {fd=fs.openSync(lock,'wx');} catch(error) {
      if(error.code==='EEXIST') throw new Error('Adaptive encoding is already locked; inspect the owner before clearing it');
      throw error;
    }
    fs.writeSync(fd,JSON.stringify({pid:process.pid,key,createdAt:new Date().toISOString()}));
    const stage=path.join(this.root,`.partial-${key}-${process.pid}`);
    try {
      const again=this.completed(key);
      if(again) return again.metadata;
      const usedAtStart=directoryBytes(this.root);
      if(usedAtStart>=this.maxCacheBytes || freeBytes(this.root)<this.minFreeBytes) throw new Error('Adaptive cache capacity unavailable');
      const probe=await this.probe(input,source.remote);
      const profiles=PROFILES.filter(profile=>profile.height<=Number(probe.video.height));
      if(!profiles.length) throw new Error('Source is below the minimum rendition resolution');
      fs.mkdirSync(stage,{recursive:true});
      const deadline=Date.now()+this.maxJobMs;
      const watch=()=>{
        if(Date.now()>deadline) throw new Error('Adaptive encoding time limit exceeded');
        if(usedAtStart+directoryBytes(stage)>this.maxCacheBytes || freeBytes(this.root)<this.minFreeBytes) throw new Error('Adaptive cache disk limit reached');
      };
      const staged=source.remote ? await this.stageRemote(input,probe,stage,watch) : {input,probe};
      const encodeInput=staged.input;
      const profileResults=[];
      for(const profile of profiles) {
        const videoDir=path.join(stage,profile.name,'video');
        fs.mkdirSync(videoDir,{recursive:true});
        await this.encodeVideo(encodeInput,false,profile,videoDir,watch);
        const videoPlaylist=parsePlaylist(path.join(videoDir,'index.m3u8'));
        const videoInfo=await this.probeEncoded(path.join(videoDir,'index.m3u8'));
        if(videoInfo.codec_name!=='h264' || videoInfo.height!==profile.height) throw new Error(`Invalid ${profile.name} video encode`);
        const audio=[];
        for(let index=0;index<probe.audio.length;index++) {
          const track=probe.audio[index];
          const audioDir=path.join(stage,profile.name,`audio-${index}`);
          fs.mkdirSync(audioDir,{recursive:true});
          await this.encodeAudio(encodeInput,false,staged.probe.audio[index].index,profile,audioDir,watch);
          const playlist=parsePlaylist(path.join(audioDir,'index.m3u8'));
          if(Math.abs(playlist.duration-videoPlaylist.duration)>SEGMENT_SECONDS) throw new Error('Audio/video HLS durations diverged');
          audio.push({index,streamIndex:track.index,language:safeLabel(track.tags?.language,'und'),title:safeLabel(track.tags?.title,`Audio ${index+1}`),default:index===0,playlist});
        }
        profileResults.push({...profile,width:videoInfo.width,video:videoPlaylist,audio});
      }
      const first=profileResults[0].video;
      for(const result of profileResults.slice(1)) {
        if(result.video.segments.length!==first.segments.length ||
          result.video.segments.some((segment,index)=>Math.abs(segment.duration-first.segments[index].duration)>.25)) {
          throw new Error('Video rendition boundaries are not aligned');
        }
      }
      const master=this.masterPlaylist(profileResults);
      fs.writeFileSync(path.join(stage,'master.m3u8'),master);
      if(source.remote) fs.unlinkSync(encodeInput);
      const files=[];
      const stack=[stage];
      while(stack.length) for(const entry of fs.readdirSync(stack.pop(),{withFileTypes:true})) {
        const file=path.join(entry.parentPath||entry.path,entry.name);
        if(entry.isDirectory()) stack.push(file);
        else if(entry.isFile()) files.push(path.relative(stage,file).replaceAll(path.sep,'/'));
      }
      const metadata={version:FORMAT_VERSION,key,sourceFingerprint:source.fingerprint,duration:probe.duration,
        createdAt:new Date().toISOString(),profiles:profileResults.map(result=>({name:result.name,width:result.width,height:result.height,
          nominalVideoKbps:result.videoKbps,nominalAudioKbps:result.audioKbps,
          averageBandwidth:result.video.averageBps+Math.max(0,...result.audio.map(track=>track.playlist.averageBps)),
          peakBandwidth:result.video.peakBps+Math.max(0,...result.audio.map(track=>track.playlist.peakBps)),segments:result.video.segments.length})),
        audioTracks:profileResults[0].audio.map(({index,streamIndex,language,title,default:isDefault})=>({index,streamIndex,language,title,default:isDefault})),
        files};
      fs.writeFileSync(path.join(stage,'complete.json'),JSON.stringify(metadata,null,2));
      fs.renameSync(stage,path.join(this.root,key));
      this.known.set(key,{dir:path.join(this.root,key),metadata,files:new Set(files)});
      return metadata;
    } finally {
      if(fs.existsSync(stage)) fs.rmSync(stage,{recursive:true,force:true});
      fs.closeSync(fd);
      fs.unlinkSync(lock);
    }
  }
  async probeEncoded(file) {
    const {stdout}=await processOutput(this.ffprobe,['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height','-of','json',file],{timeoutMs:30000});
    const stream=JSON.parse(stdout).streams?.[0];
    if(!stream) throw new Error('Encoded video cannot be probed');
    return stream;
  }
  inputArgs(input,remote) {return ['-hide_banner','-loglevel','error','-nostdin','-threads','1','-filter_threads','1','-filter_complex_threads','1',...(remote?['-rw_timeout','15000000',...(/^https?:/i.test(input)?['-max_redirects','0']:[])]:[]),'-i',input,'-copyts','-start_at_zero'];}
  async stageRemote(input,probe,stage,watch) {
    const local=path.join(stage,'source.mkv');
    const args=[...this.inputArgs(input,true),'-map','0:v:0','-map','0:a?','-sn','-dn','-c','copy',
      '-map_metadata','-1','-map_chapters','-1','-t',String(Math.ceil(probe.duration)+1),'-f','matroska',local];
    await processOutput(this.ffmpeg,args,{timeoutMs:this.maxJobMs,watch});
    watch();
    if(fs.statSync(local).size<=0) throw new Error('Remote staging produced no media');
    const staged=await this.probe(local,false);
    if(staged.audio.length!==probe.audio.length || staged.video.height<=0) throw new Error('Remote staging changed track layout');
    return {input:local,probe:staged};
  }
  outputArgs(dir) {return ['-f','hls','-hls_segment_type','fmp4','-hls_time',String(SEGMENT_SECONDS),'-hls_list_size','0','-hls_playlist_type','vod','-hls_flags','independent_segments+temp_file','-hls_fmp4_init_filename',process.platform==='win32'?path.join(dir,'init.mp4'):'init.mp4','-hls_segment_filename',path.join(dir,'seg_%06d.m4s'),path.join(dir,'index.m3u8')];}
  async encodeVideo(input,remote,profile,dir,watch) {
    const args=[...this.inputArgs(input,remote),'-map','0:v:0','-an','-sn','-dn',
      '-vf',`fps=24,scale=-2:${profile.height}:flags=lanczos`,'-c:v','libx264','-preset','veryfast','-threads','1',
      '-x264-params','threads=1:lookahead_threads=1',
      '-pix_fmt','yuv420p','-profile:v','high','-level:v','4.1','-b:v',`${profile.videoKbps}k`,
      '-maxrate',`${profile.videoKbps}k`,'-bufsize',`${profile.videoKbps*2}k`,
      '-g','96','-keyint_min','96','-sc_threshold','0','-force_key_frames','expr:gte(t,n_forced*4)',
      ...this.outputArgs(dir)];
    await processOutput(this.ffmpeg,args,{timeoutMs:this.maxJobMs,watch});
  }
  async encodeAudio(input,remote,streamIndex,profile,dir,watch) {
    const args=[...this.inputArgs(input,remote),'-map',`0:${streamIndex}`,'-vn','-sn','-dn',
      '-c:a','aac','-threads','1','-b:a',`${profile.audioKbps}k`,'-ar','48000','-ac','2',
      '-af','aresample=async=1:first_pts=0',...this.outputArgs(dir)];
    await processOutput(this.ffmpeg,args,{timeoutMs:this.maxJobMs,watch});
  }
  masterPlaylist(results) {
    const lines=['#EXTM3U','#EXT-X-VERSION:7','#EXT-X-INDEPENDENT-SEGMENTS'];
    for(const profile of results) {
      const group=`audio-${profile.name}`;
      for(const track of profile.audio) lines.push(`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="${group}",NAME="${track.index+1}: ${track.title}",LANGUAGE="${track.language}",AUTOSELECT=YES,DEFAULT=${track.default?'YES':'NO'},URI="${profile.name}/audio-${track.index}/index.m3u8"`);
      const peak=profile.video.peakBps+Math.max(0,...profile.audio.map(track=>track.playlist.peakBps));
      const average=profile.video.averageBps+Math.max(0,...profile.audio.map(track=>track.playlist.averageBps));
      lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${Math.ceil(peak)},AVERAGE-BANDWIDTH=${Math.ceil(average)},RESOLUTION=${profile.width}x${profile.height},CODECS="avc1.640029${profile.audio.length?',mp4a.40.2':''}"${profile.audio.length?`,AUDIO="${group}"`:''}`);
      lines.push(`${profile.name}/video/index.m3u8`);
    }
    return lines.join('\n')+'\n';
  }
  serve(req,res,key,relative) {
    if(req.headers.origin && req.headers.origin!==this.allowedOrigin) {res.writeHead(403);res.end();return;}
    const complete=this.completed(key);
    if(!complete) {res.writeHead(404);res.end();return;}
    const normalized=relative.replace(/^\//,'');
    if(!complete.files.has(normalized)) {res.writeHead(404);res.end();return;}
    const file=path.join(complete.dir,normalized);
    let stat;
    try { stat=fs.statSync(file); } catch {this.known.delete(key);res.writeHead(404);res.end();return;}
    const playlist=normalized.endsWith('.m3u8');
    const type=playlist?'application/vnd.apple.mpegurl':normalized.endsWith('.mp4')?'video/mp4':'video/iso.segment';
    const headers={'Content-Type':type,
      ...(this.allowedOrigin?{'Access-Control-Allow-Origin':this.allowedOrigin,'Access-Control-Expose-Headers':'Content-Length,Content-Range,Accept-Ranges','Vary':'Origin'}:{}),
      'Cache-Control':playlist?'private, max-age=3600':'private, max-age=31536000, immutable','Accept-Ranges':'bytes'};
    const range=String(req.headers.range||'');
    let start=0,end=stat.size-1,status=200;
    if(range) {
      const match=/^bytes=(\d*)-(\d*)$/.exec(range);
      if(!match || (!match[1]&&!match[2])) {res.writeHead(416,{...headers,'Content-Range':`bytes */${stat.size}`});res.end();return;}
      if(match[1]) {start=Number(match[1]);end=match[2]?Number(match[2]):end;}
      else {const suffix=Number(match[2]);start=Math.max(0,stat.size-suffix);if(!suffix) start=stat.size;}
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size) {res.writeHead(416,{...headers,'Content-Range':`bytes */${stat.size}`});res.end();return;}
      end=Math.min(end,stat.size-1);status=206;
      headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length']=String(end-start+1);
    res.writeHead(status,headers);
    if(req.method==='HEAD') {res.end();return;}
    fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
  }
}

module.exports={AdaptiveHlsCache,PROFILES,parsePlaylist,approvedInput};
