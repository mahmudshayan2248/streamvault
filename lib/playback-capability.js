'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TEXT_SUBTITLE_CODECS = new Set([
  'ass', 'ssa', 'subrip', 'srt', 'text', 'mov_text', 'webvtt', 'ttml', 'stpp'
]);
const IMAGE_SUBTITLE_CODECS = new Set([
  'dvd_subtitle', 'dvb_subtitle', 'hdmv_pgs_subtitle', 'pgs', 'xsub'
]);
const RENDERABLE_BITMAP_SUBTITLE_CODECS = new Set([
  'dvd_subtitle', 'hdmv_pgs_subtitle', 'pgs'
]);
const BITMAP_SUBTITLE_CACHE_VERSION = 'bitmap-subtitles-v4-windowed';
const BITMAP_SUBTITLE_WINDOW_SECONDS = Math.max(60, finite(process.env.PLAYBACK_BITMAP_SUBTITLE_WINDOW_SECONDS, 90));
const AAC_CODECS = new Set(['aac', 'mp4a']);
const MP3_CODECS = new Set(['mp3']);
const OPUS_CODECS = new Set(['opus']);
const VORBIS_CODECS = new Set(['vorbis']);
const H264_CODECS = new Set(['h264', 'avc', 'avc1']);
const HEVC_CODECS = new Set(['hevc', 'h265', 'hev1', 'hvc1']);
const VP8_CODECS = new Set(['vp8']);
const VP9_CODECS = new Set(['vp9']);
const AV1_CODECS = new Set(['av1', 'av01']);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boolQuery(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === '1' || value === 'true' || value === 'yes';
}

function cleanCodec(value) {
  return String(value || '').trim().toLowerCase();
}

function sourceExtension(source, filename = '') {
  const candidate = String(filename || source || '').split(/[?#]/)[0];
  return path.extname(candidate).toLowerCase();
}

function containerFamily(info, source, filename) {
  const container = String(info?.container || '').toLowerCase();
  const extension = sourceExtension(source, filename);
  if (extension === '.mkv') return 'mkv';
  if (['.mp4', '.m4v', '.mov'].includes(extension) || /(?:^|,)(?:mov|mp4|m4a|3gp|3g2|mj2)(?:,|$)/.test(container)) return 'mp4';
  if (extension === '.webm' || /(?:^|,)webm(?:,|$)/.test(container)) return 'webm';
  if (extension === '.ogg' || extension === '.ogv' || /(?:^|,)ogg(?:,|$)/.test(container)) return 'ogg';
  if (container.includes('matroska')) return 'mkv';
  return extension.replace(/^\./, '') || container.split(',')[0] || 'unknown';
}

function normalizedAudioTrack(track, index) {
  const channels = Math.max(0, Math.round(finite(track?.channels)));
  const language = String(track?.language || 'und').trim() || 'und';
  const rawTitle = String(track?.title || '').trim();
  return {
    index,
    streamIndex: Number.isFinite(Number(track?.streamIndex ?? track?.index))
      ? Number(track.streamIndex ?? track.index)
      : index,
    relativeIndex: Number.isFinite(Number(track?.relativeIndex)) ? Number(track.relativeIndex) : index,
    language,
    title: rawTitle || `Audio Track ${index + 1}`,
    codec: cleanCodec(track?.codec) || 'unknown',
    profile: String(track?.profile || '').trim(),
    channels,
    channelLayout: String(track?.channelLayout || '').trim(),
    default: track?.default === true,
    forced: track?.forced === true,
    bitrate: Math.max(0, finite(track?.bitrate)),
  };
}

function hlsAudioOutput(track, caps) {
  const channels = Math.max(0, Math.round(finite(track?.channels)));
  const profile = String(track?.profile || '').toLowerCase();
  const isHeAac = /\bhe\s*-?\s*aac\b|aac\s*he/i.test(profile);
  const safeAacCopy = AAC_CODECS.has(track.codec)
    && browserCanDecodeAudio(track.codec, caps)
    && !isHeAac
    && (channels === 0 || channels <= 2);
  if (safeAacCopy) {
    return {
      outputAction: 'copy',
      outputCodec: 'aac',
      outputChannels: channels,
      outputChannelLayout: track.channelLayout || '',
    };
  }
  return {
    outputAction: 'transcode-aac',
    outputCodec: 'aac',
    // Chrome MSE rejected the real 7.1 AAC initialization segment. Stereo AAC-LC
    // is the cross-browser compatibility rendition; source metadata remains visible.
    outputChannels: channels > 2 ? 2 : (channels || 2),
    outputChannelLayout: channels === 1 ? 'mono' : 'stereo',
  };
}

function normalizedSubtitleTrack(track, index, urlFactory, bitmapUrlFactory = null) {
  const codec = cleanCodec(track?.codec) || 'unknown';
  const text = TEXT_SUBTITLE_CODECS.has(codec);
  const image = IMAGE_SUBTITLE_CODECS.has(codec);
  const language = String(track?.language || track?.lang || 'und').trim() || 'und';
  const title = String(track?.title || track?.label || '').trim() || `Subtitle Track ${index + 1}`;
  const streamIndex = Number.isFinite(Number(track?.streamIndex ?? track?.index))
    ? Number(track.streamIndex ?? track.index)
    : index;
  const relativeIndex = Number.isFinite(Number(track?.relativeIndex)) ? Number(track.relativeIndex) : index;
  const sidecarText = !!track?.sidecar && !image;
  const bitmap = image
    && !track?.sidecar
    && RENDERABLE_BITMAP_SUBTITLE_CODECS.has(codec)
    && typeof bitmapUrlFactory === 'function';
  const supported = text || sidecarText || bitmap;
  const url = text || sidecarText
    ? urlFactory(streamIndex, track)
    : (bitmap ? bitmapUrlFactory(streamIndex, track) : null);
  const unsupportedReason = supported
    ? ''
    : (image
      ? 'Image subtitle codec is not supported by the bitmap overlay renderer'
      : (!text && !track?.sidecar ? 'Subtitle codec cannot be converted to WebVTT' : ''));
  return {
    index,
    streamIndex,
    relativeIndex,
    language,
    title,
    codec,
    sourceType: track?.sidecar ? 'external' : 'embedded',
    default: track?.default === true,
    forced: track?.forced === true,
    supported,
    format: bitmap ? 'bitmap' : 'text',
    renderer: bitmap ? 'bitmap-overlay' : 'text-track',
    timeline: bitmap ? 'global' : (track?.timeline === 'local' ? 'local' : 'global'),
    unsupportedReason,
    url,
    width: Math.max(0, finite(track?.width)),
    height: Math.max(0, finite(track?.height)),
  };
}

function browserCapabilities(req) {
  return {
    h264: boolQuery(req.query.h264, true),
    hevc: boolQuery(req.query.hevc, false),
    vp8: boolQuery(req.query.vp8, true),
    vp9: boolQuery(req.query.vp9, true),
    av1: boolQuery(req.query.av1, false),
    aac: boolQuery(req.query.aac, true),
    mp3: boolQuery(req.query.mp3, true),
    opus: boolQuery(req.query.opus, true),
    vorbis: boolQuery(req.query.vorbis, true),
  };
}

function browserCanDecodeVideo(codec, caps) {
  if (H264_CODECS.has(codec)) return caps.h264;
  if (HEVC_CODECS.has(codec)) return caps.hevc;
  if (VP8_CODECS.has(codec)) return caps.vp8;
  if (VP9_CODECS.has(codec)) return caps.vp9;
  if (AV1_CODECS.has(codec)) return caps.av1;
  return false;
}

function browserCanDecodeAudio(codec, caps) {
  if (!codec || codec === 'unknown') return true;
  if (AAC_CODECS.has(codec)) return caps.aac;
  if (MP3_CODECS.has(codec)) return caps.mp3;
  if (OPUS_CODECS.has(codec)) return caps.opus;
  if (VORBIS_CODECS.has(codec)) return caps.vorbis;
  return false;
}

function directContainerSupports(container, videoCodec, audioCodec) {
  if (container === 'mp4') {
    return (H264_CODECS.has(videoCodec) || HEVC_CODECS.has(videoCodec) || AV1_CODECS.has(videoCodec))
      && (!audioCodec || AAC_CODECS.has(audioCodec) || MP3_CODECS.has(audioCodec));
  }
  if (container === 'webm') {
    return (VP8_CODECS.has(videoCodec) || VP9_CODECS.has(videoCodec) || AV1_CODECS.has(videoCodec))
      && (!audioCodec || OPUS_CODECS.has(audioCodec) || VORBIS_CODECS.has(audioCodec));
  }
  if (container === 'ogg') return VP8_CODECS.has(videoCodec) && (!audioCodec || VORBIS_CODECS.has(audioCodec));
  return false;
}

function playbackDecision(info, source, filename, caps) {
  const container = containerFamily(info, source, filename);
  const videoCodec = cleanCodec(info?.videoCodec);
  const audioTracks = (Array.isArray(info?.audioTracks) ? info.audioTracks : [])
    .map(normalizedAudioTrack)
    .map(track => ({ ...track, ...hlsAudioOutput(track, caps) }));
  const firstAudioCodec = audioTracks[0]?.codec || '';
  const videoDecodable = browserCanDecodeVideo(videoCodec, caps);
  const audioDecodable = browserCanDecodeAudio(firstAudioCodec, caps);
  const directContainer = directContainerSupports(container, videoCodec, firstAudioCodec);
  const reliableDirectTrackModel = audioTracks.length <= 1;
  const direct = directContainer && videoDecodable && audioDecodable && reliableDirectTrackModel;

  if (direct) {
    return {
      mode: 'direct',
      strategy: 'direct',
      reason: 'Browser-compatible container and codecs',
      container,
      videoCodec,
      videoAction: 'copy',
      audioAction: 'copy',
      audioTracks,
    };
  }

  const videoAction = videoDecodable && H264_CODECS.has(videoCodec)
    ? 'copy'
    : (videoDecodable && caps.hevc && HEVC_CODECS.has(videoCodec) ? 'copy' : 'transcode-h264');
  const copiedAudio = audioTracks.filter(track => track.outputAction === 'copy').length;
  const audioAction = copiedAudio === audioTracks.length
    ? 'copy'
    : (copiedAudio === 0 ? 'transcode-aac' : 'mixed');
  let strategy = 'remux';
  if (videoAction !== 'copy') strategy = 'video-transcode';
  else if (audioAction !== 'copy') strategy = audioTracks.length > 1 ? 'alternate-audio-transcode' : 'audio-transcode';
  else if (audioTracks.length > 1) strategy = 'alternate-audio-remux';
  return {
    mode: 'hls',
    strategy,
    reason: audioTracks.length > 1
      ? 'Compatibility HLS provides switchable browser-compatible audio renditions'
      : (videoAction === 'copy' ? 'Container remux is required' : 'Video codec is not supported by this browser'),
    container,
    videoCodec,
    videoAction,
    audioAction,
    audioTracks,
  };
}

function sha1(value, length = 40) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, length);
}

function frameRateSeconds(value) {
  const match = String(value || '').match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (!match || finite(match[1]) <= 0) return 0;
  return finite(match[2]) / finite(match[1]);
}

function normalizedSeekOrigin(packetOrPackets, info, requestedStart) {
  const packets = Array.isArray(packetOrPackets) ? packetOrPackets : [packetOrPackets];
  const packet = packets[0];
  const pts = finite(packet?.pts_time, NaN);
  if (!Number.isFinite(pts)) return Math.max(0, finite(requestedStart));
  // Matroska often omits DTS on the first packet returned by an indexed seek.
  // FFmpeg reconstructs it from the codec reorder depth. That decode timestamp
  // is the origin HLS.js uses when it rebases the fMP4 window to local zero.
  let dts = finite(packet?.dts_time, NaN);
  if (!Number.isFinite(dts)) {
    const knownIndex=packets.findIndex(item=>Number.isFinite(finite(item?.dts_time,NaN)));
    if(knownIndex > 0) {
      const knownDts=finite(packets[knownIndex].dts_time);
      const fallbackDuration=frameRateSeconds(info?.frameRate);
      const elapsed=packets.slice(0,knownIndex).reduce((total,item)=>total+Math.max(0,finite(item?.duration_time,fallbackDuration)),0);
      // Open GOP leading pictures can have timestamps before the returned
      // keyframe. The muxer's initial decode origin is bounded by the first
      // keyframe PTS minus its missing decode slots, not those leading PTS.
      if(elapsed > 0) dts=Math.max(knownDts,pts)-elapsed;
    }
  }
  const reorder = Math.max(0, finite(info?.hasBFrames)) * frameRateSeconds(info?.frameRate);
  return Math.min(Math.max(0, finite(requestedStart)), Math.max(0, Number((Number.isFinite(dts) ? dts : pts - reorder).toFixed(3))));
}

function ensureInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function safeSendFile(res, filePath, contentType, cacheControl) {
  let stat;
  try {
    stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) return false;
  } catch {
    return false;
  }
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Access-Control-Allow-Origin', '*');
  const stream = fs.createReadStream(filePath);
  res.on('close', () => stream.destroy());
  stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
  stream.pipe(res);
  return true;
}

function installPlaybackCapability(options) {
  const {
    app,
    cacheDir,
    ffmpegBin = 'ffmpeg',
    ffprobeBin = 'ffprobe',
    probeSeekOrigin: customProbeSeekOrigin,
    getMediaInfo,
    resolveLocal,
    resolveRemote,
    getLocalSidecars = () => [],
    getRemoteSidecars = async () => [],
    isRemoteSidecarAllowed = () => false,
  } = options || {};
  if (!app || !cacheDir || !getMediaInfo || !resolveLocal || !resolveRemote) {
    throw new Error('Playback capability installer is missing required dependencies');
  }

  const hlsRoot = path.join(cacheDir, 'hls');
  const subtitleRoot = path.join(cacheDir, 'subtitles');
  const bitmapSubtitleRoot = path.join(cacheDir, 'bitmap-subtitles');
  fs.mkdirSync(hlsRoot, { recursive: true });
  fs.mkdirSync(subtitleRoot, { recursive: true });
  fs.mkdirSync(bitmapSubtitleRoot, { recursive: true });

  const sessions = new Map();
  const subtitleJobs = new Map();
  const bitmapSubtitleJobs = new Map();
  const activeWorkers = new Set();
  const intentionallyStoppedWorkers = new WeakSet();
  const maxWorkers = Math.max(1, finite(process.env.PLAYBACK_HLS_MAX_WORKERS, 2));
  const idleMs = Math.max(60 * 60 * 1000, finite(process.env.PLAYBACK_HLS_IDLE_MS, 60 * 60 * 1000));
  const segmentSeconds = Math.max(3, Math.min(6, finite(process.env.PLAYBACK_HLS_SEGMENT_SECONDS, 4)));
  const seekOrigins = new Map();

  function probeSeekOrigin(source, info, requestedStart) {
    if (requestedStart <= 0) return Promise.resolve(0);
    const identity = `${sourceState(source)}|${requestedStart.toFixed(3)}`;
    const cached = seekOrigins.get(identity);
    if (cached) return cached;
    const task = customProbeSeekOrigin
      ? Promise.resolve(customProbeSeekOrigin(source, info, requestedStart))
      : new Promise((resolve, reject) => {
          const args = ['-v', 'error'];
          if (source.remote) args.push('-rw_timeout', '60000000');
          args.push(
            '-select_streams', 'v:0',
            '-read_intervals', `${requestedStart.toFixed(3)}%+#16`,
            '-show_entries', 'packet=pts_time,dts_time,duration_time,flags',
            '-of', 'json',
            source.input
          );
          const child = spawn(ffprobeBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
          let stdout = '';
          let stderr = '';
          let settled = false;
          const finish = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            error ? reject(error) : resolve(value);
          };
          const timer = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch {}
            finish(new Error('Keyframe lookup timed out'));
          }, 20000);
          child.stdout.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-100000); });
          child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-2000); });
          child.on('error', finish);
          child.on('close', code => {
            if (code !== 0) return finish(new Error(`Keyframe lookup failed: ${stderr.slice(-600)}`));
            try {
              const packets = JSON.parse(stdout)?.packets;
              if (!packets?.length) throw new Error('No seekable video keyframe found');
              finish(null, normalizedSeekOrigin(packets, info, requestedStart));
            } catch (error) { finish(error); }
          });
        });
    seekOrigins.set(identity, task);
    task.catch(() => seekOrigins.delete(identity));
    return task;
  }

  function sourceState(source) {
    if (source.remote) return `remote:${source.input}`;
    try {
      const stat = fs.statSync(source.input);
      return `local:${source.input}:${stat.size}:${stat.mtimeMs}`;
    } catch {
      return `local:${source.input}:missing`;
    }
  }

  function atomicWriteFile(finalPath, body, encoding = null) {
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    const tempPath = `${finalPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(tempPath, body, encoding ? { encoding } : undefined);
      fs.renameSync(tempPath, finalPath);
    } finally {
      try { if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true }); } catch {}
    }
  }

  function runFfprobeJson(args, timeoutMs, label, maxBytes = 25 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      const child = spawn(ffprobeBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
        finish(new Error(`${label} timed out`));
      }, timeoutMs);
      child.stdout.on('data', chunk => {
        if (settled) return;
        stdout += chunk;
        if (stdout.length > maxBytes) {
          try { child.kill('SIGKILL'); } catch {}
          finish(new Error(`${label} exceeded response limit`));
        }
      });
      child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-5000); });
      child.on('error', error => finish(error));
      child.on('close', code => {
        if (settled) return;
        if (code !== 0) return finish(new Error(`${label} failed: ${stderr.slice(-800)}`));
        try { finish(null, JSON.parse(stdout || '{}')); }
        catch (error) { finish(error); }
      });
    });
  }

  function bitmapSubtitleCache(source, streamIndex, windowStart = 0) {
    const sourceFingerprint = source.fingerprint || sha1(sourceState(source), 20);
    const normalizedWindowStart = Math.max(0, Math.floor(finite(windowStart) * 1000) / 1000);
    const cacheKey = sha1(`${BITMAP_SUBTITLE_CACHE_VERSION}|${sourceFingerprint}|${sourceState(source)}|stream=${streamIndex}|window=${normalizedWindowStart.toFixed(3)}|duration=${BITMAP_SUBTITLE_WINDOW_SECONDS}`, 32);
    const dir = path.join(bitmapSubtitleRoot, cacheKey, `stream-${streamIndex}`, `window-${Math.round(normalizedWindowStart * 1000)}`);
    return {
      cacheKey,
      sourceFingerprint,
      windowStart: normalizedWindowStart,
      windowDuration: BITMAP_SUBTITLE_WINDOW_SECONDS,
      dir,
      manifestPath: path.join(dir, 'manifest.json'),
      cuesDir: path.join(dir, 'cues'),
    };
  }

  function readCachedBitmapManifest(cache) {
    try {
      const payload = JSON.parse(fs.readFileSync(cache.manifestPath, 'utf8'));
      if (payload?.version === BITMAP_SUBTITLE_CACHE_VERSION && Array.isArray(payload.cues)) return payload;
    } catch {}
    return null;
  }

  function findSubtitleTrackInfo(info, streamIndex) {
    const tracks = Array.isArray(info?.subtitleTracks) ? info.subtitleTracks : [];
    const track = tracks.find(item => Number(item?.streamIndex ?? item?.index) === streamIndex)
      || tracks.find((item, index) => index === streamIndex);
    if (!track) throw new Error('Subtitle stream was not found in media info');
    const codec = cleanCodec(track.codec) || 'unknown';
    if (!RENDERABLE_BITMAP_SUBTITLE_CODECS.has(codec)) throw new Error('Subtitle stream is not a renderable bitmap codec');
    return {
      streamIndex: Number(track.streamIndex ?? track.index),
      relativeIndex: Number.isFinite(Number(track.relativeIndex)) ? Number(track.relativeIndex) : Math.max(0, tracks.indexOf(track)),
      codec,
      language: String(track.language || 'und').trim() || 'und',
      title: String(track.title || '').trim() || `Subtitle Track ${Math.max(0, tracks.indexOf(track)) + 1}`,
      forced: track.forced === true,
      default: track.default === true,
      width: Math.max(0, finite(track.width)),
      height: Math.max(0, finite(track.height)),
    };
  }

  function normalizeBitmapCues(packets, windowStart = 0, windowEnd = Infinity) {
    const sorted = (Array.isArray(packets) ? packets : [])
      .map(packet => ({
        start: finite(packet?.pts_time, NaN),
        dts: finite(packet?.dts_time, NaN),
        duration: finite(packet?.duration_time, NaN),
        size: Math.max(0, finite(packet?.size)),
        pos: String(packet?.pos ?? ''),
        flags: String(packet?.flags || ''),
      }))
      .filter(packet => Number.isFinite(packet.start) && packet.start >= 0)
      .sort((a, b) => a.start - b.start);
    const cues = sorted.map((packet, index) => {
      const nextStart = sorted[index + 1]?.start;
      const fallbackDuration = Number.isFinite(nextStart) && nextStart > packet.start
        ? Math.min(6, Math.max(0.2, nextStart - packet.start))
        : 4;
      const duration = Number.isFinite(packet.duration) && packet.duration > 0.05
        ? packet.duration
        : fallbackDuration;
      const start = Number(packet.start.toFixed(3));
      const end = Number(Math.max(start + 0.05, packet.start + duration).toFixed(3));
      return {
        id: `cue-${String(index).padStart(5, '0')}-${sha1(`${start}|${end}|${packet.pos}|${packet.size}`, 10)}`,
        index,
        start,
        end,
        duration: Number((end - start).toFixed(3)),
        pts: start,
        dts: Number.isFinite(packet.dts) ? Number(packet.dts.toFixed(3)) : null,
        size: packet.size,
        pos: packet.pos,
        flags: packet.flags,
      };
    });
    const startBoundary = Math.max(0, finite(windowStart, 0));
    const endBoundary = finite(windowEnd, Infinity);
    return cues
      .filter(cue => cue.end > startBoundary && cue.start < endBoundary)
      .map((cue, index) => ({ ...cue, index, id: cue.id.replace(/^cue-\d+/, `cue-${String(index).padStart(5, '0')}`) }));
  }

  async function buildBitmapSubtitleManifest(source, streamIndex, windowStart = 0) {
    const cache = bitmapSubtitleCache(source, streamIndex, windowStart);
    const cached = readCachedBitmapManifest(cache);
    if (cached) return cached;
    const jobKey = `manifest:${cache.manifestPath}`;
    const existing = bitmapSubtitleJobs.get(jobKey);
    if (existing) return existing;
    const task = (async () => {
      const info = await getMediaInfo(source.input);
      const track = findSubtitleTrackInfo(info, streamIndex);
      const args = ['-v', 'error'];
      if (source.remote) args.push('-rw_timeout', '60000000');
      args.push(
        '-select_streams', String(track.streamIndex),
        '-read_intervals', `${cache.windowStart.toFixed(3)}%+${cache.windowDuration.toFixed(3)}`,
        '-show_streams',
        '-show_packets',
        '-show_entries', 'stream=index,codec_name,width,height:stream_tags=language,title:packet=pts_time,dts_time,duration_time,size,flags,pos',
        '-of', 'json',
        source.input
      );
      const probed = await runFfprobeJson(args, 60000, 'Bitmap subtitle packet probe');
      const stream = (Array.isArray(probed.streams) ? probed.streams : []).find(item => Number(item.index) === track.streamIndex)
        || (Array.isArray(probed.streams) ? probed.streams[0] : null)
        || {};
      const cues = normalizeBitmapCues(probed.packets, cache.windowStart, cache.windowStart + cache.windowDuration);
      const width = Math.max(1, Math.round(finite(stream.width, track.width || info.width || 1920)));
      const height = Math.max(1, Math.round(finite(stream.height, track.height || info.height || 1080)));
      const manifest = {
        ok: true,
        version: BITMAP_SUBTITLE_CACHE_VERSION,
        cacheKey: cache.cacheKey,
        sourceFingerprint: cache.sourceFingerprint,
        streamIndex: track.streamIndex,
        relativeIndex: track.relativeIndex,
        codec: track.codec,
        language: stream.tags?.language || track.language,
        title: stream.tags?.title || track.title,
        default: track.default,
        forced: track.forced,
        timeline: 'global',
        windowStart: cache.windowStart,
        windowEnd: Number((cache.windowStart + cache.windowDuration).toFixed(3)),
        width,
        height,
        cueCount: cues.length,
        generatedAt: new Date().toISOString(),
        cues,
      };
      atomicWriteFile(cache.manifestPath, JSON.stringify(manifest), 'utf8');
      return manifest;
    })().finally(() => bitmapSubtitleJobs.delete(jobKey));
    bitmapSubtitleJobs.set(jobKey, task);
    return task;
  }

  function bitmapManifestWithUrls(manifest, source, route) {
    const remote = route?.remote === true;
    const prefix = remote
      ? `/api/playback/remote/bitmap-subtitles/${manifest.streamIndex}/cues/`
      : `/api/playback/${encodeURIComponent(route?.id || source.id)}/bitmap-subtitles/${manifest.streamIndex}/cues/`;
    const query = remote
      ? `?url=${encodeURIComponent(source.input)}&start=${encodeURIComponent(String(manifest.windowStart || 0))}&v=${encodeURIComponent(manifest.cacheKey)}`
      : `?start=${encodeURIComponent(String(manifest.windowStart || 0))}&v=${encodeURIComponent(manifest.cacheKey)}`;
    return {
      ...manifest,
      cues: manifest.cues.map(cue => ({ ...cue, imageUrl: `${prefix}${encodeURIComponent(cue.id)}.png${query}` })),
    };
  }

  function renderBitmapCue(source, streamIndex, cueId, windowStart = 0) {
    return (async () => {
      const manifest = await buildBitmapSubtitleManifest(source, streamIndex, windowStart);
      const cue = manifest.cues.find(item => item.id === cueId);
      if (!cue) throw new Error('Bitmap subtitle cue was not found');
      const cache = bitmapSubtitleCache(source, streamIndex, windowStart);
      fs.mkdirSync(cache.cuesDir, { recursive: true });
      const finalPath = path.join(cache.cuesDir, `${cue.id}.png`);
      try {
        if (fs.statSync(finalPath).size > 8) return finalPath;
      } catch {}
      const existing = bitmapSubtitleJobs.get(finalPath);
      if (existing) return existing;
      const tempPath = `${finalPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp.png`;
      const task = new Promise((resolve, reject) => {
        const width = Math.min(4096, Math.max(1, Math.round(finite(manifest.width, 1920))));
        const height = Math.min(4096, Math.max(1, Math.round(finite(manifest.height, 1080))));
        const duration = Math.min(15, Math.max(0.25, finite(cue.duration, cue.end - cue.start || 2)));
        const start = Math.max(0, finite(cue.start));
        const args = [
          '-hide_banner', '-loglevel', 'error', '-nostdin',
          '-f', 'lavfi',
          '-i', `color=c=black@0.0:s=${width}x${height}:d=${duration.toFixed(3)},format=rgba`,
        ];
        if (source.remote) args.push('-rw_timeout', '60000000', '-probesize', '2097152', '-analyzeduration', '2000000');
        args.push(
          '-ss', start.toFixed(3),
          '-i', source.input,
          '-filter_complex', `[0:v]setpts=PTS+${start.toFixed(3)}/TB[base];[base][1:s:${manifest.relativeIndex}]overlay=format=auto,format=rgba,setpts=PTS-STARTPTS[out]`,
          '-map', '[out]',
          '-frames:v', '1',
          '-update', '1',
          '-y',
          tempPath
        );
        const child = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        let settled = false;
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          error ? reject(error) : resolve(value);
        };
        const timer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch {}
          finish(new Error('Bitmap subtitle render timed out'));
        }, 90000);
        child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-5000); });
        child.on('error', error => finish(error));
        child.on('close', code => {
          if (settled) return;
          try {
            if (code !== 0) throw new Error(`Bitmap subtitle render failed: ${stderr.slice(-1000)}`);
            if (fs.statSync(tempPath).size <= 8) throw new Error('Bitmap subtitle render produced an empty image');
            fs.renameSync(tempPath, finalPath);
            finish(null, finalPath);
          } catch (error) {
            finish(error);
          }
        });
      }).finally(() => {
        bitmapSubtitleJobs.delete(finalPath);
        try { if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true }); } catch {}
      });
      bitmapSubtitleJobs.set(finalPath, task);
      return task;
    })();
  }

  async function sendBitmapManifest(res, source, streamIndex, route, windowStart = 0) {
    try {
      const manifest = await buildBitmapSubtitleManifest(source, streamIndex, windowStart);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      res.json(bitmapManifestWithUrls(manifest, source, route));
    } catch (error) {
      console.error('[Playback v2 Bitmap Subtitle] manifest failed:', error.message);
      if (!res.headersSent) res.status(422).json({ ok: false, code: 'BITMAP_SUBTITLE_UNAVAILABLE', error: 'Bitmap subtitle track unavailable' });
    }
  }

  async function sendBitmapCue(res, source, streamIndex, cueId, windowStart = 0) {
    try {
      const filePath = await renderBitmapCue(source, streamIndex, cueId, windowStart);
      if (!safeSendFile(res, filePath, 'image/png', 'public, max-age=31536000, immutable')) return res.status(404).end();
    } catch (error) {
      console.error('[Playback v2 Bitmap Subtitle] render failed:', error.message);
      if (!res.headersSent) res.status(422).json({ ok: false, code: 'BITMAP_SUBTITLE_UNAVAILABLE', error: 'Bitmap subtitle image unavailable' });
    }
  }

  function sessionFor(source, info, decision, windowStart = 0, inputStart = windowStart) {
    const profile = decision.videoAction === 'copy'
      ? `copy-${decision.videoCodec || 'unknown'}`
      : 'h264-720p-superfast-v1';
    const audioProfile = decision.audioTracks
      .map(track => `${track.streamIndex}:${track.codec}:${track.profile}:${track.outputAction}:${track.channels}:${track.outputChannels}`)
      .join(',');
    const mediaFingerprint = [
      finite(info?.fileSize), finite(info?.duration), decision.videoCodec,
      finite(info?.width), finite(info?.height), audioProfile
    ].join(':');
    const key = sha1(`playback-v4-common-timestamps|${sourceState(source)}|${mediaFingerprint}|${profile}|fmp4|${segmentSeconds}|origin=${windowStart.toFixed(3)}`, 28);
    const existing = sessions.get(key);
    if (existing) {
      existing.lastAccess = Date.now();
      return existing;
    }
    const dir = path.join(hlsRoot, key);
    const session = {
      key,
      dir,
      source,
      info,
      decision,
      windowStart,
      inputStart,
      process: null,
      state: fs.existsSync(path.join(dir, 'complete.json')) ? 'complete' : 'idle',
      error: '',
      createdAt: Date.now(),
      lastAccess: Date.now(),
      startedAt: 0,
      readyAt: 0,
      progressAt: 0,
      outTimeSeconds: 0,
      speed: 0,
      releasedAt: 0,
    };
    sessions.set(key, session);
    return session;
  }

  function masterPlaylist(session) {
    const tracks = session.decision.audioTracks;
    const defaultIndex = Math.max(0, tracks.findIndex(track => track.default));
    const lines = ['#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-INDEPENDENT-SEGMENTS'];
    for (const track of tracks) {
      const index = track.index;
      const language = String(track.language || 'und').replace(/["\r\n]/g, '');
      const title = String(track.title || `Audio Track ${index + 1}`).replace(/["\r\n]/g, "'");
      lines.push(`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${title}",LANGUAGE="${language}",AUTOSELECT=YES,DEFAULT=${index === defaultIndex ? 'YES' : 'NO'},URI="audio-${index}/index.m3u8"`);
    }
    const bandwidth = Math.max(1000000, finite(session.info?.bitrate, 6000000));
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${Math.round(bandwidth)}${tracks.length ? ',AUDIO="audio"' : ''}`);
    lines.push('video/index.m3u8', '');
    return lines.join('\n');
  }

  function outputHlsArgs(kindDir, map, codecArgs, mediaType) {
    // The deployed Windows FFmpeg resolves a bare name against its working
    // directory, causing all renditions to overwrite the same init file.
    // POSIX FFmpeg resolves it relative to the playlist instead.
    const initPath = process.platform === 'win32' ? path.join(kindDir, 'init.mp4') : 'init.mp4';
    const segmentPattern = path.join(kindDir, 'seg_%06d.m4s');
    const playlistPath = path.join(kindDir, 'index.m3u8');
    const args = ['-map', map];
    if (mediaType === 'video') args.push('-an', '-sn', '-dn');
    else args.push('-vn', '-sn', '-dn');
    args.push(
      ...codecArgs,
      '-f', 'hls',
      '-hls_segment_type', 'fmp4',
      '-hls_fmp4_init_filename', initPath,
      '-hls_time', String(segmentSeconds),
      '-hls_list_size', '0',
      '-hls_playlist_type', 'event',
      '-hls_flags', 'independent_segments+temp_file',
      '-hls_segment_filename', segmentPattern,
      playlistPath
    );
    return args;
  }

  function buildFfmpegArgs(session) {
    const inputArgs = ['-hide_banner', '-loglevel', 'warning', '-nostdin', '-nostats', '-progress', 'pipe:3'];
    if (session.source.remote) inputArgs.push('-rw_timeout', '60000000', '-probesize', '2097152', '-analyzeduration', '2000000');
    if (session.inputStart > 0) inputArgs.push('-ss', session.inputStart.toFixed(3), '-noaccurate_seek');
    inputArgs.push('-fflags', '+genpts', '-i', session.source.input);
    // One input timestamp epoch feeds every rendition. HLS.js can rebase the
    // epoch for MediaSource without changing the A/V relationship.
    inputArgs.push('-copyts', '-start_at_zero', '-avoid_negative_ts', 'disabled');

    const videoDir = path.join(session.dir, 'video');
    fs.mkdirSync(videoDir, { recursive: true });
    const videoCodecArgs = session.decision.videoAction === 'copy'
      ? ['-c:v', 'copy']
      : [
          ...(finite(session.info?.width) > 1280 ? ['-vf', 'scale=1280:-2'] : []),
          '-c:v', 'libx264', '-preset', 'superfast', '-crf', '24',
          '-maxrate', '3000k', '-bufsize', '6000k',
          '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
          '-g', String(Math.round(segmentSeconds * 24)),
          '-keyint_min', String(Math.round(segmentSeconds * 24)),
          '-sc_threshold', '0'
        ];
    const args = [...inputArgs, ...outputHlsArgs(videoDir, '0:v:0', videoCodecArgs, 'video')];

    for (const track of session.decision.audioTracks) {
      const audioDir = path.join(session.dir, `audio-${track.index}`);
      fs.mkdirSync(audioDir, { recursive: true });
      const codecArgs = track.outputAction === 'copy'
        ? ['-c:a', 'copy']
        : [
            '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '192k', '-ar', '48000',
            '-ac', String(track.outputChannels || 2),
            '-af', 'aresample=async=1:min_hard_comp=0.100'
          ];
      args.push(...outputHlsArgs(audioDir, `0:${track.streamIndex}`, codecArgs, 'audio'));
    }
    return args;
  }

  function writeSessionMetadata(session) {
    const data = {
      key: session.key,
      completedAt: new Date().toISOString(),
      strategy: session.decision.strategy,
      videoAction: session.decision.videoAction,
      audioAction: session.decision.audioAction,
      sourceState: sourceState(session.source),
    };
    fs.writeFileSync(path.join(session.dir, 'complete.json'), JSON.stringify(data, null, 2));
  }

  function startSession(session) {
    session.lastAccess = Date.now();
    if (session.state === 'complete') return session;
    if (session.process && session.process.exitCode === null) return session;
    if (session.state === 'failed' && Date.now() - finite(session.failedAt) < 30000) {
      throw new Error(session.error || 'Compatibility generation failed');
    }
    if (activeWorkers.size >= maxWorkers) {
      const error = new Error('Compatibility stream capacity is currently busy');
      error.code = 'PLAYBACK_BUSY';
      throw error;
    }

    fs.rmSync(session.dir, { recursive: true, force: true });
    fs.mkdirSync(session.dir, { recursive: true });
    const args = buildFfmpegArgs(session);
    session.state = 'preparing';
    session.error = '';
    session.failedAt = 0;
    session.startedAt = Date.now();
    session.readyAt = 0;
    session.progressAt = 0;
    session.outTimeSeconds = 0;
    session.speed = 0;
    const child = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe'] });
    session.process = child;
    activeWorkers.add(child);
    let stderr = '';
    console.log(`[Playback v2 HLS] start key=${session.key} strategy=${session.decision.strategy} source=${session.source.label}`);
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-5000); });
    let progressText = '';
    child.stdio[3].on('data', chunk => {
      progressText += chunk.toString();
      const lines = progressText.split(/\r?\n/);
      progressText = lines.pop() || '';
      for (const line of lines) {
        const separator = line.indexOf('=');
        if (separator < 1) continue;
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1);
        if (key === 'out_time_us') session.outTimeSeconds = Math.max(0, finite(value) / 1000000);
        if (key === 'speed') session.speed = Math.max(0, finite(value.replace(/x$/i, '')));
        if (key === 'progress') session.progressAt = Date.now();
      }
    });
    child.on('error', error => {
      if (intentionallyStoppedWorkers.has(child)) return;
      session.error = error.message;
      session.state = 'failed';
      session.failedAt = Date.now();
    });
    child.on('close', code => {
      activeWorkers.delete(child);
      if (intentionallyStoppedWorkers.has(child)) {
        intentionallyStoppedWorkers.delete(child);
        if (session.process === child) session.process = null;
        session.error = '';
        session.state = 'idle';
        console.log(`[Playback v2 HLS] stopped idle partial session key=${session.key}; partial cache retained`);
        return;
      }
      if (session.process === child) session.process = null;
      if (code === 0) {
        session.state = 'complete';
        session.lastAccess = Date.now();
        try { writeSessionMetadata(session); } catch (error) { console.warn('[Playback v2 HLS] metadata write failed:', error.message); }
      } else if (session.state !== 'stopped') {
        session.error = session.error || `FFmpeg exited with code ${code}: ${stderr.slice(-1200)}`;
        session.state = 'failed';
        session.failedAt = Date.now();
        console.error(`[Playback v2 HLS] failed key=${session.key}: ${session.error}`);
      }
    });
    return session;
  }

  function playlistReady(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const segmentCount = (content.match(/seg_\d+\.m4s/g) || []).length;
      return content.includes('#EXT-X-MAP') && segmentCount >= 3;
    } catch {
      return false;
    }
  }

  function waitForFile(session, filePath, predicate, timeoutMs) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        session.lastAccess = Date.now();
        if (session.error && session.state === 'failed') return reject(new Error(session.error));
        try {
          if (fs.existsSync(filePath) && (!predicate || predicate(filePath))) return resolve(filePath);
        } catch {}
        if (Date.now() - started >= timeoutMs) return reject(new Error('Compatibility stream is not ready yet'));
        setTimeout(check, 150);
      };
      check();
    });
  }

  function rewriteMediaPlaylist(content) {
    return String(content)
      .replace(/#EXT-X-MAP:URI="[^"]*[\\/]([^"\\/]+)"/g, '#EXT-X-MAP:URI="$1"')
      .split(/\r?\n/)
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        return path.basename(trimmed.replace(/\\/g, '/'));
      })
      .join('\n');
  }

  function sessionKindDir(session, kind) {
    if (kind === 'video') return path.join(session.dir, 'video');
    if (/^audio-\d+$/.test(kind)) return path.join(session.dir, kind);
    return null;
  }

  async function capabilityFor(req, source) {
    const info = await getMediaInfo(source.input);
    const caps = browserCapabilities(req);
    const decision = playbackDecision(info, source.input, source.filename, caps);
    const requestedStart = Math.max(0, finite(req.query.start));
    const maxStart = Math.max(0, finite(info.duration) - 1);
    const inputStart = Math.min(maxStart, Math.floor(requestedStart * 1000) / 1000);
    const windowStart = decision.mode === 'hls'
      ? await probeSeekOrigin(source, info, inputStart)
      : 0;
    const directUrl = source.directUrl;
    let hlsUrl = null;
    let session = null;
    if (decision.mode === 'hls') {
      session = sessionFor(source, info, decision, windowStart, inputStart);
      hlsUrl = `/api/playback-hls/${session.key}/master.m3u8`;
    }

    const embedded = (Array.isArray(info.subtitleTracks) ? info.subtitleTracks : []).map((track, index) =>
      normalizedSubtitleTrack(
        {...track,timeline:decision.mode === 'hls' ? 'local' : 'global'},
        index,
        streamIndex => source.remote
          ? `/api/playback/remote/subtitles/${streamIndex}.vtt?url=${encodeURIComponent(source.input)}&start=${inputStart}`
          : `/api/playback/${encodeURIComponent(source.id)}/subtitles/${streamIndex}.vtt?start=${inputStart}`,
        streamIndex => source.remote
          ? `/api/playback/remote/bitmap-subtitles/${streamIndex}/manifest.json?url=${encodeURIComponent(source.input)}&start=${inputStart}`
          : `/api/playback/${encodeURIComponent(source.id)}/bitmap-subtitles/${streamIndex}/manifest.json?start=${inputStart}`
      )
    );
    const sidecars = source.remote
      ? (req.query.sidecars === '1' ? await getRemoteSidecars(source.input, req).catch(() => []) : [])
      : getLocalSidecars(source);
    const external = (Array.isArray(sidecars) ? sidecars : []).map((track, index) =>
      normalizedSubtitleTrack({ ...track, sidecar: true, timeline:decision.mode === 'hls' ? 'local' : 'global', codec: cleanCodec(track.codec || track.ext).replace(/^\./, '') }, embedded.length + index, (_streamIndex, item) => {
        if (source.remote) {
          const sidecarUrl = item.src || item.url || item.filePath || '';
          return `/api/playback/remote/subtitles/sidecar/${index}.vtt?url=${encodeURIComponent(source.input)}&sidecar=${encodeURIComponent(sidecarUrl)}&start=${inputStart}`;
        }
        return `/api/playback/${encodeURIComponent(source.id)}/subtitles/sidecar/${index}.vtt?start=${inputStart}`;
      })
    );

    return {
      ok: true,
      id: source.id,
      title: source.label,
      mode: decision.mode,
      strategy: decision.strategy,
      reason: decision.reason,
      container: decision.container,
      videoCodec: decision.videoCodec || 'unknown',
      width: finite(info.width),
      height: finite(info.height),
      duration: finite(info.duration),
      windowStart,
      requestedStart: inputStart,
      audioTracks: decision.audioTracks,
      subtitleTracks: [...embedded, ...external],
      directUrl: decision.mode === 'direct' ? directUrl : null,
      originalUrl: directUrl,
      hlsUrl,
      cacheKey: session?.key || null,
      conversion: {
        video: decision.videoAction,
        audio: decision.audioAction,
        subtitles: 'independent-webvtt-bitmap-overlay',
      },
      source: {
        canonicalId: source.canonicalId || source.id || null,
        kind: source.remote ? 'remote' : 'local',
        fingerprint: source.fingerprint || sha1(sourceState(source), 20),
      },
    };
  }

  function jsonFailure(res, error) {
    const status = error?.status || (error?.code === 'PLAYBACK_BUSY' ? 503 : 502);
    const code = error?.code || (status === 404 ? 'SOURCE_MISSING' : 'PLAYBACK_PREPARATION_FAILED');
    return res.status(status).json({ ok: false, code, error: error?.publicMessage || error?.message || 'Playback preparation failed' });
  }

  app.get('/api/playback/status', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      sessions: [...sessions.values()].map(session => ({
        key: session.key,
        state: session.state,
        strategy: session.decision.strategy,
        createdAt: session.createdAt,
        startedAt: session.startedAt,
        readyAt: session.readyAt,
        lastAccess: session.lastAccess,
        running: !!session.process,
        progressAt: session.progressAt,
        outTimeSeconds: session.outTimeSeconds,
        sourceDuration: finite(session.info?.duration),
        windowStart: session.windowStart,
        inputStart: session.inputStart,
        generatedRatio: finite(session.info?.duration) > session.windowStart
          ? Math.min(1, session.outTimeSeconds / (finite(session.info.duration) - session.windowStart))
          : 0,
        speed: session.speed,
        releasedAt: session.releasedAt,
        audioTracks: session.decision.audioTracks.map(track => ({
          streamIndex: track.streamIndex,
          codec: track.codec,
          profile: track.profile,
          channels: track.channels,
          outputAction: track.outputAction,
          outputCodec: track.outputCodec,
          outputChannels: track.outputChannels,
        })),
        error: session.error || '',
      })),
      activeWorkers: activeWorkers.size,
      subtitleJobs: subtitleJobs.size,
      bitmapSubtitleJobs: bitmapSubtitleJobs.size,
    });
  });

  app.get('/api/playback/remote', async (req, res) => {
    try {
      const source = await resolveRemote(String(req.query.url || ''), req);
      if (!source) {
        const error = new Error('Remote media source is not in the StreamVault catalog');
        error.status = 404;
        error.code = 'SOURCE_MISSING';
        throw error;
      }
      const candidates = [{ ...source, remote: true }];
      for (const alt of Array.isArray(source.alternateSources) ? source.alternateSources : []) {
        const input = String(alt?.url || alt?.streamUrl || '').trim();
        if (!input || candidates.some(candidate => candidate.input === input)) continue;
        candidates.push({
          ...source,
          input,
          filename: alt.file || alt.filename || source.filename,
          label: alt.title || alt.name || source.label,
          matched: alt,
          fingerprint: crypto.createHash('sha1').update(input).digest('hex').slice(0, 20),
          directUrl: `/api/ftp/proxy?playbackType=media&url=${encodeURIComponent(input)}`,
          remote: true,
        });
      }
      let lastError = null;
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        try {
          const payload = await capabilityFor(req, candidate);
          if (index > 0) console.warn(`[Playback v2] remote capability recovered with alternate source canonicalId=${candidate.canonicalId || candidate.id || ''} sourceFingerprint=${candidate.fingerprint}`);
          res.setHeader('Cache-Control', 'private, max-age=60');
          return res.json(payload);
        } catch (error) {
          lastError = error;
          const status = Number(error?.status) || 502;
          if (index >= candidates.length - 1 || status < 500) throw error;
          console.warn(`[Playback v2] remote capability source failed; trying alternate ${index + 1}/${candidates.length - 1}: ${error.message}`);
        }
      }
      throw lastError || new Error('Remote playback source could not be prepared');
    } catch (error) {
      console.error('[Playback v2] remote capability failed:', error.message);
      jsonFailure(res, error);
    }
  });

  app.get('/api/playback/:id', async (req, res) => {
    try {
      // Canonical IDs can identify either indexed local media or a catalog
      // original. Pass request context to the host resolver so it can reuse
      // the authoritative catalog/download lookup before declaring a source
      // missing.
      let source = await resolveLocal(req.params.id, req, { refresh: false });
      if (!source) source = await resolveLocal(req.params.id, req, { refresh: true });
      if (!source) {
        const error = new Error('Source file missing');
        error.status = 404;
        error.code = 'SOURCE_MISSING';
        throw error;
      }
      res.setHeader('Cache-Control', 'private, max-age=60');
      res.json(await capabilityFor(req, {
        ...source,
        remote: source.remote === true,
        id: source.id || req.params.id,
        canonicalId: source.canonicalId || req.params.id,
      }));
    } catch (error) {
      console.error('[Playback v2] local capability failed:', error.message);
      jsonFailure(res, error);
    }
  });

  app.get('/api/playback-hls/:key/master.m3u8', (req, res) => {
    const session = sessions.get(req.params.key);
    if (!session) return res.status(404).send('#EXTM3U\n');
    try {
      session.releasedAt = 0;
      startSession(session);
      session.lastAccess = Date.now();
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(masterPlaylist(session));
    } catch (error) {
      console.error('[Playback v2 HLS] master failed:', error.message);
      res.status(error.code === 'PLAYBACK_BUSY' ? 503 : 500).send('#EXTM3U\n');
    }
  });

  app.post('/api/playback-hls/:key/release', (req, res) => {
    const session = sessions.get(req.params.key);
    res.setHeader('Cache-Control', 'no-store');
    if (!session) return res.json({ ok: true, released: false });
    session.lastAccess = Date.now();
    session.releasedAt = Date.now();
    const child = session.process;
    if (!child || child.exitCode !== null) return res.json({ ok: true, released: false, state: session.state });
    session.state = 'stopped';
    intentionallyStoppedWorkers.add(child);
    let replied = false;
    const finish = () => {
      if (replied || res.headersSent) return;
      replied = true;
      res.json({ ok: true, released: true, state: session.state });
    };
    child.once('close', finish);
    try { child.kill('SIGKILL'); } catch {}
    setTimeout(finish, 3000);
  });

  app.get('/api/playback-hls/:key/:kind/:file', async (req, res) => {
    const session = sessions.get(req.params.key);
    if (!session) return res.status(404).end();
    const kindDir = sessionKindDir(session, req.params.kind);
    if (!kindDir) return res.status(404).end();
    const file = path.basename(req.params.file);
    if (!/^(?:index\.m3u8|init\.mp4|seg_\d+\.m4s)$/.test(file)) return res.status(404).end();
    const filePath = path.join(kindDir, file);
    if (!ensureInside(session.dir, filePath)) return res.status(404).end();
    try {
      // A destroyed Hls.js instance can leave one final asset request in
      // flight. Do not let that stale request resurrect a released worker;
      // a genuine reopen always requests the master playlist first.
      if (session.releasedAt && !session.process && session.state !== 'complete') return res.status(410).end();
      startSession(session);
      session.lastAccess = Date.now();
      if (file === 'index.m3u8') {
        await waitForFile(session, filePath, playlistReady, 30000);
        const content = rewriteMediaPlaylist(fs.readFileSync(filePath, 'utf8'));
        if (!session.readyAt) session.readyAt = Date.now();
        if (session.state === 'preparing') session.state = 'ready';
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.send(content);
      }
      await waitForFile(session, filePath, candidate => fs.statSync(candidate).size > 0, 10000);
      const type = file === 'init.mp4' ? 'video/mp4' : 'video/iso.segment';
      // FFmpeg publishes init/segment files atomically via temp_file. Once a
      // filename is visible its bytes never change, even while later segments
      // are still being generated, so it is safe and useful to cache it.
      const cacheControl = 'public, max-age=31536000, immutable';
      if (!safeSendFile(res, filePath, type, cacheControl)) return res.status(404).end();
    } catch (error) {
      console.error(`[Playback v2 HLS] asset failed key=${session.key} file=${file}:`, error.message);
      if (!res.headersSent) res.status(503).end();
    }
  });

  function subtitleCachePath(source, identity) {
    return path.join(subtitleRoot, `${sha1(`${sourceState(source)}|${identity}`)}.vtt`);
  }

  function runSubtitleJob(source, identity, ffmpegArgs) {
    const finalPath = subtitleCachePath(source, identity);
    try {
      if (fs.statSync(finalPath).size > 6) return Promise.resolve(finalPath);
    } catch {}
    const existing = subtitleJobs.get(finalPath);
    if (existing) return existing;
    const tempPath = `${finalPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    const promise = new Promise((resolve, reject) => {
      const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
      if (source.remote) args.push('-rw_timeout', '60000000', '-probesize', '2097152', '-analyzeduration', '2000000');
      args.push(...ffmpegArgs, '-c:s', 'webvtt', '-f', 'webvtt', tempPath);
      const child = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { child.kill('SIGKILL'); } catch {}
        reject(new Error('Subtitle conversion timed out'));
      }, 120000);
      child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-3000); });
      child.on('error', error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', code => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          if (code !== 0) throw new Error(`Subtitle conversion failed: ${stderr.slice(-800)}`);
          const body = fs.readFileSync(tempPath, 'utf8');
          if (!body.startsWith('WEBVTT')) throw new Error('Subtitle conversion did not produce WebVTT');
          fs.renameSync(tempPath, finalPath);
          resolve(finalPath);
        } catch (error) {
          reject(error);
        }
      });
    }).finally(() => {
      subtitleJobs.delete(finalPath);
      try { if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true }); } catch {}
    });
    subtitleJobs.set(finalPath, promise);
    return promise;
  }

  function subtitleInputArgs(input, streamIndex, start) {
    const args=[];
    if(start > 0) args.push('-ss', start.toFixed(3));
    args.push('-i', input, '-map', `0:${streamIndex}?`);
    return args;
  }

  async function sendSubtitle(res, job) {
    try {
      const filePath = await job;
      if (!safeSendFile(res, filePath, 'text/vtt; charset=utf-8', 'public, max-age=31536000, immutable')) return res.status(404).end();
    } catch (error) {
      console.error('[Playback v2 Subtitle] failed:', error.message);
      if (!res.headersSent) res.status(422).json({ ok: false, code: 'SUBTITLE_UNAVAILABLE', error: 'Subtitle track unavailable' });
    }
  }

  app.get('/api/playback/remote/bitmap-subtitles/:streamIndex/manifest.json', async (req, res) => {
    const source = resolveRemote(String(req.query.url || ''));
    const streamIndex = Number(req.params.streamIndex);
    if (!source || !Number.isInteger(streamIndex) || streamIndex < 0) return res.status(404).end();
    const start = Math.max(0, finite(req.query.start));
    sendBitmapManifest(res, { ...source, remote: true }, streamIndex, { remote: true }, start);
  });

  app.get('/api/playback/remote/bitmap-subtitles/:streamIndex/cues/:cueId.png', async (req, res) => {
    const source = resolveRemote(String(req.query.url || ''));
    const streamIndex = Number(req.params.streamIndex);
    const cueId = String(req.params.cueId || '');
    if (!source || !Number.isInteger(streamIndex) || streamIndex < 0 || !/^cue-\d{5}-[a-f0-9]{10}$/.test(cueId)) return res.status(404).end();
    const start = Math.max(0, finite(req.query.start));
    sendBitmapCue(res, { ...source, remote: true }, streamIndex, cueId, start);
  });

  app.get('/api/playback/:id/bitmap-subtitles/:streamIndex/manifest.json', async (req, res) => {
    const source = resolveLocal(req.params.id);
    const streamIndex = Number(req.params.streamIndex);
    if (!source || !Number.isInteger(streamIndex) || streamIndex < 0) return res.status(404).end();
    const start = Math.max(0, finite(req.query.start));
    sendBitmapManifest(res, { ...source, remote: false }, streamIndex, { remote: false, id: req.params.id }, start);
  });

  app.get('/api/playback/:id/bitmap-subtitles/:streamIndex/cues/:cueId.png', async (req, res) => {
    const source = resolveLocal(req.params.id);
    const streamIndex = Number(req.params.streamIndex);
    const cueId = String(req.params.cueId || '');
    if (!source || !Number.isInteger(streamIndex) || streamIndex < 0 || !/^cue-\d{5}-[a-f0-9]{10}$/.test(cueId)) return res.status(404).end();
    const start = Math.max(0, finite(req.query.start));
    sendBitmapCue(res, { ...source, remote: false }, streamIndex, cueId, start);
  });

  app.get('/api/playback/remote/subtitles/sidecar/:index.vtt', async (req, res) => {
    const source = resolveRemote(String(req.query.url || ''));
    if (!source) return res.status(404).end();
    let sidecar;
    try {
      sidecar = new URL(String(req.query.sidecar || ''), source.input);
      const mediaUrl = new URL(source.input);
      if (sidecar.hostname !== mediaUrl.hostname || sidecar.protocol !== mediaUrl.protocol || !isRemoteSidecarAllowed(source.input, sidecar.href)) return res.status(403).end();
    } catch {
      return res.status(400).end();
    }
    const remoteSource = { ...source, remote: true };
    const start=Math.max(0,finite(req.query.start));
    sendSubtitle(res, runSubtitleJob(remoteSource, `sidecar:${sidecar.href}:start=${start.toFixed(3)}`, subtitleInputArgs(sidecar.href,'s:0',start)));
  });

  app.get('/api/playback/remote/subtitles/:streamIndex.vtt', (req, res) => {
    const source = resolveRemote(String(req.query.url || ''));
    const streamIndex = Number(req.params.streamIndex);
    if (!source || !Number.isInteger(streamIndex) || streamIndex < 0) return res.status(404).end();
    const remoteSource = { ...source, remote: true };
    const start=Math.max(0,finite(req.query.start));
    sendSubtitle(res, runSubtitleJob(remoteSource, `embedded:${streamIndex}:start=${start.toFixed(3)}`, [...subtitleInputArgs(source.input,streamIndex,start),'-vn','-an']));
  });

  app.get('/api/playback/:id/subtitles/sidecar/:index.vtt', (req, res) => {
    const source = resolveLocal(req.params.id);
    const index = Number(req.params.index);
    if (!source || !Number.isInteger(index) || index < 0) return res.status(404).end();
    const sidecars = getLocalSidecars(source);
    const track = sidecars[index];
    if (!track?.filePath || !fs.existsSync(track.filePath)) return res.status(404).end();
    const localSource = { ...source, remote: false };
    const start=Math.max(0,finite(req.query.start));
    sendSubtitle(res, runSubtitleJob(localSource, `sidecar:${track.filePath}:start=${start.toFixed(3)}`, subtitleInputArgs(track.filePath,'s:0',start)));
  });

  app.get('/api/playback/:id/subtitles/:streamIndex.vtt', (req, res) => {
    const source = resolveLocal(req.params.id);
    const streamIndex = Number(req.params.streamIndex);
    if (!source || !Number.isInteger(streamIndex) || streamIndex < 0) return res.status(404).end();
    const localSource = { ...source, remote: false };
    const start=Math.max(0,finite(req.query.start));
    sendSubtitle(res, runSubtitleJob(localSource, `embedded:${streamIndex}:start=${start.toFixed(3)}`, [...subtitleInputArgs(source.input,streamIndex,start),'-vn','-an']));
  });

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const session of sessions.values()) {
      if (!session.process || session.state === 'stopped' || now - session.lastAccess <= idleMs) continue;
      const child = session.process;
      session.state = 'stopped';
      intentionallyStoppedWorkers.add(child);
      try { child.kill('SIGKILL'); } catch {}
    }
  }, 30000);
  cleanupTimer.unref?.();

  const stopWorkers = () => {
    clearInterval(cleanupTimer);
    for (const session of sessions.values()) {
      try {
        if (session.process) {
          intentionallyStoppedWorkers.add(session.process);
          session.process.kill('SIGKILL');
        }
      } catch {}
    }
  };
  process.once('SIGINT', stopWorkers);
  process.once('SIGTERM', stopWorkers);

  return { sessions, subtitleJobs, stopWorkers, buildFfmpegArgs, probeSeekOrigin };
}

module.exports = {
  installPlaybackCapability,
  playbackDecision,
  normalizedAudioTrack,
  normalizedSubtitleTrack,
  normalizedSeekOrigin,
};
