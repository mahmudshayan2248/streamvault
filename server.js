const express = require('express');
const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const http    = require('http');
const crypto  = require('crypto');
const { spawn } = require('child_process');

const tracker         = require('./middleware/tracker');
const dashboardRoutes = require('./routes/dashboard');
const createSystemStatsRouter = require('./routes/system-stats');

const app  = express();
const PORT = process.env.PORT || 3000;
const FFMPEG_BIN = process.env.FFMPEG_BIN || process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_BIN || process.env.FFPROBE_PATH || 'ffprobe';

// ── Paths ─────────────────────────────────────────────────────────────────────
const MEDIA_ROOT   = 'C:\\Users\\Mac Mini\\Desktop\\Website Host\\Streaming_Website\\streamvault';
const MOVIES_DIR   = 'C:\\Users\\Mac Mini\\Desktop\\Website Host\\Streaming_Website\\streamvault\\movies';
const SERIES_DIR   = 'C:\\Users\\Mac Mini\\Desktop\\Website Host\\Streaming_Website\\streamvault\\series';
const CACHE_FILE   = path.join(__dirname, 'poster-cache.json');
const HISTORY_FILE = path.join(__dirname, 'watch-history.json');
const INDEX_FILE   = path.join(__dirname, 'file-index.json');
const CHANNELS_FILE = path.join(__dirname, 'channels.json');
const MASSIVE_CATALOG_FILE = path.join(__dirname, 'scan-output', 'clean-catalog.json');
const MOBILE_HLS_DIR = path.join(__dirname, 'cache', 'mobile-hls');
const MOBILE_HLS_IDLE_MS = Number(process.env.MOBILE_HLS_IDLE_MS || 45000);
const MOBILE_HLS_MAX_SESSIONS = Number(process.env.MOBILE_HLS_MAX_SESSIONS || 2);
const MOBILE_HLS_FFMPEG_THREADS = String(process.env.MOBILE_HLS_FFMPEG_THREADS || 1);
const MOBILE_HLS_PROFILE = String(process.env.MOBILE_HLS_PROFILE || 'mobile-hls-v3');
const MOBILE_HLS_MAX_WIDTH = Number(process.env.MOBILE_HLS_MAX_WIDTH || 854);
const MOBILE_HLS_MAX_FPS = Number(process.env.MOBILE_HLS_MAX_FPS || 24);
const MOBILE_HLS_VIDEO_MAXRATE = String(process.env.MOBILE_HLS_VIDEO_MAXRATE || '1200k');
const MOBILE_HLS_VIDEO_BUFSIZE = String(process.env.MOBILE_HLS_VIDEO_BUFSIZE || '2400k');
const MOBILE_HLS_AUDIO_BITRATE = String(process.env.MOBILE_HLS_AUDIO_BITRATE || '96k');
const MEDIA_FFMPEG_STREAM_MAX = Number(process.env.MEDIA_FFMPEG_STREAM_MAX || 2);
const MEDIA_FFMPEG_STARTUP_MS = Number(process.env.MEDIA_FFMPEG_STARTUP_MS || 15000);
let activeMediaFfmpegStreams = 0;

// ── FFmpeg helper for extracting media info ──────────────────────────────────
function getMediaInfo(filePath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn(FFPROBE_BIN, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath
    ]);

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ffprobe.kill('SIGKILL'); } catch {}
      reject(new Error('ffprobe timed out'));
    }, 20000);

    ffprobe.stdout.on('data', data => stdout += data);
    ffprobe.stderr.on('data', data => stderr += data);

    ffprobe.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) return reject(new Error(`ffprobe failed: ${stderr}`));
      try {
        const info = JSON.parse(stdout);
        const audioTracks = info.streams
          .filter(s => s.codec_type === 'audio')
          .map((s, i) => ({
            index: s.index,
            codec: s.codec_name,
            language: s.tags?.language || 'und',
            title: s.tags?.title || `Audio ${i + 1}`,
            channels: s.channels || 2
          }));

        const subtitleTracks = info.streams
          .filter(s => s.codec_type === 'subtitle')
          .map((s, i) => ({
            index: s.index,
            codec: s.codec_name,
            language: s.tags?.language || 'und',
            title: s.tags?.title || `Subtitle ${i + 1}`
          }));

        const videoStream = info.streams.find(s => s.codec_type === 'video');

        resolve({ 
          audioTracks, 
          subtitleTracks,
          videoCodec: videoStream?.codec_name || 'unknown',
          videoIndex: videoStream?.index ?? 0,
          duration: parseFloat(info.format?.duration) || 0,
          container: info.format?.format_name || 'unknown'
        });
      } catch (e) {
        reject(e);
      }
    });

    ffprobe.on('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });
  });
}

const mediaInfoCache = new Map();

function getCachedMediaInfo(filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    const cacheKey = `remote:${filePath}`;
    const cached = mediaInfoCache.get(cacheKey);
    if (cached) return cached.promise;
    const promise = getMediaInfo(filePath).catch(err => {
      mediaInfoCache.delete(cacheKey);
      throw err;
    });
    mediaInfoCache.set(cacheKey, { cacheKey, promise });
    return promise;
  }

  const cacheKey = `${stat.size}:${stat.mtimeMs}`;
  const cached = mediaInfoCache.get(filePath);
  if (cached && cached.cacheKey === cacheKey) return cached.promise;

  const promise = getMediaInfo(filePath).catch(err => {
    mediaInfoCache.delete(filePath);
    throw err;
  });
  mediaInfoCache.set(filePath, { cacheKey, promise });

  if (mediaInfoCache.size > 200) {
    const oldestKey = mediaInfoCache.keys().next().value;
    mediaInfoCache.delete(oldestKey);
  }

  return promise;
}

// ── iPhone/iOS Detection & Compatibility Check ────────────────────────────────
function isAppleDevice(userAgent) {
  const ua = userAgent || '';
  if (/Chrome|CriOS|FxiOS|Firefox|Edg\/|EdgA|OPR|OPiOS/i.test(ua)) return false;
  return /iPhone|iPad|iPod|Safari/i.test(ua);
}

function needsTranscode(mediaInfo, userAgent) {
  const videoCodec = (mediaInfo.videoCodec || '').toLowerCase();
  const container = (mediaInfo.container || '').toLowerCase();

  // Codecs that are almost never hardware‑decoded in desktop browsers
  const permaBadCodecs = ['hevc', 'h265', 'vp9', 'vp8', 'av1', 'vc1'];
  // Containers that Chrome often struggles with if not MP4
  const badContainers = ['matroska', 'webm', 'avi', 'flv', 'mpegts'];

  if (!isAppleDevice(userAgent)) {
    // Transcode if the codec is known to be problematic, OR the container isn’t MP4/MOV
    return permaBadCodecs.some(c => videoCodec.includes(c)) ||
           badContainers.some(c => container.includes(c));
  }

  // Apple devices need special care (they can handle HEVC but not MKV)
  return badContainers.some(c => container.includes(c)) ||
         permaBadCodecs.some(c => videoCodec.includes(c));
}

function isMobilePlaybackRequest(req) {
  const ua = req.headers['user-agent'] || '';
  return req.query.mobile === '1' || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

// ── TMDB API Key ─────────────────────────────────────────────────────────────
const TMDB_TOKEN  = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIzMzBlNWEzOTMzNzcxYjNkZjgxNTg5NzQ1N2E5MGFjOCIsIm5iZiI6MTc3NTk3MDAxNy40NTcsInN1YiI6IjY5ZGIyNmUxNGVjZGE5YWU1MzAyNzFjZSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.QiajIRSY3s_J4sRSbnT7Jl70XK3zpROtMn8Pumzyn_M';
const TMDB_IMG    = 'https://image.tmdb.org/t/p';
const OMDB_KEY    = process.env.OMDB_API_KEY || process.env.OMDB_KEY || '';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.YT_API_KEY || '';

const TMDB_GENRES = {
  28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',
  99:'Documentary',18:'Drama',10751:'Family',14:'Fantasy',36:'History',
  27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',878:'Sci-Fi',
  53:'Thriller',10752:'War',37:'Western',
  10759:'Action & Adventure',10762:'Kids',10763:'News',10764:'Reality',
  10765:'Sci-Fi & Fantasy',10766:'Soap',10767:'Talk',10768:'War & Politics'
};

// ── Extension sets ────────────────────────────────────────────────────────────
const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.mpg', '.mpeg', '.3gp'];
const SUB_EXTS   = ['.srt', '.vtt', '.ass', '.ssa'];
const MIME = {
  '.mp4':  'video/mp4',
  '.m4v':  'video/mp4',
  '.mkv':  'video/x-matroska',
  '.avi':  'video/x-msvideo',
  '.mov':  'video/quicktime',
  '.webm': 'video/webm',
  '.ogv':  'video/ogg',
  '.ogg':  'video/ogg',
  '.flv':  'video/x-flv',
  '.wmv':  'video/x-ms-wmv',
  '.mpg':  'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.3gp':  'video/3gpp',
};

// ── Quality tiers ─────────────────────────────────────────────────────────────
const QUALITY_TIERS = {
  auto:    null,
  '1080p': 5_000_000,
  '720p':  2_500_000,
  '480p':  1_000_000,
  '360p':    500_000,
};

// ── Persistent caches ─────────────────────────────────────────────────────────
let posterCache  = {};
let watchHistory = {};
let fileIndex    = [];
let channels     = [];

// ── Pre-built in-memory lists (instant API responses) ─────────────────────────
let _movieList   = null;   // built synchronously at startup
let _seriesList  = null;   // built synchronously at startup
let _enrichBusy  = false;  // background TMDB enrichment flag

function loadJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return fallback;
}
posterCache  = loadJSON(CACHE_FILE,    {});
watchHistory = loadJSON(HISTORY_FILE,  {});
channels     = loadJSON(CHANNELS_FILE, []);

// ── FTP Catalog ───────────────────────────────────────────────────────────────
let ftpCatalog = { movies: [], series: [] };
try {
  const catalogPath = path.join(__dirname, 'catalog.json');
  if (fs.existsSync(catalogPath)) {
    ftpCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    console.log(`📡 FTP Catalog loaded: ${ftpCatalog.movies.length} movies, ${ftpCatalog.series.length} series`);
  }
} catch (e) { console.warn('⚠ Could not load catalog.json:', e.message); }

// ═══════════════════════════════════════════════════════════════════════════════
// AGGRESSIVE CARTOON / ANIME FILTER
// ═══════════════════════════════════════════════════════════════════════════════
function isCartoonOrAnime(item) {
  if (!item) return false;
  
  const name = (item.name || item.title || '').toLowerCase();
  const genre = (item.genre || '').toLowerCase();
  const filename = (item.file || item.filename || '').toLowerCase();
  
  // 1. Exclude by genre
  if (genre.includes('animation') || genre.includes('anime')) return true;
  
  // 2. Exclude by title / filename keywords
  const badKeywords = [
    'cartoon', 'anime', 'animated', 'tv cartoon', 'cartoon series',
    'kids', 'children', 'pbs kids', 'nickelodeon', 'disney channel',
    'cartoon network', 'boomerang', 'adult swim', 'family guy', 'simpsons',
    'south park', 'rick and morty', 'sponge', 'paw patrol', 'peppa pig',
    'anime movie', 'animated movie'
  ];
  if (badKeywords.some(kw => name.includes(kw) || filename.includes(kw))) return true;
  
  // 3. Regex patterns: (TV Cartoon), (Cartoon), Animated Series, etc.
  const cartoonPatterns = [
    /\btv cartoon\b/i, /\bcartoon\b/i, /\banimated series\b/i,
    /\(\s*tv\s+cartoon\s*\)/i, /\(\s*cartoon\s*\)/i
  ];
  if (cartoonPatterns.some(re => re.test(filename) || re.test(name))) return true;
  
  return false;
}

// Improved deduplication using title + year
function dedupMovies() {
  const seen = new Set();
  return ftpCatalog.movies.filter(m => {
    const key = `${m.title}|${m.year || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupSeries() {
  const seen = new Set();
  return ftpCatalog.series.filter(s => {
    const key = `${s.title}|${s.year || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

let _dedupedMovies = null;
let _dedupedSeries = null;

function getCachedMovies() {
  if (!_dedupedMovies) _dedupedMovies = dedupMovies();
  return _dedupedMovies;
}

function getCachedSeries() {
  if (!_dedupedSeries) _dedupedSeries = dedupSeries();
  return _dedupedSeries;
}



// ── Massive clean catalog layer ───────────────────────────────────────────────
// This is backend-only and is enabled only for browse/search endpoints that ask
// for it. Homepage/home-feed/software APIs stay untouched.
let _massiveCatalogLoaded = false;
let _massiveMovies = [];
let _massiveSeries = [];

function svSafeDecode(value) {
  try { return decodeURIComponent(String(value || '')); }
  catch { return String(value || ''); }
}


function svCleanMediaTitle(value) {
  let raw = svSafeDecode(value || '')
    .split(/[?#]/)[0]
    .replace(/\\/g, '/')
    .split('/')
    .pop() || '';
  raw = raw
    .replace(/\.(mp4|mkv|avi|mov|webm|m3u8|ts|flv|wmv|mpg|mpeg)$/i, '')
    .replace(/^\s*\d{1,3}\s*[-–—.]\s*/g, ' ')
    .replace(/\b(480p|576p|720p|1080p|1440p|2160p|4k|8k|uhd|hdr|hdr10|dv|dolby[ ._-]*vision|imax|web[- ]?dl|webrip|web|bluray|brrip|brip|dvdrip|hdrip|hdtv|hdcam|hdtc|camrip|amzn|nf|dsnp|zee5|hotstar|hulu|max|itunes|x264|x265|h264|h265|hevc|avc|aac|ac3|eac3|ddp?|ddp?5[ ._-]*1|dd5[ ._-]*1|dts|truehd|atmos|10bit|8bit|yts|rarbg|galaxyrg|mkvcage|mkvhub|hdhub4u|downloadhub|cinevood|msmod|psa|esub|msubs|subbed|dubbed|dual audio|multi audio|hindi|english|bengali|bangla|tamil|telugu|malayalam|korean|japanese|chinese|org|uncut|unrated|proper|repack|remux|reencoded|re encode|encoded|converted|sample|trailer|e[ ._-]*box|hsbs|half[ ._-]*sbs|3d|6ch|2ch|5[ ._-]*1ch|7[ ._-]*1)\b/ig, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:mb|gb)\b/ig, ' ')
    .replace(/[\[\](){}]/g, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return raw || 'Untitled';
}

function svCanonicalTitleForSearch(value, year = '') {
  let text = svCleanMediaTitle(value || '');
  const y = String(year || svExtractYear(value || '') || '').replace(/[^0-9]/g, '');
  if (y) {
    // Release filenames usually become: Title 2013 1080p x264 ...
    // Keep the title before the release year, but preserve title numbers like Iron Man 3.
    text = text.replace(new RegExp('\\b' + y + '\\b.*$', 'i'), ' ');
  }
  text = text
    .replace(/^\s*\d{1,3}\s*[-–—.]\s*/g, ' ')
    .replace(/\b(?:remastered|extended|unrated|directors?|director'?s?|cut|final|theatrical|imax|open[ ._-]*matte|proper|repack|rerip|remux|internal|limited|complete|collection|converted|reencoded|encoded|recoded|recode|free)\b/ig, ' ')
    .replace(/\b(?:480p|576p|720p|1080p|1440p|2160p|4k|8k|uhd|hdr|hdr10|dv|web|webdl|web-dl|webrip|bluray|brrip|brip|dvdrip|hdrip|hdtv|hdcam|hdtc|camrip|scr|x264|x265|h264|h265|hevc|avc|xvid|divx|aac|ac3|eac3|ddp?|dts|truehd|atmos|10bit|8bit|60fps|30fps|23fps|3d|hsbs|sbs|half[ ._-]*sbs|6ch|2ch|5[ ._-]*1|7[ ._-]*1|dd5|ddp5|bd5|ddn|sdr|hd|us)\b/ig, ' ')
    .replace(/\b(?:yts|yify|rarbg|galaxyrg|mkvcage|mkvhub|mkvc|mkv|hdhub4u|hdhub|downloadhub|cinevood|msmod|psa|tigole|ntg|evo|ctrlhd|shaanig|shaang|mx|ganool|pahe|rmteam|ettv|etrg|sparks|spray|sprite|hon3y|kmhd|torrenta2z)\b/ig, ' ')
    .replace(/\b(?:amzn|nf|netflix|dsnp|disney|zee5|hotstar|hulu|max|itunes|jio|sony|aha|voot|web)\b/ig, ' ')
    .replace(/\b(?:esub|msub|msubs|subs?|subbed|dubbed|dual|multi|audio|org|uncut|uncensored|hdr10plus)\b/ig, ' ')
    .replace(/\b(?:hindi|english|bengali|bangla|tamil|telugu|malayalam|kannada|punjabi|korean|japanese|chinese|french|spanish|russian|turkish|arabic)\b/ig, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:mb|gb)\b/ig, ' ')
    .replace(/[�]+/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Remove release-year leftovers only, not meaningful title numbers.
  if (y) text = text.replace(new RegExp('\\b' + y + '\\b', 'g'), ' ').replace(/\s+/g, ' ').trim();
  return text || svCleanMediaTitle(value || 'Untitled');
}

function svIsNoisyMassiveTitle(title, source='') {
  const text = String(title || '');
  const raw = String(source || '');
  const norm = svNormalizeSearchText(text);
  if (!norm || norm.length < 3) return true;
  if (/\uFFFD|�/.test(text) || /\uFFFD|�/.test(raw)) return true;
  if (/\bidx\b|\bidx\s*m\b|�|���/i.test(text) || /\bidx\b|\bidx\s*m\b|�|���/i.test(raw)) return true;
  if (/^[0-9\s]+$/.test(norm)) return true;
  if (/^[a-f0-9]{10,}/i.test(norm.replace(/\s+/g, ''))) return true;
  const tokens = norm.split(' ').filter(Boolean);
  if (tokens.length <= 1 && norm.length < 5) return true;
  return false;
}

function svExtractYear(value) {
  const text = svSafeDecode(value || '');
  const m = text.match(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/);
  return m ? m[1] : '';
}

function svStableId(prefix, value) {
  return `${prefix}_${crypto.createHash('md5').update(String(value || '')).digest('hex').slice(0, 12)}`;
}

function svLooksLikeSeries(value) {
  const v = svSafeDecode(value || '').toLowerCase();
  return /\bs\d{1,2}e\d{1,3}\b|\bseason[ ._-]*\d{1,2}\b|\bepisode[ ._-]*\d{1,3}\b|tv[ ._-]*series|web[ ._-]*series|korean tv|anime & cartoon tv/.test(v);
}

function svParseEpisode(value) {
  const v = svSafeDecode(value || '');
  const se = v.match(/S(\d{1,2})\s*E(\d{1,3})/i);
  if (se) return { season: Number(se[1]) || 1, episode: Number(se[2]) || 1 };
  const season = v.match(/Season[ ._-]*(\d{1,2})/i);
  const ep = v.match(/Episode[ ._-]*(\d{1,3})|\bEp[ ._-]*(\d{1,3})/i);
  return { season: season ? Number(season[1]) || 1 : 1, episode: ep ? Number(ep[1] || ep[2]) || 1 : 1 };
}

function svBaseShowTitle(value) {
  return svCleanMediaTitle(value)
    .replace(/\bS\d{1,2}E\d{1,3}\b/ig, ' ')
    .replace(/\bSeason\s*\d{1,2}\b/ig, ' ')
    .replace(/\bEpisode\s*\d{1,3}\b/ig, ' ')
    .replace(/\bEp\s*\d{1,3}\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadMassiveCatalog() {
  if (_massiveCatalogLoaded) return;
  _massiveCatalogLoaded = true;
  if (!fs.existsSync(MASSIVE_CATALOG_FILE)) {
    console.warn('⚠ Massive catalog not found:', MASSIVE_CATALOG_FILE);
    return;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(MASSIVE_CATALOG_FILE, 'utf8'));
    const movieSeen = new Set();
    const seriesMap = new Map();

    for (const item of Array.isArray(raw) ? raw : []) {
      const url = String(item.url || item.streamUrl || '').trim();
      if (!/^https?:\/\//i.test(url)) continue;
      if (!/\.(mp4|mkv|avi|mov|webm|m3u8|ts|flv|wmv|mpg|mpeg)(?:$|[?#])/i.test(url)) continue;
      const year = svExtractYear(item.title || url);

      if (svLooksLikeSeries(item.title || url)) {
        const showName = svCanonicalTitleForSearch(svBaseShowTitle(item.title || url), year);
        if (svIsNoisyMassiveTitle(showName, item.title || url)) continue;
        const key = `${showName.toLowerCase()}|${year}`;
        const ep = svParseEpisode(item.title || url);
        if (!seriesMap.has(key)) {
          seriesMap.set(key, {
            id: svStableId('sv_series', key),
            name: showName,
            title: showName,
            year,
            poster: null,
            backdrop: null,
            rating: null,
            genre: '',
            type: 'series',
            isFtp: true,
            isMassiveCatalog: true,
            seasons: {}
          });
        }
        const show = seriesMap.get(key);
        if (!show.seasons[ep.season]) show.seasons[ep.season] = [];
        show.seasons[ep.season].push({
          streamId: null,
          episode: ep.episode,
          epTitle: `Episode ${ep.episode}`,
          file: svSafeDecode(url).split('/').pop() || '',
          streamUrl: url,
          isFtp: true,
          isMassiveCatalog: true
        });
        continue;
      }

      const title = svCanonicalTitleForSearch(item.title || url, year);
      if (svIsNoisyMassiveTitle(title, item.title || url)) continue;
      const dedupeKey = `${title.toLowerCase()}|${year}`;
      if (movieSeen.has(dedupeKey)) continue;
      movieSeen.add(dedupeKey);
      _massiveMovies.push({
        id: svStableId('sv_clean', url),
        name: title,
        title,
        file: svSafeDecode(url).split('/').pop() || '',
        poster: null,
        backdrop: null,
        tmdbId: null,
        year,
        rating: null,
        type: 'movie',
        genre: '',
        category: 'Massive Catalog',
        streamUrl: url,
        isFtp: true,
        isMassiveCatalog: true
      });
    }

    _massiveSeries = [...seriesMap.values()].map(show => {
      for (const eps of Object.values(show.seasons)) eps.sort((a, b) => a.episode - b.episode);
      return show;
    });
    console.log(`📚 Massive clean catalog loaded: ${_massiveMovies.length} movies, ${_massiveSeries.length} series`);
  } catch (e) {
    console.warn('⚠ Could not load massive clean catalog:', e.message);
    _massiveMovies = [];
    _massiveSeries = [];
  }
}


let _svPosterBridge = null;
function svPosterBridgeKey(name, year='') {
  const clean = svNormalizeSearchText(svCanonicalTitleForSearch(name || '', year));
  if (!clean) return '';
  return `${clean}|${String(year || '').replace(/[^0-9]/g, '')}`;
}
function svBuildPosterBridge() {
  if (_svPosterBridge) return _svPosterBridge;
  const map = new Map();
  const add = (item, kind='movie') => {
    if (!item) return;
    const poster = item.poster || item.backdrop;
    if (!poster) return;
    const name = item.name || item.title || item.filename || item.file || '';
    const year = item.year || svExtractYear(name);
    const data = {
      name: item.name || item.title || name,
      poster: item.poster || null,
      backdrop: item.backdrop || item.poster || null,
      rating: item.rating || null,
      genre: item.genre || '',
      overview: item.overview || '',
      tmdbId: item.tmdbId || null,
      year,
      type: kind
    };
    const exactKey = svPosterBridgeKey(name, year);
    const looseKey = svPosterBridgeKey(name, '');
    if (exactKey && (!map.has(exactKey) || (!map.get(exactKey).poster && data.poster))) map.set(exactKey, data);
    if (looseKey && (!map.has(looseKey) || (!map.get(looseKey).poster && data.poster))) map.set(looseKey, data);
  };
  try { (_movieList || buildMovieListSync()).forEach(m => add(m, 'movie')); } catch {}
  try { getCachedMovies().forEach(m => add({ ...m, name:m.title || m.name }, 'movie')); } catch {}
  try { (_seriesList || buildSeriesListSync()).forEach(s => add(s, 'series')); } catch {}
  try { getCachedSeries().forEach(s => add({ ...s, name:s.title || s.name }, 'series')); } catch {}
  _svPosterBridge = map;
  console.log(`🖼️ Search poster bridge ready: ${map.size.toLocaleString()} keys`);
  return map;
}
function svHydrateMassiveSearchItem(item, kind='movie') {
  if (!item || item.poster || item.backdrop) return item;
  const bridge = svBuildPosterBridge();
  const name = item.name || item.title || '';
  const hit = bridge.get(svPosterBridgeKey(name, item.year)) || bridge.get(svPosterBridgeKey(name, ''));
  if (!hit) return item;
  item.poster = item.poster || hit.poster || null;
  item.backdrop = item.backdrop || hit.backdrop || item.poster || null;
  item.rating = item.rating || hit.rating || null;
  item.genre = item.genre || hit.genre || '';
  item.overview = item.overview || hit.overview || '';
  item.tmdbId = item.tmdbId || hit.tmdbId || null;
  if (hit.name && svNormalizeSearchText(hit.name) === svNormalizeSearchText(name)) {
    item.name = item.title = hit.name;
  }
  return item;
}
function svSearchResultDedupeKey(entry) {
  const item = entry.item || {};
  const year = String(item.year || '').replace(/[^0-9]/g, '');
  const name = svNormalizeSearchText(svCanonicalTitleForSearch(item.name || item.title || item.file || '', year));
  return `${entry.kind}|${name}|${year}`;
}
function svSearchHasArt(item) {
  return !!(item && (item.poster || item.backdrop));
}

function svShouldDropSearchResult(entry, score, terms, queryNorm) {
  const item = entry.item || {};
  if (svIsNoisyMassiveTitle(item.name || item.title || '', item.file || item.streamUrl || '')) return true;
  if (!item.isMassiveCatalog) return false;
  const phrase = queryNorm || terms.join(' ');
  const name = entry.name || '';
  const nameTokens = entry.nameTokens || [];
  const exactHits = terms.filter(t => nameTokens.includes(t)).length;
  const phraseHit = phrase && (name === phrase || name.startsWith(phrase + ' ') || name.includes(' ' + phrase + ' '));
  // Massive no-art entries must be very clearly relevant. Display caps are applied later.
  if (!svSearchHasArt(item) && !phraseHit && exactHits < terms.length) return true;
  return false;
}


const SV_SEARCH_STOPWORDS = new Set(['in','on','of','to','a','an','the','and','or','for','with','by','from']);
const SV_SEARCH_CACHE_LIMIT = Number(process.env.SV_SEARCH_CACHE_LIMIT || 160);
const SV_SEARCH_CANDIDATE_LIMIT = Number(process.env.SV_SEARCH_CANDIDATE_LIMIT || 6000);
const _svQueryResultCache = new Map();
let _svFastSearchIndex = null;
let _svFastSearchIndexStamp = '';

function svNormalizeSearchText(value) {
  return svSafeDecode(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function svSearchTokensFromText(value) {
  const norm = svNormalizeSearchText(value);
  if (!norm) return [];
  const out = [];
  const seen = new Set();
  for (const token of norm.split(' ')) {
    if (!token || token.length < 2 || SV_SEARCH_STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function svPrepareSearchItem(item) {
  if (!item || item._svSearchPrepared) return item;
  const name = item.name || item.title || item.file || item.filename || '';
  const file = item.file || item.filename || item.streamUrl || '';
  const year = item.year || svExtractYear(name || file);
  const canonical = svCanonicalTitleForSearch(name, year);
  const fields = [
    canonical,
    name,
    item.title,
    file,
    item.overview,
    item.genre,
    item.language,
    year,
    item.category,
    item.server
  ].filter(Boolean).join(' ');
  item._svNameNorm = svNormalizeSearchText(canonical || name);
  item._svDisplayNameNorm = svNormalizeSearchText(name);
  item._svFileNorm = svNormalizeSearchText(file);
  item._svSearchNorm = svNormalizeSearchText(fields);
  item._svNameTokens = svSearchTokensFromText(canonical || name);
  item._svSearchTokens = svSearchTokensFromText(fields);
  item._svSearchPrepared = true;
  return item;
}

function svEditDistanceCapped(a, b, maxDistance) {
  if (a === b) return 0;
  if (!a || !b) return maxDistance + 1;
  const al = a.length, bl = b.length;
  if (Math.abs(al - bl) > maxDistance) return maxDistance + 1;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[bl];
}

function svMaxFuzzyDistance(term) {
  if (term.length >= 8) return 2;
  if (term.length >= 5) return 1;
  return 0;
}

function svTokenMatchScore(term, token) {
  if (!term || !token) return 0;
  if (token === term) return 220;
  if (token.startsWith(term)) return 145;
  if (term.length >= 4 && token.includes(term)) return 90;
  const max = svMaxFuzzyDistance(term);
  if (!max) return 0;
  if (Math.abs(token.length - term.length) > max) return 0;
  const d = svEditDistanceCapped(term, token, max);
  return d <= max ? (d === 1 ? 115 : 70) : 0;
}

function svTermBestScore(term, tokens) {
  let best = 0;
  for (const token of tokens || []) {
    const score = svTokenMatchScore(term, token);
    if (score > best) best = score;
    if (best >= 220) break;
  }
  return best;
}

function svSearchTerms(reqOrQuery) {
  const raw = typeof reqOrQuery === 'string' ? reqOrQuery : String(reqOrQuery?.query?.q || '');
  return svSearchTokensFromText(raw).slice(0, 8);
}

function svPushIndex(map, token, idx) {
  if (!token) return;
  let arr = map.get(token);
  if (!arr) map.set(token, arr = []);
  arr.push(idx);
}

function svAddPrefix(prefixMap, token) {
  if (!token || token.length < 2) return;
  const p2 = token.slice(0, 2);
  let arr = prefixMap.get(p2);
  if (!arr) prefixMap.set(p2, arr = []);
  arr.push(token);
}

function svMakeSearchEntry(item, kind) {
  svPrepareSearchItem(item);
  return {
    item,
    kind,
    name: item._svNameNorm || '',
    file: item._svFileNorm || '',
    search: item._svSearchNorm || '',
    nameTokens: item._svNameTokens || [],
    searchTokens: item._svSearchTokens || []
  };
}

function svBuildFastSearchIndex() {
  loadMassiveCatalog();
  const localMovies = (_movieList || buildMovieListSync()).filter(m => !isCartoonOrAnime(m));
  const ftpMovies = getCachedMovies().filter(m => !isCartoonOrAnime(m)).map((m, i) => ({
    id:`ftp_${i}`, name:m.title, title:m.title, file:m.filename || '', poster:m.poster || null,
    backdrop:m.backdrop || m.poster || null, tmdbId:m.tmdbId || null, year:m.year || '', rating:m.rating || null,
    type:'movie', genre:m.genre || '', category:m.category || '', streamUrl:m.streamUrl, isFtp:true
  }));
  const localSeries = (_seriesList || buildSeriesListSync()).filter(s => !isCartoonOrAnime(s)).map(s => ({ ...s, _isSeries:true, type:s.type || 'series' }));
  const ftpSeries = getCachedSeries().filter(s => !isCartoonOrAnime(s)).map((s, i) => ({
    id:`ftp_series_${i}`, name:s.title, title:s.title, file:s.title || '', poster:s.poster || null,
    backdrop:s.backdrop || s.poster || null, tmdbId:s.tmdbId || null, year:s.year || '', rating:s.rating || null,
    type:'series', genre:s.genre || '', category:s.category || 'Series', seasons:s.seasons || [], isFtp:true, _isSeries:true
  }));
  for (const s of _massiveSeries) { s._isSeries = true; s.type = 'series'; }

  const seen = new Set();
  const entries = [];
  function add(item, kind) {
    const key = `${kind}|${String(item.name || item.title || '').toLowerCase()}|${item.year || ''}|${item.streamUrl || item.id || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(svMakeSearchEntry(item, kind));
  }
  localMovies.forEach(m => add(m, 'movie'));
  ftpMovies.forEach(m => add(m, 'movie'));
  _massiveMovies.forEach(m => add(svHydrateMassiveSearchItem(m, 'movie'), 'movie'));
  localSeries.forEach(s => add(s, 'series'));
  ftpSeries.forEach(s => add(s, 'series'));
  _massiveSeries.forEach(s => add(svHydrateMassiveSearchItem(s, 'series'), 'series'));

  const tokenMap = new Map();
  const nameTokenMap = new Map();
  const prefixMap = new Map();
  const tokenSeen = new Set();

  entries.forEach((entry, idx) => {
    const itemTokens = new Set(entry.searchTokens);
    for (const token of itemTokens) {
      svPushIndex(tokenMap, token, idx);
      if (!tokenSeen.has(token)) { tokenSeen.add(token); svAddPrefix(prefixMap, token); }
    }
    for (const token of new Set(entry.nameTokens)) svPushIndex(nameTokenMap, token, idx);
  });

  _svFastSearchIndex = {
    entries,
    tokenMap,
    nameTokenMap,
    prefixMap,
    tokens: [...tokenSeen],
    createdAt: Date.now()
  };
  _svFastSearchIndexStamp = `${entries.length}:${_massiveMovies.length}:${_massiveSeries.length}`;
  console.log(`⚡ Fast search index ready: ${entries.length.toLocaleString()} items, ${tokenSeen.size.toLocaleString()} tokens`);
  return _svFastSearchIndex;
}

function svGetFastSearchIndex() {
  const stamp = `${(_movieList || []).length}:${(_seriesList || []).length}:${_massiveMovies.length}:${_massiveSeries.length}`;
  if (!_svFastSearchIndex || !_svFastSearchIndexStamp.includes(`${_massiveMovies.length}:${_massiveSeries.length}`)) {
    return svBuildFastSearchIndex();
  }
  return _svFastSearchIndex;
}

function svArrayUnionInto(set, arr, hardLimit) {
  if (!arr) return;
  for (let i = 0; i < arr.length; i++) {
    set.add(arr[i]);
    if (set.size >= hardLimit) return;
  }
}

function svIntersectArrays(a, b, hardLimit) {
  if (!a || !b) return [];
  const small = a.length <= b.length ? a : b;
  const bigSet = new Set(a.length <= b.length ? b : a);
  const out = [];
  for (const x of small) {
    if (bigSet.has(x)) out.push(x);
    if (out.length >= hardLimit) break;
  }
  return out;
}

function svMatchingTokens(index, term) {
  const exact = index.tokenMap.get(term);
  if (exact) return [term];
  const matches = [];
  const bucket = index.prefixMap.get(term.slice(0, 2)) || [];
  const max = svMaxFuzzyDistance(term);
  for (const token of bucket) {
    if (token === term || token.startsWith(term) || (term.length >= 4 && token.includes(term))) {
      matches.push(token);
    } else if (max && Math.abs(token.length - term.length) <= max && svEditDistanceCapped(term, token, max) <= max) {
      matches.push(token);
    }
    if (matches.length >= 80) break;
  }
  return matches;
}

function svCandidateIndexes(index, terms, kind) {
  const hardLimit = SV_SEARCH_CANDIDATE_LIMIT;
  const perTermLists = [];
  for (const term of terms) {
    const tokens = svMatchingTokens(index, term);
    const termSet = new Set();
    for (const token of tokens) {
      svArrayUnionInto(termSet, index.nameTokenMap.get(token), hardLimit);
      svArrayUnionInto(termSet, index.tokenMap.get(token), hardLimit);
      if (termSet.size >= hardLimit) break;
    }
    if (!termSet.size) return [];
    perTermLists.push([...termSet]);
  }
  perTermLists.sort((a, b) => a.length - b.length);
  let candidates = perTermLists[0] || [];
  for (let i = 1; i < perTermLists.length; i++) {
    candidates = svIntersectArrays(candidates, perTermLists[i], hardLimit);
    if (!candidates.length) break;
  }
  if (kind === 'movie') candidates = candidates.filter(i => index.entries[i]?.kind === 'movie');
  if (kind === 'series') candidates = candidates.filter(i => index.entries[i]?.kind === 'series');
  return candidates.slice(0, hardLimit);
}

function svSearchScoreEntry(entry, terms, queryNorm) {
  const item = entry.item;
  const name = entry.name || '';
  const file = entry.file || '';
  const search = entry.search || '';
  const nameTokens = entry.nameTokens || [];
  const allTokens = entry.searchTokens || [];
  if (!terms.length) return 1;

  let score = 0;
  const phrase = queryNorm || terms.join(' ');

  if (phrase && name === phrase) score += 9000;
  else if (phrase && name.startsWith(phrase + ' ')) score += 7600;
  else if (phrase && name.includes(' ' + phrase + ' ')) score += 6500;
  else if (phrase && name.includes(phrase)) score += 5400;
  else if (phrase && file.includes(phrase)) score += 1300;

  let allMatched = true;
  let nameHits = 0;
  let exactNameHits = 0;
  for (const term of terms) {
    const nameScore = svTermBestScore(term, nameTokens);
    const textScore = nameScore || svTermBestScore(term, allTokens);
    if (!textScore) {
      if (search.includes(term)) score += 30;
      else { allMatched = false; break; }
    } else {
      score += textScore;
      if (nameScore) nameHits++;
      if (nameTokens.includes(term)) exactNameHits++;
    }
  }
  if (!allMatched) return -1;

  if (nameHits === terms.length) score += 2200;
  if (exactNameHits === terms.length) score += 2400;
  if (terms.length > 1 && phrase && name.split(' ').slice(0, terms.length).join(' ') === phrase) score += 1800;

  // Strongly prefer exact title matches like "Iron Man" over "Iron Sky" / random filename hits.
  if (terms.length > 1 && nameTokens.length >= terms.length) {
    const firstTokens = nameTokens.slice(0, terms.length).join(' ');
    if (firstTokens === phrase) score += 2500;
  }

  if (!item.isMassiveCatalog) score += 260;
  if (item.poster) score += 420;
  if (item.backdrop) score += 90;
  if (item.isMassiveCatalog && !item.poster && !item.backdrop) score -= 850;
  const rating = parseFloat(item.rating || 0);
  if (Number.isFinite(rating) && rating > 0) score += Math.min(75, rating * 7);
  const year = parseInt(String(item.year || '').replace(/[^0-9]/g, ''), 10);
  if (Number.isFinite(year) && year > 1900) score += Math.min(25, Math.max(0, year - 1980) / 2);
  return score;
}

function svSearchCacheKey(req, kind, count) {
  const q = svNormalizeSearchText(req.query.q || '');
  return [kind, q, req.query.genre || '', req.query.lang || '', req.query.yearRange || '', req.query.minRating || '', req.query.publisher || '', req.query.sort || '', req.query.page || '', req.query.limit || '', count].join('|');
}

function svFastSearch(req, kind = 'mixed') {
  const terms = svSearchTerms(req);
  const queryNorm = svNormalizeSearchText(req.query.q || '');
  if (!terms.length) return null;
  const index = svGetFastSearchIndex();
  const cacheKey = svSearchCacheKey(req, kind, index.entries.length);
  const cached = _svQueryResultCache.get(cacheKey);
  if (cached) return cached;

  const candidateIds = svCandidateIndexes(index, terms, kind);
  const scored = [];
  for (const idx of candidateIds) {
    const entry = index.entries[idx];
    if (!entry) continue;
    if (kind === 'movie' && entry.kind !== 'movie') continue;
    if (kind === 'series' && entry.kind !== 'series') continue;
    const score = svSearchScoreEntry(entry, terms, queryNorm);
    if (score > 0 && !svShouldDropSearchResult(entry, score, terms, queryNorm)) scored.push({ entry, item: entry.item, score });
  }
  scored.sort((a, b) => b.score - a.score || String(a.item.name || a.item.title || '').localeCompare(String(b.item.name || b.item.title || '')));

  const result = [];
  const seenTitles = new Set();
  const hasPosterResults = scored.some(row => svSearchHasArt(row.item));
  let noPosterMassive = 0;
  const RESULT_CAP = Number(process.env.SV_SEARCH_RESULT_CAP || 120);
  // If poster-rich results exist, hide blank massive release variants completely.
  // If nothing poster-rich exists, keep a small exact fallback so rare catalog-only files remain findable.
  const NO_POSTER_MASSIVE_CAP = hasPosterResults ? 0 : Number(process.env.SV_SEARCH_NO_POSTER_CAP || 18);
  for (const row of scored) {
    const key = svSearchResultDedupeKey(row.entry);
    if (key && seenTitles.has(key)) continue;
    if (key) seenTitles.add(key);
    if (row.item?.isMassiveCatalog && !svSearchHasArt(row.item)) {
      if (noPosterMassive >= NO_POSTER_MASSIVE_CAP) continue;
      noPosterMassive++;
    }
    result.push(row.item);
    if (result.length >= RESULT_CAP) break;
  }
  _svQueryResultCache.set(cacheKey, result);
  if (_svQueryResultCache.size > SV_SEARCH_CACHE_LIMIT) _svQueryResultCache.delete(_svQueryResultCache.keys().next().value);
  return result;
}

function svSearchScore(item, terms, queryNorm) {
  return svSearchScoreEntry(svMakeSearchEntry(item, (item?._isSeries || item?.type === 'series' || item?.seasons) ? 'series' : 'movie'), terms, queryNorm);
}

function svApplySearch(items, req, kind = 'mixed') {
  const terms = svSearchTerms(req);
  if (!terms.length) return items;
  const fast = svFastSearch(req, kind);
  if (fast) return fast;
  return [];
}

function svFilterPaged(items, req, zeroBased = true, kind = 'mixed') {
  const list = svApplySearch(items, req, kind);
  const limit = Math.min(120, Math.max(1, parseInt(req.query.limit || '72', 10) || 72));
  const rawPage = Math.max(0, parseInt(req.query.page || (zeroBased ? '0' : '1'), 10) || 0);
  const page = zeroBased ? rawPage : Math.max(1, rawPage);
  const start = (zeroBased ? page : page - 1) * limit;
  return { list, page, limit, start, items: list.slice(start, start + limit), pages: Math.ceil(list.length / limit) || 1 };
}
function jsonError(res, status, code, message, details = {}) {
  return res.status(status).json({
    ok: false,
    code,
    error: message,
    ...details,
  });
}

function safeDecodeURIComponent(value) {
  const text = String(value || '');
  try {
    return decodeURIComponent(text.replace(/\+/g, '%20'));
  } catch {
    return text;
  }
}

function rawQueryParam(req, name) {
  const queryIndex = req.originalUrl.indexOf('?');
  if (queryIndex < 0) return null;
  const rawQuery = req.originalUrl.slice(queryIndex + 1);
  const parts = rawQuery.split('&');
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const rawKey = eq >= 0 ? part.slice(0, eq) : part;
    const key = safeDecodeURIComponent(rawKey);
    if (key === name) return eq >= 0 ? part.slice(eq + 1) : '';
  }
  return null;
}

function readRemoteUrlParam(req, names = ['url']) {
  for (const name of names) {
    const raw = rawQueryParam(req, name);
    const value = raw !== null ? raw : req.query[name];
    if (value === undefined || value === null || value === '') continue;
    const requestedUrl = String(value);
    const decodedCandidate = safeDecodeURIComponent(requestedUrl).trim();
    if (!decodedCandidate) continue;

    let parsed;
    try {
      parsed = new URL(decodedCandidate);
    } catch {
      throw Object.assign(new Error('Invalid media URL'), {
        status: 400,
        code: 'INVALID_URL',
        requestedUrl,
        decodedUrl: decodedCandidate,
      });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw Object.assign(new Error('Only HTTP/HTTPS media URLs are supported'), {
        status: 400,
        code: 'UNSUPPORTED_URL_PROTOCOL',
        requestedUrl,
        decodedUrl: decodedCandidate,
      });
    }

    return {
      param: name,
      requestedUrl,
      decodedUrl: parsed.href,
    };
  }

  throw Object.assign(new Error(`Missing ${names.join(' or ')} parameter`), {
    status: 400,
    code: 'MISSING_URL',
  });
}

function normalizeUrlForCompare(value) {
  try {
    return new URL(safeDecodeURIComponent(value)).href;
  } catch {
    return String(value || '').trim();
  }
}

function findCatalogItemByStreamUrl(streamUrl) {
  const target = normalizeUrlForCompare(streamUrl);
  if (!target) return null;

  for (const movie of getCachedMovies()) {
    if (normalizeUrlForCompare(movie.streamUrl) === target) {
      return {
        type: 'movie',
        title: movie.title,
        filename: movie.filename,
        server: movie.server,
        streamUrl: movie.streamUrl,
      };
    }
  }

  for (const show of getCachedSeries()) {
    for (const seasonObj of (show.seasons || [])) {
      for (const episode of (seasonObj.episodes || [])) {
        if (normalizeUrlForCompare(episode.streamUrl) === target) {
          return {
            type: 'episode',
            title: show.title,
            season: seasonObj.season,
            filename: episode.filename,
            server: show.server,
            streamUrl: episode.streamUrl,
          };
        }
      }
    }
  }

  return null;
}

function catalogLogLabel(item) {
  if (!item) return 'none';
  return `${item.type}: ${item.title || item.filename || 'unknown'}`;
}

function remoteFilename(srcUrl) {
  try {
    const parsed = new URL(srcUrl);
    return safeDecodeURIComponent(parsed.pathname.split('/').pop() || srcUrl);
  } catch {
    return String(srcUrl || '').split('/').pop() || 'remote media';
  }
}

function isRemoteDirectPlayable(srcUrl) {
  const clean = String(srcUrl || '').split('?')[0].toLowerCase();
  const compatibleExt = clean.endsWith('.mp4') || clean.endsWith('.m4v');
  const unsupportedCodecHint = /(x265|h265|hevc|10bit|10-bit)/i.test(clean);
  return compatibleExt && !unsupportedCodecHint;
}

function mimeForMediaPath(srcUrl, fallback = 'video/mp4') {
  try {
    const parsed = new URL(srcUrl);
    return MIME[path.extname(parsed.pathname).toLowerCase()] || fallback;
  } catch {
    return MIME[path.extname(String(srcUrl || '').split('?')[0]).toLowerCase()] || fallback;
  }
}

function remotePlayUrls(srcUrl) {
  const encoded = encodeURIComponent(srcUrl);
  const proxyUrl = `/api/ftp/proxy?url=${encoded}`;
  const transcodeUrl = `/api/ftp/stream?url=${encoded}`;
  const directPlayable = isRemoteDirectPlayable(srcUrl);
  return {
    directPlayable,
    proxyUrl,
    transcodeUrl,
    finalPlayUrl: directPlayable ? proxyUrl : transcodeUrl,
  };
}

function remotePlaybackUrls(srcUrl) {
  const encoded = encodeURIComponent(srcUrl);
  const directPlayable = isRemoteDirectPlayable(srcUrl);
  const redirectUrl = `/api/playback/ftp?url=${encoded}&mode=redirect`;
  const proxyUrl = `/api/playback/ftp?url=${encoded}&mode=proxy`;
  const legacyProxyUrl = `/api/ftp/proxy?url=${encoded}`;
  const transcodeUrl = `/api/ftp/stream?url=${encoded}`;
  return {
    directPlayable,
    redirectUrl,
    proxyUrl,
    legacyProxyUrl,
    transcodeUrl,
    finalPlayUrl: redirectUrl,
  };
}

function isTrustedRemotePlaybackUrl(srcUrl, matched) {
  if (matched) return true;
  try {
    const parsed = new URL(srcUrl);
    const host = parsed.hostname.toLowerCase();
    return /^172\.16\.50\.\d{1,3}$/.test(host)
      || /^172\.22\.\d{1,3}\.\d{1,3}$/.test(host)
      || /^server[\w-]*\.ftpbd\.net$/i.test(host);
  } catch {
    return false;
  }
}

function playbackAudioMapFromReq(req) {
  const audioStreamIdx = parseInt(req.query.audioStream ?? '', 10);
  const audioIdx = Math.max(0, parseInt(req.query.audio || '0', 10) || 0);
  return Number.isFinite(audioStreamIdx) && audioStreamIdx >= 0 ? `0:${audioStreamIdx}?` : `0:a:${audioIdx}?`;
}

function playbackStartFromReq(req) {
  return Math.max(0, parseFloat(req.query.start) || 0);
}

function normalizePlaybackMode(value, fallback = 'direct') {
  const mode = String(value || fallback).toLowerCase();
  if (mode === 'proxy' || mode === 'stream') return 'proxy';
  if (mode === 'remux') return 'remux';
  if (mode === 'audio' || mode === 'audio-transcode' || mode === 'audio-copy') return 'audio';
  if (mode === 'hls' || mode === 'transcode') return 'hls';
  if (mode === 'redirect' || mode === 'direct') return 'direct';
  return fallback;
}

function playbackQueryFromReq(req, extra = {}) {
  const params = new URLSearchParams();
  if (req.query.start) params.set('start', String(Math.floor(playbackStartFromReq(req))));
  if (req.query.audio) params.set('audio', String(req.query.audio));
  if (req.query.audioStream) params.set('audioStream', String(req.query.audioStream));
  if (req.query.quality) params.set('quality', String(req.query.quality));
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function remotePlaybackHlsUrl(srcUrl, req) {
  const params = new URLSearchParams();
  params.set('url', srcUrl);
  if (req.query.start) params.set('start', String(Math.floor(playbackStartFromReq(req))));
  if (req.query.audio) params.set('audio', String(req.query.audio));
  if (req.query.audioStream) params.set('audioStream', String(req.query.audioStream));
  if (req.query.quality) params.set('quality', String(req.query.quality));
  if (req.query.client) params.set('client', String(req.query.client));
  return `/api/mobile-hls/ftp/index.m3u8?${params.toString()}`;
}

function remotePlaybackModeUrl(srcUrl, req, mode) {
  const params = new URLSearchParams();
  params.set('url', srcUrl);
  params.set('mode', mode);
  if (req.query.start) params.set('start', String(Math.floor(playbackStartFromReq(req))));
  if (req.query.audio) params.set('audio', String(req.query.audio));
  if (req.query.audioStream) params.set('audioStream', String(req.query.audioStream));
  if (req.query.quality) params.set('quality', String(req.query.quality));
  return `/api/playback/ftp?${params.toString()}`;
}

function localPlaybackHlsUrl(id, req) {
  return `/api/mobile-hls/local/${encodeURIComponent(id)}/index.m3u8${playbackQueryFromReq(req, req.query.client ? { client: req.query.client } : {})}`;
}

function playbackUrlHasUnsupportedVideoHint(srcUrl) {
  return /(x265|h265|hevc|10bit|10-bit|av1|vp9|vp8)/i.test(String(srcUrl || ''));
}

function readTrustedRemotePlaybackMedia(req, res, errorAsJson = true) {
  let media;
  try {
    media = readRemoteUrlParam(req, ['url', 'streamUrl', 'movie', 'movieUrl', 'src']);
  } catch (e) {
    if (errorAsJson) {
      jsonError(res, e.status || 400, e.code || 'INVALID_URL', e.message, {
        requestedUrl: e.requestedUrl,
        decodedUrl: e.decodedUrl,
      });
    } else {
      res.status(e.status || 400).send(e.message);
    }
    return null;
  }

  const srcUrl = media.decodedUrl;
  const matched = findCatalogItemByStreamUrl(srcUrl);
  if (!isTrustedRemotePlaybackUrl(srcUrl, matched)) {
    if (errorAsJson) {
      jsonError(res, 403, 'REMOTE_MEDIA_NOT_ALLOWED', 'Remote media host is not allowed for browser playback', {
        requestedUrl: media.requestedUrl,
        decodedUrl: srcUrl,
        matchedCatalogItem: matched,
      });
    } else {
      res.status(403).send('Remote media host is not allowed for browser playback');
    }
    return null;
  }

  return { media, srcUrl, matched };
}

function remoteVideoCanCopy(srcUrl) {
  const clean = String(srcUrl || '').split('?')[0].toLowerCase();
  const ext = path.extname(clean);
  if (!['.mkv', '.mp4', '.m4v', '.mov'].includes(ext)) return false;
  if (/(x265|h265|hevc|10bit|10-bit|vp9|vp8|av1|xvid|divx)/i.test(clean)) return false;
  return /(x264|h264|avc)/i.test(clean) || ['.mp4', '.m4v', '.mov'].includes(ext);
}

function ffmpegFilterEscape(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function remoteProbe(srcUrl, method, headers, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const parsed = new URL(srcUrl);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request(parsed, { method, headers, timeout: timeoutMs }, probeRes => {
      const result = {
        status: probeRes.statusCode || 0,
        headers: probeRes.headers || {},
      };
      result.ok = (result.status >= 200 && result.status < 400) || result.status === 206;
      settled = true;
      probeRes.destroy();
      resolve(result);
    });

    req.on('error', err => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    req.on('timeout', () => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(new Error('Remote availability check timed out'));
    });
    req.end();
  });
}

async function checkRemoteAvailability(srcUrl, req) {
  const headers = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
    Accept: '*/*',
  };

  let headResult = null;
  try {
    headResult = await remoteProbe(srcUrl, 'HEAD', headers);
    if (headResult.ok) return { ok: true, method: 'HEAD', ...headResult };
  } catch (e) {
    headResult = { status: 0, error: e.message };
  }

  try {
    const getResult = await remoteProbe(srcUrl, 'GET', { ...headers, Range: 'bytes=0-0' });
    if (getResult.ok) return { ok: true, method: 'GET_RANGE', ...getResult };
    return { ok: false, method: 'GET_RANGE', head: headResult, ...getResult };
  } catch (e) {
    return {
      ok: false,
      method: 'GET_RANGE',
      status: headResult?.status || 0,
      head: headResult,
      error: e.message,
    };
  }
}

function remoteSubtitleCandidateUrls(srcUrl) {
  let parsed;
  try { parsed = new URL(srcUrl); } catch { return []; }
  if (!/^https?:$/i.test(parsed.protocol)) return [];
  const ext = path.posix.extname(parsed.pathname);
  if (!ext) return [];
  const basePath = parsed.pathname.slice(0, -ext.length);
  const suffixes = [
    '.en.vtt', '.eng.vtt', '.english.vtt', '.vtt',
    '.en.srt', '.eng.srt', '.english.srt', '.srt',
    '.en.ass', '.eng.ass', '.english.ass', '.ass',
    '.en.ssa', '.eng.ssa', '.english.ssa', '.ssa'
  ];
  const out = [];
  const seen = new Set();
  for (const suffix of suffixes) {
    const next = new URL(parsed.href);
    next.pathname = `${basePath}${suffix}`;
    const href = next.href;
    if (!seen.has(href)) {
      seen.add(href);
      out.push(href);
    }
  }
  return out;
}

function remoteSubtitleLabel(sidecarUrl, index) {
  let file = '';
  try { file = decodeURIComponent(path.posix.basename(new URL(sidecarUrl).pathname)); } catch {}
  const lower = file.toLowerCase();
  if (/\b(eng|english|en)\b/.test(lower) || /\.(eng|english|en)\./i.test(file)) return 'English';
  if (/\b(hin|hindi|hi)\b/.test(lower) || /\.(hin|hindi|hi)\./i.test(file)) return 'Hindi';
  if (/\b(ben|bengali|bangla|bn)\b/.test(lower) || /\.(ben|bengali|bangla|bn)\./i.test(file)) return 'Bengali';
  return file ? file.replace(/\.(srt|vtt|ass|ssa)$/i, '') : `Subtitle ${index + 1}`;
}

async function remoteSubtitleExists(sidecarUrl, req) {
  const headers = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
    Accept: 'text/vtt,text/plain,*/*',
    'Accept-Encoding': 'identity',
  };
  try {
    const head = await remoteProbe(sidecarUrl, 'HEAD', headers, 2500);
    if (head.ok) return true;
    if (![403, 405].includes(head.status)) return false;
  } catch {}
  try {
    const get = await remoteProbe(sidecarUrl, 'GET', { ...headers, Range: 'bytes=0-511' }, 2500);
    return !!get.ok;
  } catch {
    return false;
  }
}

async function discoverRemoteSubtitleTracks(srcUrl, req) {
  const candidates = remoteSubtitleCandidateUrls(srcUrl).slice(0, 16);
  if (!candidates.length) return [];
  const checks = await Promise.all(candidates.map(async (candidate, index) => {
    const ok = await remoteSubtitleExists(candidate, req);
    if (!ok) return null;
    const ext = path.posix.extname(new URL(candidate).pathname).toLowerCase();
    return {
      index,
      label: remoteSubtitleLabel(candidate, index),
      lang: /\.en(?:g|glish)?\./i.test(candidate) ? 'en' : '',
      src: candidate,
      ext,
      sidecar: true
    };
  }));
  return checks.filter(Boolean).slice(0, 8);
}

function isAllowedRemoteSubtitleSidecar(srcUrl, sidecarUrl) {
  const candidates = new Set(remoteSubtitleCandidateUrls(srcUrl));
  return candidates.has(sidecarUrl);
}

function fetchRemoteText(url, req, maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const chunks = [];
    let total = 0;
    const upstream = mod.request(parsed, {
      method: 'GET',
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        Accept: 'text/vtt,text/plain,*/*',
        'Accept-Encoding': 'identity',
      },
      timeout: 15000,
    }, upstreamRes => {
      const status = upstreamRes.statusCode || 0;
      if (status < 200 || status >= 400) {
        upstreamRes.resume();
        reject(new Error(`subtitle request failed ${status}`));
        return;
      }
      upstreamRes.on('data', chunk => {
        total += chunk.length;
        if (total > maxBytes) {
          upstream.destroy(new Error('subtitle too large'));
          return;
        }
        chunks.push(chunk);
      });
      upstreamRes.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    upstream.on('error', reject);
    upstream.on('timeout', () => upstream.destroy(new Error('subtitle request timed out')));
    req.on('close', () => upstream.destroy());
    upstream.end();
  });
}

async function sendRemoteSidecarSubtitleAsVtt(req, res, srcUrl, sidecarUrl) {
  if (!isAllowedRemoteSubtitleSidecar(srcUrl, sidecarUrl)) {
    return jsonError(res, 403, 'REMOTE_SUBTITLE_NOT_ALLOWED', 'Remote subtitle path is not allowed');
  }
  try {
    const raw = await fetchRemoteText(sidecarUrl, req);
    const ext = path.posix.extname(new URL(sidecarUrl).pathname).toLowerCase();
    let body = raw;
    if (ext === '.srt') body = srtToVtt(raw);
    else if (ext === '.ass' || ext === '.ssa') body = assToVtt(raw);
    else if (!/^WEBVTT\b/i.test(body.trim())) body = `WEBVTT\n\n${body}`;
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(body);
  } catch (e) {
    console.error('[FTP Sidecar Subtitle] Error:', e.message);
    if (!res.headersSent) res.status(502).send('WEBVTT\n\n');
  }
}

function saveCache()   { try { fs.writeFileSync(CACHE_FILE,   JSON.stringify(posterCache,  null, 2)); } catch {} }
function saveHistory() { try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(watchHistory, null, 2)); } catch {} }

// ── Helpers ───────────────────────────────────────────────────────────────────
function cleanTitle(filename) {
  let name = path.basename(filename, path.extname(filename));
  name = name.replace(/[\._]+/g, ' ').trim();
  name = name
    .replace(/\b(1080p|720p|480p|4k|2160p|uhd|bluray|blu[\s-]?ray|webrip|web[\s-]?dl|hdtv|x264|x265|hevc|aac|dts|extended|remastered|director.?s?.?cut|proper|repack|hdr|dolby|atmos)\b.*/i, '')
    .replace(/[\(\[\{][^\)\]\}]{0,50}[\)\]\}]?/g, '')
    .replace(/\s*-\s*/g, ' ')
    .replace(/[,\.\-\(\[\{]+$/, '')
    .trim();
  const yearStripped = name.replace(/\s+((?:19|20)\d{2})\s*$/, '').trim();
  if (yearStripped.length >= 2) name = yearStripped;
  return name;
}

function parseSeriesFilename(filename) {
  const parts   = filename.replace(/\\/g, '/').split('/');
  const base     = path.basename(filename, path.extname(filename));
  const parentDir = parts.length >= 2 ? parts[parts.length - 2] : '';

  let clean = base.replace(/[\._]+/g, ' ').trim();
  clean = clean.replace(/[\[\(][^\]\)]*[\]\)]/g, ' ').replace(/\s+/g, ' ').trim();
  clean = clean.replace(/\b(\d{3,4}p|BluRay|BRRip|WEBRip|WEB[\s-]?DL|HDTV|NF|AMZN|DSNP|HMAX|x264|x265|HEVC|AAC|DTS|AC3|MSubs|ESub|Dual|Hindi|English|Multi|Pahe|in|mkv|mp4)\b.*/i, '').trim();

  let m;

  m = clean.match(/^(.+?)\s+[Ss](\d{1,2})[Ee](\d{1,3})\b\s*(.*)/);
  if (m) {
    let epTitle = m[4]
      .replace(/\b\d{3,4}p\b.*/i, '')
      .replace(/\b(BluRay|BRRip|WEBRip|WEB[\s-]?DL|HDTV|NF|AMZN|DSNP|HMAX|x264|x265|HEVC|AAC|DTS|AC3|MSubs|ESub|Dual|Hindi|English|Multi|Pahe)\b.*/i, '')
      .trim();
    if (!epTitle && parentDir) {
      const folderClean = parentDir.replace(/[\._]+/g,' ').replace(/[\[\(][^\]\)]*[\]\)]/g,'').trim();
      const folderM = folderClean.match(/[Ss]\d{1,2}[Ee]\d{1,3}\s*(.*)/);
      if (folderM) epTitle = folderM[1].replace(/\b\d{3,4}p\b.*/i,'').trim();
    }
    return { showName: m[1].trim(), season: parseInt(m[2], 10), episode: parseInt(m[3], 10), epTitle };
  }

  m = clean.match(/^(.+?)\s+(\d{1,2})x(\d{1,3})\b\s*(.*)/i);
  if (m) return {
    showName: m[1].trim(),
    season: parseInt(m[2], 10),
    episode: parseInt(m[3], 10),
    epTitle: m[4].trim()
  };

  m = clean.match(/^(.+?)\s+[Ss]eason\s*(\d+)\s+[Ee]pisode\s*(\d+)\s*(.*)/i);
  if (m) return {
    showName: m[1].trim(),
    season: parseInt(m[2], 10),
    episode: parseInt(m[3], 10),
    epTitle: m[4].trim()
  };

  m = clean.match(/^(.+?)\s+[Ee](\d{1,3})\b\s*(.*)/);
  if (m) {
    let epTitle = m[3].replace(/\b(720p|1080p|BluRay|WEBRip|x264|x265|HEVC|AAC|NF|AMZN|KOR|ENG|JPN)\b.*/i, '').trim();
    return {
      showName: m[1].trim(),
      season:   1,
      episode:  parseInt(m[2], 10),
      epTitle,
    };
  }

  return null;
}

// ── TMDB rate-limited queue ───────────────────────────────────────────────────
const tmdbQueue = [];
let tmdbBusy = false;

function omdbEnqueue(query, type) {
  return new Promise(resolve => {
    tmdbQueue.push({ query, type, resolve });
    if (!tmdbBusy) processTmdbQueue();
  });
}
function processTmdbQueue() {
  if (!tmdbQueue.length) { tmdbBusy = false; return; }
  tmdbBusy = true;
  const { query, type, resolve } = tmdbQueue.shift();
  fetchTMDB(query, type).then(result => { resolve(result); setTimeout(processTmdbQueue, 150); });
}

function httpsGetAuth(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${TMDB_TOKEN}`, Accept: 'application/json' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchTMDB(query, type = '') {
  try {
    const isSeries = type === 'series';
    const endpoint = isSeries ? 'search/tv' : 'search/movie';

    const yearMatch = query.match(/\b((?:19|20)\d{2})\s*$/);
    const cleanQ    = yearMatch ? query.slice(0, -yearMatch[0].length).trim() : query;
    const yearParam = yearMatch ? `&year=${yearMatch[1]}` : '';

    const searchUrl = `https://api.themoviedb.org/3/${endpoint}?query=${encodeURIComponent(cleanQ)}${yearParam}&include_adult=false`;
    const raw = await httpsGetAuth(searchUrl);
    const j   = JSON.parse(raw);

    if (!j.results || !j.results.length) return null;

    const result = j.results.find(r => r.poster_path) || j.results[0];
    if (!result) return null;

    const poster   = result.poster_path   ? `${TMDB_IMG}/w500${result.poster_path}`    : null;
    const backdrop = result.backdrop_path ? `${TMDB_IMG}/w1280${result.backdrop_path}` : null;
    if (!poster) return null;

    const year    = (result.release_date || result.first_air_date || '').slice(0, 4);
    const rating  = result.vote_average ? result.vote_average.toFixed(1) : null;
    const genreIds= result.genre_ids || [];
    const genre   = genreIds.slice(0,3).map(id => TMDB_GENRES[id]).filter(Boolean).join(', ');

    let runtime = '', director = '';
    let language = result.original_language ? result.original_language.toUpperCase() : '';
    let productionCompanies = [];

    try {
      const detailUrl = `https://api.themoviedb.org/3/${isSeries ? 'tv' : 'movie'}/${result.id}${isSeries ? '' : '?append_to_response=credits'}`;
      const detailRaw = await httpsGetAuth(detailUrl);
      const detail    = JSON.parse(detailRaw);
      if (!isSeries && detail.runtime) runtime = `${detail.runtime} min`;
      if (!isSeries && detail.credits) {
        const dir = detail.credits.crew && detail.credits.crew.find(c => c.job === 'Director');
        if (dir) director = dir.name;
      }
      if (detail.spoken_languages && detail.spoken_languages.length) {
        language = detail.spoken_languages.map(l => l.english_name).slice(0,3).join(', ');
      }
      if (detail.production_companies) {
        productionCompanies = detail.production_companies.map(c => c.name);
      }
    } catch {}

    return {
      tmdbId: result.id,
      poster, backdrop, overview: result.overview || '',
      year, rating, type: isSeries ? 'tv' : 'movie',
      genre, runtime, director, language,
      productionCompanies
    };
  } catch { return null; }
}

async function getPosterInfo(filename, type = '') {
  const key = path.basename(filename, path.extname(filename));
  if (posterCache[key]) return posterCache[key];
  const info = await omdbEnqueue(cleanTitle(filename), type);
  if (info) { posterCache[key] = info; saveCache(); }
  return info;
}

// ── Subtitle discovery ────────────────────────────────────────────────────────
function findSubtitleTracks(dir, videoFile) {
  const base = path.basename(videoFile, path.extname(videoFile)).toLowerCase();
  const tracks = [];
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { return tracks; }
  for (const f of entries) {
    const ext = path.extname(f).toLowerCase();
    if (!SUB_EXTS.includes(ext)) continue;
    const fname = path.basename(f, ext).toLowerCase();
    if (!fname.startsWith(base)) continue;
    const suffix = fname.slice(base.length).replace(/^[\._\-\s]+/, '');
    tracks.push({ label: suffix ? suffix.charAt(0).toUpperCase() + suffix.slice(1) : 'Default', lang: suffix.slice(0, 2) || 'en', ext, filePath: path.join(dir, f) });
  }
  return tracks;
}

// ── Build file index ──────────────────────────────────────────────────────────
function buildFileIndex() {
  fileIndex = [];
  let movieFiles = [];
  try { movieFiles = fs.readdirSync(MOVIES_DIR).filter(f => VIDEO_EXTS.includes(path.extname(f).toLowerCase())); } catch (e) { console.warn('⚠ Cannot read MOVIES_DIR:', e.message); }
  for (const f of movieFiles) fileIndex.push({ dir: MOVIES_DIR, file: f, type: 'movie' });
  console.log(`📁 Indexed ${movieFiles.length} movie files`);

  let seriesFiles = [];
  try { seriesFiles = fs.readdirSync(SERIES_DIR).filter(f => VIDEO_EXTS.includes(path.extname(f).toLowerCase())); } catch (e) { console.warn('⚠ Cannot read SERIES_DIR:', e.message); }
  for (const f of seriesFiles) fileIndex.push({ dir: SERIES_DIR, file: f, type: 'episode' });
  console.log(`📺 Indexed ${seriesFiles.length} series episode files`);
  console.log(`✅ Total stream IDs: ${fileIndex.length}`);
}
function entryPath(entry) { return path.join(entry.dir, entry.file); }

// ── Build instant movie list (sync — reads only from posterCache) ──────────────
function buildMovieListSync() {
  const list = [];
  for (let id = 0; id < fileIndex.length; id++) {
    const entry = fileIndex[id];
    if (entry.type !== 'movie') continue;
    const name = cleanTitle(entry.file);
    if (!name) continue;
    const key  = path.basename(entry.file, path.extname(entry.file));
    const info = posterCache[key] || null;
    list.push({
      id,
      name,
      file:     entry.file,
      poster:   info?.poster   || null,
      tmdbId:   info?.tmdbId   || null,
      overview: info?.overview || '',
      year:     info?.year     || '',
      rating:   info?.rating   || null,
      type:     'movie',
      genre:    info?.genre    || '',
      runtime:  info?.runtime  || '',
      director: info?.director || '',
      language: info?.language || '',
      productionCompanies: info?.productionCompanies || [],
    });
  }
  return list;
}

// ── Build instant series list (sync — reads only from posterCache) ────────────
function buildSeriesListSync() {
  const showMap = {};
  for (let id = 0; id < fileIndex.length; id++) {
    const entry = fileIndex[id];
    if (entry.type !== 'episode') continue;
    const parsed = parseSeriesFilename(entry.file);
    if (!parsed) continue;
    const { showName, season, episode, epTitle } = parsed;
    if (!showMap[showName]) showMap[showName] = { name: showName, seasons: {} };
    if (!showMap[showName].seasons[season]) showMap[showName].seasons[season] = [];
    showMap[showName].seasons[season].push({
      streamId: id,
      episode,
      epTitle:  epTitle || `Episode ${episode}`,
      file:     entry.file,
    });
  }
  for (const show of Object.values(showMap))
    for (const eps of Object.values(show.seasons))
      eps.sort((a, b) => a.episode - b.episode);

  return Object.values(showMap).map(show => {
    const key  = '__series__' + show.name;
    const info = posterCache[key] || null;
    if (info) Object.assign(show, {
      poster:   info.poster,
      tmdbId:   info.tmdbId || show.tmdbId || null,
      overview: info.overview,
      year:     info.year,
      rating:   info.rating,
      genre:    info.genre,
      language: info.language,
      productionCompanies: info.productionCompanies || [],
    });
    return show;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// ── Called once at startup — builds both lists in milliseconds ────────────────
function buildInstantLists() {
  _movieList  = buildMovieListSync();
  _seriesList = buildSeriesListSync();
  console.log(`⚡ Instant lists ready: ${_movieList.length} movies, ${_seriesList.length} series (${ 
    _movieList.filter(m => m.poster).length } movies with posters, ${ 
    _seriesList.filter(s => s.poster).length } series with posters)`);
}

// ── Background TMDB enrichment — runs after startup, fills missing posters ────
async function runBackgroundEnrichment() {
  if (_enrichBusy) return;
  _enrichBusy = true;
  console.log('🔄 Background enrichment started...');

  for (const item of _movieList) {
    if (item.poster) continue;
    const info = await getPosterInfo(item.file, 'movie');
    if (info) {
      Object.assign(item, {
        poster:   info.poster,
        tmdbId:   info.tmdbId   || item.tmdbId,
        overview: info.overview || item.overview,
        year:     info.year     || item.year,
        rating:   info.rating   || item.rating,
        genre:    info.genre    || item.genre,
        runtime:  info.runtime  || item.runtime,
        director: info.director || item.director,
        language: info.language || item.language,
        productionCompanies: info.productionCompanies || [],
      });
    }
  }

  for (const show of _seriesList) {
    if (show.poster) continue;
    const key = '__series__' + show.name;
    let info = posterCache[key];
    if (!info) {
      info = await omdbEnqueue(show.name, 'series');
      if (info) { posterCache[key] = info; saveCache(); }
    }
    if (info) Object.assign(show, {
      poster:   info.poster,
      tmdbId:   info.tmdbId || show.tmdbId || null,
      overview: info.overview || show.overview,
      year:     info.year     || show.year,
      rating:   info.rating   || show.rating,
      genre:    info.genre    || show.genre,
      language: info.language || show.language,
      productionCompanies: info.productionCompanies || [],
    });
  }

  _enrichBusy = false;
  console.log('✅ Background enrichment complete');
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPLY CARTOON/ANIME FILTER TO ALL DATA (local + FTP) WITH LOGGING
// ═══════════════════════════════════════════════════════════════════════════════
function filterCartoonsAndAnime() {
  const beforeMovies = _movieList.length;
  const beforeSeries = _seriesList.length;
  
  // Filter local movies and series
  _movieList = _movieList.filter(m => !isCartoonOrAnime(m));
  _seriesList = _seriesList.filter(s => !isCartoonOrAnime(s));
  
  // Log removed items
  console.log(`🧹 Removed ${beforeMovies - _movieList.length} cartoon movies, ${beforeSeries - _seriesList.length} cartoon series.`);
  
  // Also filter FTP catalog data used in API responses
  _dedupedMovies = null;  // reset cache so next getCachedMovies() re-filters
  _dedupedSeries = null;
  
  console.log(`🎬 After cartoon filter: ${_movieList.length} movies, ${_seriesList.length} series remain`);
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(tracker.requestMiddleware);

app.options('*', (req, res) => res.sendStatus(204));
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net https://static.cloudflareinsights.com; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://static.cloudflareinsights.com; script-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; media-src * blob:; connect-src *");
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  next();
});
app.use('/api/dashboard', dashboardRoutes);
app.use('/internal/mac-mini-stats', createSystemStatsRouter({
  token: process.env.MAC_MINI_STATS_TOKEN || process.env.STRESS_TELEMETRY_TOKEN || ''
}));
app.use(express.static(path.join(__dirname, 'public')));

// ── Poster proxy/cache route used by app.js svOptimizeImageUrl() ──────────────
// Keeps poster loading working even when the frontend requests /poster-cache?url=...
app.get('/poster-cache', (req, res) => {
  const target = String(req.query.url || '').trim();
  if (!target) return res.status(400).send('Missing poster url');
  let parsed;
  try { parsed = new URL(target); }
  catch { return res.status(400).send('Invalid poster url'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).send('Unsupported poster protocol');

  const client = parsed.protocol === 'https:' ? https : http;
  const proxyReq = client.get(parsed, {
    headers: { 'User-Agent': 'StreamVault/1.0', 'Accept': 'image/avif,image/webp,image/*,*/*' }
  }, upstream => {
    if ([301, 302, 307, 308].includes(upstream.statusCode) && upstream.headers.location) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.redirect(upstream.headers.location);
    }
    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      res.status(upstream.statusCode || 502).end();
      upstream.resume();
      return;
    }
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    upstream.pipe(res);
  });
  proxyReq.on('error', err => {
    console.warn('[Poster cache] proxy failed:', err.message);
    if (!res.headersSent) res.status(502).send('Poster proxy failed');
  });
  proxyReq.setTimeout(12000, () => {
    proxyReq.destroy();
    if (!res.headersSent) res.status(504).send('Poster proxy timeout');
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// API: CHANNELS
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/api/channels', (req, res) => {
  res.json(channels);
});

app.post('/api/channels/reload', (req, res) => {
  channels = loadJSON(CHANNELS_FILE, []);
  console.log(`🔄 Reloaded ${channels.length} channels`);
  res.json({ ok: true, count: channels.length });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE TV PROXY
// Robust HLS proxy: rewrites segments, nested playlists, keys, and maps.

const FIFA_LIVE_COMPETITION = 'FIFA / Football Live';
const FIFA_LIVE_REAL_UNAVAILABLE = 'Real live football data is unavailable right now';
const FIFA_LIVE_FAST_CACHE_MS = Math.min(30000, Math.max(20000, Number(process.env.FIFA_LIVE_CACHE_MS || 25000)));
const FIFA_LIVE_SLOW_CACHE_MS = Math.min(15 * 60 * 1000, Math.max(5 * 60 * 1000, Number(process.env.FIFA_LIVE_SLOW_CACHE_MS || 5 * 60 * 1000)));
const FIFA_LIVE_UPSTREAM_TIMEOUT_MS = Math.min(12000, Math.max(4000, Number(process.env.FIFA_LIVE_TIMEOUT_MS || 7000)));
const FIFA_LIVE_API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';
const FIFA_LIVE_ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const FIFA_LIVE_NEWS_CACHE_MS = Math.min(15 * 60 * 1000, Math.max(5 * 60 * 1000, Number(process.env.FIFA_LIVE_NEWS_CACHE_MS || 5 * 60 * 1000)));
const FIFA_LIVE_NEWS_MAX = 8;
let fifaLiveCache = null;
let fifaLiveLastGood = null;
let fifaLiveInFlight = null;
let fifaLiveLastWarnAt = 0;
let fifaLiveNewsCache = null;
let fifaLiveNewsLastGood = null;
let fifaLiveNewsInFlight = null;
const fifaMatchDetailCache = new Map();
const fifaMatchDetailInflight = new Map();
const FIFA_LIVE_DETAIL_FAST_CACHE_MS = Math.min(30000, Math.max(20000, Number(process.env.FIFA_LIVE_DETAIL_FAST_CACHE_MS || 25000)));
const FIFA_LIVE_DETAIL_SLOW_CACHE_MS = Math.min(15 * 60 * 1000, Math.max(5 * 60 * 1000, Number(process.env.FIFA_LIVE_DETAIL_SLOW_CACHE_MS || 10 * 60 * 1000)));
const FIFA_LIVE_DETAIL_UNAVAILABLE = 'Detailed match data is unavailable for this fixture right now.';
const FIFA_LIVE_DETAIL_PROVIDER_LIMITED = 'Full player lineups and formations require API_FOOTBALL_KEY. ESPN fallback did not provide them for this match.';

function svFifaFirst(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (!text || text.toLowerCase() === 'undefined' || text.toLowerCase() === 'null') continue;
    return value;
  }
  return '';
}

function svFifaArray(value) {
  return Array.isArray(value) ? value : [];
}

function svFifaNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function svFifaIsoDate(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function svFifaApiDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function svFifaEspnDate(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function svFifaTitleCase(value) {
  return String(value || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()).trim();
}

function svFifaWarn(message, err) {
  const now = Date.now();
  if (now - fifaLiveLastWarnAt < 60000) return;
  fifaLiveLastWarnAt = now;
  console.warn(`[FIFA Live] ${message}${err?.message ? `: ${err.message}` : ''}`);
}

function svFifaEmptyPayload(message = FIFA_LIVE_REAL_UNAVAILABLE, stale = false, source = 'none') {
  const payload = {
    ok: false,
    generatedAt: new Date().toISOString(),
    source,
    stale: !!stale,
    competition: FIFA_LIVE_COMPETITION,
    message,
    liveMatches: [],
    upcomingMatches: [],
    recentResults: [],
    standings: [],
    headlines: [],
    apiFootballConfigured: !!svFifaApiFootballKey(),
    dataIntegrity: {
      fakeDataUsed: false,
      cardsAreProviderOnly: true,
      statsAreProviderOnly: true
    },
    providerLimitations: []
  };
  payload.fakeDataUsed = false;
  payload.capabilities = svFifaBuildSummaryCapabilities(payload, source);
  payload.provider = svFifaProviderMeta(source);
  return payload;
}

function svFifaHasRealData(payload) {
  return !!payload && [
    payload.liveMatches,
    payload.upcomingMatches,
    payload.recentResults,
    payload.headlines
  ].some(items => Array.isArray(items) && items.length) || svFifaFilterStandings(payload?.standings).length > 0;
}

function svFifaFinalizePayload(payload, source, message = '') {
  const standings = svFifaFilterStandings(payload?.standings);
  const next = {
    ok: svFifaHasRealData(payload),
    generatedAt: new Date().toISOString(),
    source,
    stale: false,
    competition: FIFA_LIVE_COMPETITION,
    message,
    liveMatches: svFifaArray(payload?.liveMatches).slice(0, 12),
    upcomingMatches: svFifaArray(payload?.upcomingMatches).slice(0, 14),
    recentResults: svFifaArray(payload?.recentResults).slice(0, 10),
    standings: standings.slice(0, 32),
    headlines: svFifaArray(payload?.headlines).slice(0, 8),
    apiFootballConfigured: !!svFifaApiFootballKey(),
    dataIntegrity: {
      fakeDataUsed: false,
      cardsAreProviderOnly: true,
      statsAreProviderOnly: true
    },
    providerLimitations: []
  };
  next.fakeDataUsed = false;
  if (!next.ok && !next.message) next.message = FIFA_LIVE_REAL_UNAVAILABLE;
  next.capabilities = svFifaBuildSummaryCapabilities(next, source);
  next.provider = svFifaProviderMeta(source);
  return next;
}

function svFifaMarkStale(payload, source) {
  return {
    ...payload,
    ok: true,
    generatedAt: new Date().toISOString(),
    source: source || 'cache',
    stale: true,
    message: 'Showing last real football update while the live provider reconnects'
  };
}

function svFifaCachePayload(payload) {
  if (!payload || (!payload.ok && payload.source === 'none')) {
    fifaLiveCache = null;
    return payload;
  }
  const ttl = payload?.liveMatches?.length ? FIFA_LIVE_FAST_CACHE_MS : FIFA_LIVE_SLOW_CACHE_MS;
  fifaLiveCache = { expiresAt: Date.now() + ttl, payload };
  if (payload && payload.ok && !payload.stale && payload.source !== 'none') fifaLiveLastGood = payload;
  return payload;
}

function svFifaRefreshLiveCache() {
  if (fifaLiveInFlight) return fifaLiveInFlight;
  fifaLiveInFlight = svFifaFetchRealPayload()
    .then(payload => svFifaCachePayload(payload))
    .catch(err => {
      svFifaWarn('endpoint fallback', err);
      if (fifaLiveLastGood) return svFifaCachePayload(svFifaMarkStale(fifaLiveLastGood, 'cache'));
      return svFifaCachePayload(svFifaEmptyPayload(FIFA_LIVE_REAL_UNAVAILABLE, false, 'none'));
    })
    .finally(() => { fifaLiveInFlight = null; });

  return fifaLiveInFlight;
}

function svFifaFetchJson(rawUrl, options = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(rawUrl); } catch (e) { return reject(e); }
    if (!['http:', 'https:'].includes(parsed.protocol)) return reject(new Error('Unsupported football provider URL'));

    const mod = parsed.protocol === 'https:' ? https : http;
    const headers = {
      Accept: 'application/json',
      'User-Agent': 'StreamVault-Football-Live/2.0',
      ...(options.headers || {})
    };
    const timeout = options.timeout || FIFA_LIVE_UPSTREAM_TIMEOUT_MS;
    const maxBytes = options.maxBytes || 3 * 1024 * 1024;

    const req = mod.request(parsed, { method: 'GET', timeout, headers }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 3) {
        res.resume();
        resolve(svFifaFetchJson(new URL(res.headers.location, parsed).href, options, redirects + 1));
        return;
      }
      const chunks = [];
      let total = 0;
      res.on('data', chunk => {
        total += chunk.length;
        if (total > maxBytes) {
          req.destroy(new Error('Football provider response too large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Football provider returned ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Football provider timeout')));
    req.end();
  });
}

function svFifaHttpUrl(value) {
  const text = String(value || '').trim();
  return /^https?:\/\//i.test(text) ? text : '';
}

function svFifaNewsDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function svFifaNewsSourceLabel(source) {
  const clean = String(source || '').trim().toLowerCase();
  if (clean === 'fifa') return 'FIFA';
  if (clean === 'fox') return 'FOX Sports';
  if (clean === 'espn') return 'ESPN';
  return source ? String(source) : '';
}

function svFifaNormalizeNewsItems(items, fallbackSource = '') {
  const seen = new Set();
  const normalized = [];
  svFifaArray(items).forEach((item, index) => {
    const title = String(svFifaFirst(item?.title, item?.headline, item?.shortLinkText, item?.name, '')).trim();
    if (!title) return;
    const url = svFifaHttpUrl(svFifaFirst(item?.url, item?.link, item?.links?.web?.href, item?.links?.api?.self?.href, ''));
    const source = typeof item?.source === 'string' ? item.source : '';
    const key = `${title.toLowerCase()}|${url}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push({
      title,
      url,
      publishedAt: svFifaNewsDate(svFifaFirst(item?.publishedAt, item?.published, item?.lastModified, item?.time, item?.date, '')),
      source: String(svFifaFirst(item?.source?.name, item?.source?.displayName, item?.sourceName, source, svFifaNewsSourceLabel(fallbackSource), '')),
      id: String(svFifaFirst(item?.id, item?.nowId, url, `news-${index}`))
    });
  });
  return normalized.slice(0, FIFA_LIVE_NEWS_MAX);
}

function svFifaNewsPayload(headlines, source = 'none', stale = false, message = '') {
  const normalized = svFifaNormalizeNewsItems(headlines, source);
  return {
    ok: normalized.length > 0,
    generatedAt: new Date().toISOString(),
    source: normalized.length ? source : 'none',
    stale: !!stale,
    message: message || '',
    headlines: normalized.map(({ id, ...item }) => item),
    apiFootballConfigured: !!svFifaApiFootballKey(),
    fakeDataUsed: false,
    dataIntegrity: {
      fakeDataUsed: false,
      cardsAreProviderOnly: true,
      statsAreProviderOnly: true
    }
  };
}

function svFifaMarkNewsStale(payload) {
  return {
    ...payload,
    ok: true,
    generatedAt: new Date().toISOString(),
    source: 'cache',
    stale: true,
    message: 'Showing last real football news while the news source reconnects'
  };
}

function svFifaCacheNewsPayload(payload) {
  if (!payload) return payload;
  fifaLiveNewsCache = { expiresAt: Date.now() + FIFA_LIVE_NEWS_CACHE_MS, payload };
  if (payload.ok && !payload.stale && payload.source !== 'none') fifaLiveNewsLastGood = payload;
  return payload;
}

function svFifaDedupeMatches(items) {
  const seen = new Set();
  return svFifaArray(items).filter(match => {
    const key = String(match?.id || `${match?.homeTeam || ''}|${match?.awayTeam || ''}|${match?.startTime || ''}|${match?.status || ''}`);
    if (!key.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function svFifaApiFootballKey() {
  return String(process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY || process.env.RAPIDAPI_KEY || '').trim();
}

function svFifaApiFootballHeaders(apiKey) {
  return {
    'x-apisports-key': apiKey,
    'x-rapidapi-key': apiKey,
    'x-rapidapi-host': 'v3.football.api-sports.io'
  };
}

const FIFA_TEAM_COUNTRY_CODES = {
  algeria: 'DZ',
  argentina: 'AR',
  australia: 'AU',
  austria: 'AT',
  belgium: 'BE',
  'bosnia herzegovina': 'BA',
  'bosnia-herzegovina': 'BA',
  bosniaherzegovina: 'BA',
  brazil: 'BR',
  canada: 'CA',
  colombia: 'CO',
  'congo dr': 'CD',
  congodr: 'CD',
  'dr congo': 'CD',
  drcongo: 'CD',
  'democratic republic of congo': 'CD',
  croatia: 'HR',
  curacao: 'CW',
  czechia: 'CZ',
  denmark: 'DK',
  ecuador: 'EC',
  egypt: 'EG',
  england: 'GB-ENG',
  france: 'FR',
  germany: 'DE',
  ghana: 'GH',
  haiti: 'HT',
  iraq: 'IQ',
  iran: 'IR',
  italy: 'IT',
  'ivory coast': 'CI',
  'cote d ivoire': 'CI',
  japan: 'JP',
  jordan: 'JO',
  mexico: 'MX',
  morocco: 'MA',
  netherlands: 'NL',
  'new zealand': 'NZ',
  norway: 'NO',
  panama: 'PA',
  paraguay: 'PY',
  portugal: 'PT',
  qatar: 'QA',
  'saudi arabia': 'SA',
  scotland: 'GB-SCT',
  senegal: 'SN',
  'south africa': 'ZA',
  southafrica: 'ZA',
  'south korea': 'KR',
  southkorea: 'KR',
  spain: 'ES',
  sweden: 'SE',
  switzerland: 'CH',
  tunisia: 'TN',
  turkiye: 'TR',
  turkey: 'TR',
  'türkiye': 'TR',
  'united states': 'US',
  unitedstates: 'US',
  usa: 'US',
  uruguay: 'UY',
  'cape verde': 'CV',
  wales: 'GB-WLS',
  uzbekistan: 'UZ'
};

const FIFA_SUBDIVISION_FLAGS = {
  'GB-ENG': String.fromCodePoint(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f),
  'GB-SCT': String.fromCodePoint(0x1f3f4, 0xe0067, 0xe0062, 0xe0073, 0xe0063, 0xe0074, 0xe007f),
  'GB-WLS': String.fromCodePoint(0x1f3f4, 0xe0067, 0xe0062, 0xe0077, 0xe006c, 0xe0073, 0xe007f)
};

function svFifaTeamKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function svFifaCountryCodeFromName(name) {
  const key = svFifaTeamKey(name);
  return FIFA_TEAM_COUNTRY_CODES[key] || FIFA_TEAM_COUNTRY_CODES[key.replace(/\s+/g, '')] || '';
}

function svFifaFlagEmojiFromCode(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return '';
  if (FIFA_SUBDIVISION_FLAGS[clean]) return FIFA_SUBDIVISION_FLAGS[clean];
  if (!/^[A-Z]{2}$/.test(clean)) return '';
  return clean
    .split('')
    .map(ch => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
    .join('');
}

function svFifaProviderLogo(team) {
  const logo = svFifaFirst(
    team?.logo,
    team?.flag,
    team?.crest,
    team?.team?.logo,
    team?.team?.flag,
    team?.team?.logos?.[0]?.href,
    team?.logos?.[0]?.href,
    team?.logos?.[0]?.url
  );
  return /^https?:\/\//i.test(String(logo || '')) ? String(logo) : '';
}

function svFifaProviderCode(team) {
  return String(svFifaFirst(
    team?.countryCode,
    team?.code,
    team?.abbreviation,
    team?.team?.countryCode,
    team?.team?.abbreviation
  ) || '').trim();
}

function svFifaTeamMeta(name, providerTeam = {}) {
  const code = svFifaProviderCode(providerTeam);
  const mappedCode = svFifaCountryCodeFromName(name);
  const countryCode = /^[A-Z]{2}$/i.test(code) ? code.toUpperCase() : mappedCode;
  return {
    logo: svFifaProviderLogo(providerTeam),
    flag: svFifaFlagEmojiFromCode(countryCode) || '',
    countryCode: countryCode || ''
  };
}

function svFifaEnrichMatchTeams(match, homeProvider = {}, awayProvider = {}) {
  const home = svFifaTeamMeta(match?.homeTeam, homeProvider);
  const away = svFifaTeamMeta(match?.awayTeam, awayProvider);
  return {
    ...match,
    homeLogo: match?.homeLogo || home.logo,
    homeFlag: match?.homeFlag || home.flag,
    homeCountryCode: match?.homeCountryCode || home.countryCode,
    awayLogo: match?.awayLogo || away.logo,
    awayFlag: match?.awayFlag || away.flag,
    awayCountryCode: match?.awayCountryCode || away.countryCode
  };
}

function svFifaProviderMeta(source) {
  const active = svFifaCleanProvider(source) || String(source || 'none');
  const apiFootballConfigured = !!svFifaApiFootballKey();
  return {
    active,
    apiFootballConfigured,
    limited: active === 'espn' && !apiFootballConfigured,
    fallback: active === 'espn' && !apiFootballConfigured
  };
}

function svFifaMatchHasRealScore(match) {
  if (!match?.homeTeam || !match?.awayTeam) return false;
  const status = String(match.status || '').toUpperCase();
  const hasScore = match.homeScore === 0 || match.homeScore || match.awayScore === 0 || match.awayScore;
  return !!(hasScore || status === 'UPCOMING' || status === 'POSTPONED');
}

function svFifaValidStatRow(row) {
  return !!(
    svFifaCleanDetailValue(row?.label) &&
    (svFifaCleanDetailValue(row?.home) || svFifaCleanDetailValue(row?.away))
  );
}

function svFifaFilterStats(rows) {
  return svFifaArray(rows).filter(svFifaValidStatRow);
}

function svFifaValidPlayer(player) {
  return !!svFifaCleanDetailValue(player?.name);
}

function svFifaCleanPlayers(players) {
  return svFifaArray(players).filter(svFifaValidPlayer);
}

function svFifaLineupHasPlayers(lineup) {
  return svFifaCleanPlayers(lineup?.players).length > 0 || svFifaCleanPlayers(lineup?.substitutes).length > 0;
}

function svFifaLineupsHavePlayers(lineups) {
  return svFifaLineupHasPlayers(lineups?.home) || svFifaLineupHasPlayers(lineups?.away);
}

function svFifaLineupsHaveFormations(lineups) {
  return !!(svFifaCleanDetailValue(lineups?.home?.formation) || svFifaCleanDetailValue(lineups?.away?.formation));
}

function svFifaPayloadHasTeamFlags(payload) {
  const matches = [
    ...svFifaArray(payload?.liveMatches),
    ...svFifaArray(payload?.upcomingMatches),
    ...svFifaArray(payload?.recentResults)
  ];
  return matches.some(match => match?.homeFlag || match?.homeLogo || match?.awayFlag || match?.awayLogo);
}

function svFifaValidEvent(event) {
  return !!(
    svFifaCleanDetailValue(event?.type) ||
    svFifaCleanDetailValue(event?.player) ||
    svFifaCleanDetailValue(event?.team) ||
    svFifaCleanDetailValue(event?.detail)
  );
}

function svFifaFilterEvents(events) {
  return svFifaArray(events).filter(svFifaValidEvent);
}

function svFifaStandingHasTableData(row) {
  return ['played', 'wins', 'draws', 'losses', 'goalDifference', 'points']
    .some(key => svFifaCleanDetailValue(row?.[key]) !== '');
}

function svFifaFilterStandings(rows) {
  return svFifaArray(rows).filter(row => svFifaCleanDetailValue(row?.team) && svFifaStandingHasTableData(row));
}

function svFifaBuildSummaryCapabilities(payload, source = '') {
  const matches = [
    ...svFifaArray(payload?.liveMatches),
    ...svFifaArray(payload?.upcomingMatches),
    ...svFifaArray(payload?.recentResults)
  ];
  const standings = svFifaFilterStandings(payload?.standings);
  return {
    provider: svFifaCleanProvider(source) || String(source || payload?.source || 'none'),
    apiFootballConfigured: !!svFifaApiFootballKey(),
    liveScores: matches.some(svFifaMatchHasRealScore),
    matchStats: false,
    lineups: false,
    formations: false,
    events: false,
    standings: standings.length > 0,
    headlines: svFifaArray(payload?.headlines).length > 0,
    teamFlags: svFifaPayloadHasTeamFlags(payload)
  };
}

function svFifaBuildDetailCapabilities(detail) {
  const lineups = detail?.lineups || {};
  return {
    provider: svFifaCleanProvider(detail?.source) || String(detail?.source || 'none'),
    apiFootballConfigured: !!svFifaApiFootballKey(),
    liveScores: svFifaMatchHasRealScore(detail?.match),
    matchStats: svFifaFilterStats(detail?.statistics).length > 0,
    lineups: svFifaLineupsHavePlayers(lineups),
    formations: svFifaLineupsHaveFormations(lineups),
    events: svFifaFilterEvents(detail?.events).length > 0,
    standings: svFifaFilterStandings(detail?.standings).length > 0,
    teamFlags: !!(
      detail?.match?.homeFlag ||
      detail?.match?.homeLogo ||
      detail?.match?.awayFlag ||
      detail?.match?.awayLogo
    )
  };
}

function svFifaNormalizeApiFootballFixture(item) {
  const fixture = item?.fixture || {};
  const league = item?.league || {};
  const teams = item?.teams || {};
  const goals = item?.goals || {};
  const statusInfo = fixture.status || {};
  const short = String(statusInfo.short || '').toUpperCase();
  const statusMap = {
    NS: 'UPCOMING',
    TBD: 'UPCOMING',
    '1H': 'LIVE',
    '2H': 'LIVE',
    ET: 'LIVE',
    BT: 'LIVE',
    P: 'LIVE',
    SUSP: 'POSTPONED',
    INT: 'LIVE',
    HT: 'HT',
    FT: 'FT',
    AET: 'FT',
    PEN: 'FT',
    PST: 'POSTPONED',
    CANC: 'POSTPONED',
    ABD: 'POSTPONED'
  };
  const status = statusMap[short] || (statusInfo.elapsed ? 'LIVE' : 'UPCOMING');
  const isUpcoming = status === 'UPCOMING';
  const isLive = status === 'LIVE' || status === 'HT';
  const startTime = svFifaIsoDate(new Date(fixture.date || Date.now()));
  const match = {
    id: String(svFifaFirst(fixture.id, `${teams.home?.name || 'home'}-${teams.away?.name || 'away'}-${startTime}`)),
    status,
    minute: isLive && statusInfo.elapsed ? `${statusInfo.elapsed}'` : (status === 'HT' ? 'HT' : null),
    homeTeam: String(teams.home?.name || ''),
    awayTeam: String(teams.away?.name || ''),
    homeScore: isUpcoming ? null : svFifaNumber(goals.home),
    awayScore: isUpcoming ? null : svFifaNumber(goals.away),
    competition: String(league.name || ''),
    stage: String(item?.league?.round || ''),
    group: '',
    venue: String(fixture.venue?.name || ''),
    startTime,
    kickoff: startTime,
    provider: 'api-football',
    leagueId: svFifaNumber(league.id),
    season: svFifaNumber(league.season),
    providerUrl: ''
  };
  return svFifaEnrichMatchTeams(match, teams.home, teams.away);
}

function svFifaNormalizeApiFootballStandings(raw) {
  const response = svFifaArray(raw?.response);
  const groups = response.flatMap(entry => svFifaArray(entry?.league?.standings));
  const rows = [];
  groups.forEach(groupRows => {
    svFifaArray(groupRows).forEach(row => {
      rows.push({
        group: String(row?.group || ''),
        rank: svFifaNumber(row?.rank),
        team: String(row?.team?.name || ''),
        logo: svFifaProviderLogo(row?.team),
        flag: svFifaTeamMeta(row?.team?.name, row?.team).flag,
        countryCode: svFifaTeamMeta(row?.team?.name, row?.team).countryCode,
        played: svFifaNumber(row?.all?.played, 0),
        wins: svFifaNumber(row?.all?.win, 0),
        draws: svFifaNumber(row?.all?.draw, 0),
        losses: svFifaNumber(row?.all?.lose, 0),
        goalDifference: svFifaNumber(row?.goalsDiff, 0),
        points: svFifaNumber(row?.points, 0)
      });
    });
  });
  return rows.filter(row => row.team);
}

async function svFifaFetchApiFootball() {
  const apiKey = svFifaApiFootballKey();
  if (!apiKey) return null;
  const season = String(process.env.FIFA_LIVE_SEASON || new Date().getUTCFullYear());
  const headers = svFifaApiFootballHeaders(apiKey);
  const urls = {
    live: `${FIFA_LIVE_API_FOOTBALL_BASE}/fixtures?live=all`,
    upcoming: `${FIFA_LIVE_API_FOOTBALL_BASE}/fixtures?next=12`,
    recent: `${FIFA_LIVE_API_FOOTBALL_BASE}/fixtures?last=8`,
    standings: `${FIFA_LIVE_API_FOOTBALL_BASE}/standings?league=1&season=${encodeURIComponent(season)}`
  };
  const [liveRes, upcomingRes, recentRes, standingsRes] = await Promise.allSettled([
    svFifaFetchJson(urls.live, { headers }),
    svFifaFetchJson(urls.upcoming, { headers }),
    svFifaFetchJson(urls.recent, { headers }),
    svFifaFetchJson(urls.standings, { headers })
  ]);
  const rejected = [liveRes, upcomingRes, recentRes].find(result => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  const liveMatches = svFifaArray(liveRes.value?.response).map(svFifaNormalizeApiFootballFixture).filter(match => match.homeTeam && match.awayTeam);
  const upcomingMatches = svFifaArray(upcomingRes.value?.response)
    .map(svFifaNormalizeApiFootballFixture)
    .filter(match => match.homeTeam && match.awayTeam && match.status === 'UPCOMING');
  const recentResults = svFifaArray(recentRes.value?.response)
    .map(svFifaNormalizeApiFootballFixture)
    .filter(match => match.homeTeam && match.awayTeam && match.status === 'FT');
  const standings = standingsRes.status === 'fulfilled' ? svFifaNormalizeApiFootballStandings(standingsRes.value) : [];
  return svFifaFinalizePayload({
    liveMatches: svFifaDedupeMatches(liveMatches),
    upcomingMatches: svFifaDedupeMatches(upcomingMatches),
    recentResults: svFifaDedupeMatches(recentResults),
    standings,
    headlines: []
  }, 'api-football');
}

function svFifaEspnEventStatus(event, competition) {
  const type = competition?.status?.type || event?.status?.type || {};
  const state = String(type.state || '').toLowerCase();
  const detail = String(type.shortDetail || type.detail || type.description || '').toUpperCase();
  if (state === 'in') return detail.includes('HT') ? 'HT' : 'LIVE';
  if (type.completed || state === 'post') return 'FT';
  if (detail.includes('POSTPONED') || detail.includes('PPD')) return 'POSTPONED';
  return 'UPCOMING';
}

function svFifaNormalizeEspnEvent(event, leagueSlug = 'fifa.world') {
  const competition = event?.competitions?.[0] || {};
  const competitors = svFifaArray(competition.competitors);
  const home = competitors.find(c => c.homeAway === 'home') || competitors[0] || {};
  const away = competitors.find(c => c.homeAway === 'away') || competitors[1] || {};
  const status = svFifaEspnEventStatus(event, competition);
  const isUpcoming = status === 'UPCOMING';
  const statusType = competition?.status?.type || event?.status?.type || {};
  const displayClock = String(competition?.status?.displayClock || event?.status?.displayClock || '');
  const startTime = svFifaIsoDate(new Date(competition.startDate || competition.date || event.date || Date.now()));
  const league = event?.league || {};
  const leagueName = String(svFifaFirst(league.name, event?.season?.displayName, ''));
  const note = String(competition.altGameNote || '');
  const group = (note.match(/\bGroup\s+[A-Z0-9]+/i) || [''])[0];
  const link = svFifaArray(event?.links).find(item => svFifaArray(item?.rel).includes('summary'))?.href || '';
  const match = {
    id: String(event?.id || competition?.id || `${home.team?.displayName || 'home'}-${away.team?.displayName || 'away'}-${startTime}`),
    status,
    minute: status === 'LIVE' && displayClock ? displayClock : (status === 'HT' ? 'HT' : null),
    homeTeam: String(home.team?.displayName || home.team?.shortDisplayName || ''),
    awayTeam: String(away.team?.displayName || away.team?.shortDisplayName || ''),
    homeScore: isUpcoming ? null : svFifaNumber(home.score),
    awayScore: isUpcoming ? null : svFifaNumber(away.score),
    competition: leagueName || note.split(',')[0] || 'Football',
    stage: svFifaTitleCase(event?.season?.slug || statusType.description || ''),
    group,
    venue: String(competition?.venue?.fullName || event?.venue?.displayName || ''),
    startTime,
    kickoff: startTime,
    provider: 'espn',
    leagueSlug: String(svFifaFirst(event?.league?.slug, leagueSlug, 'fifa.world')),
    providerUrl: link
  };
  return svFifaEnrichMatchTeams(match, home.team || home, away.team || away);
}

function svFifaNormalizeEspnHeadlines(...sources) {
  const items = [];
  sources.flatMap(src => svFifaArray(src)).forEach((item, index) => {
    const title = svFifaFirst(item?.headline, item?.shortLinkText, item?.title);
    if (!title) return;
    items.push({
      id: String(svFifaFirst(item?.id, item?.nowId, item?.links?.web?.href, `headline-${index}`)),
      title: String(title),
      time: String(svFifaFirst(item?.published, item?.lastModified, item?.time, '')),
      url: String(svFifaFirst(item?.links?.web?.href, item?.link, ''))
    });
  });
  const seen = new Set();
  return items.filter(item => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

async function svFifaFetchEspnNews() {
  const news = await svFifaFetchJson(`${FIFA_LIVE_ESPN_BASE}/fifa.world/news?limit=12`, {
    timeout: FIFA_LIVE_UPSTREAM_TIMEOUT_MS,
    maxBytes: 1024 * 1024
  });
  return svFifaNewsPayload(news?.articles, 'espn');
}

async function svFifaFetchNewsFresh() {
  const providers = [
    ['espn', svFifaFetchEspnNews]
  ];
  const errors = [];
  for (const [name, fetcher] of providers) {
    try {
      const payload = await fetcher();
      if (payload?.ok && svFifaArray(payload.headlines).length) return payload;
      errors.push(new Error(`${name} returned no football headlines`));
    } catch (e) {
      errors.push(e);
      svFifaWarn(`${name} news provider failed`, e);
    }
  }
  if (errors.length) throw errors[0];
  return svFifaNewsPayload([], 'none');
}

async function svGetFifaNewsPayload() {
  const now = Date.now();
  if (fifaLiveNewsCache && fifaLiveNewsCache.expiresAt > now) return fifaLiveNewsCache.payload;
  if (fifaLiveNewsInFlight) return fifaLiveNewsInFlight;

  fifaLiveNewsInFlight = svFifaFetchNewsFresh()
    .then(payload => svFifaCacheNewsPayload(payload))
    .catch(err => {
      svFifaWarn('news endpoint fallback', err);
      if (fifaLiveNewsLastGood) return svFifaCacheNewsPayload(svFifaMarkNewsStale(fifaLiveNewsLastGood));
      return svFifaCacheNewsPayload(svFifaNewsPayload([], 'none'));
    })
    .finally(() => { fifaLiveNewsInFlight = null; });

  return fifaLiveNewsInFlight;
}

async function svFifaFetchEspnScoreboards(league = 'fifa.world') {
  const offsets = [-1, 0, 1, 2];
  const urls = offsets.map(offset => {
    const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
    return `${FIFA_LIVE_ESPN_BASE}/${league}/scoreboard?limit=40&dates=${svFifaEspnDate(date)}`;
  });
  const results = await Promise.allSettled(urls.map(url => svFifaFetchJson(url, { timeout: FIFA_LIVE_UPSTREAM_TIMEOUT_MS })));
  const fulfilled = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  if (!fulfilled.length) throw results.find(result => result.status === 'rejected')?.reason || new Error('ESPN scoreboard unavailable');
  return fulfilled;
}

async function svFifaFetchEspn() {
  let scoreboards = await svFifaFetchEspnScoreboards('fifa.world');
  let sourceLeague = 'espn';
  let detailLeague = 'fifa.world';
  if (!scoreboards.some(board => svFifaArray(board?.events).length)) {
    scoreboards = await svFifaFetchEspnScoreboards('all');
    sourceLeague = 'espn';
    detailLeague = 'all';
  }
  const events = svFifaDedupeMatches(scoreboards.flatMap(board => svFifaArray(board?.events).map(event => svFifaNormalizeEspnEvent(event, detailLeague))))
    .filter(match => match.homeTeam && match.awayTeam);
  const liveMatches = events.filter(match => match.status === 'LIVE' || match.status === 'HT');
  const upcomingMatches = events
    .filter(match => match.status === 'UPCOMING')
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const recentResults = events
    .filter(match => match.status === 'FT')
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  const headlines = svFifaNormalizeEspnHeadlines(
    scoreboards.flatMap(board => svFifaArray(board?.events).flatMap(event => svFifaArray(event?.competitions?.[0]?.headlines)))
  );
  return svFifaFinalizePayload({
    liveMatches,
    upcomingMatches,
    recentResults,
    standings: [],
    headlines
  }, sourceLeague);
}

async function svFifaFetchRealPayload() {
  const providers = [];
  if (svFifaApiFootballKey()) providers.push(['api-football', svFifaFetchApiFootball]);
  providers.push(['espn', svFifaFetchEspn]);

  const errors = [];
  for (const [name, fetcher] of providers) {
    try {
      const payload = await fetcher();
      if (payload && payload.ok) return payload;
      if (payload && svFifaHasRealData(payload)) return { ...payload, ok: true };
      errors.push(new Error(`${name} returned no live football data`));
    } catch (e) {
      errors.push(e);
      svFifaWarn(`${name} provider failed`, e);
    }
  }
  if (fifaLiveLastGood) return svFifaMarkStale(fifaLiveLastGood, 'cache');
  return svFifaEmptyPayload(FIFA_LIVE_REAL_UNAVAILABLE, false, 'none');
}

async function svGetFifaLivePayload(options = {}) {
  const now = Date.now();
  if (fifaLiveCache && fifaLiveCache.expiresAt > now) return fifaLiveCache.payload;
  if (options.allowStale && fifaLiveLastGood) {
    svFifaRefreshLiveCache();
    return svFifaMarkStale(fifaLiveLastGood, 'cache');
  }
  if (fifaLiveInFlight) return fifaLiveInFlight;
  return svFifaRefreshLiveCache();
}

function svWarmFifaLiveCache(reason = 'startup') {
  svFifaRefreshLiveCache()
    .then(payload => {
      const total = svFifaArray(payload?.liveMatches).length + svFifaArray(payload?.upcomingMatches).length + svFifaArray(payload?.recentResults).length;
      console.log(`[FIFA Live] ${reason} cache ready: ${total} matches from ${payload?.source || 'none'}${payload?.stale ? ' (stale)' : ''}`);
    })
    .catch(err => svFifaWarn(`${reason} cache warmup failed`, err));
}

function svFifaCleanProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (provider === 'api-football' || provider === 'apifootball' || provider === 'api_sports') return 'api-football';
  if (provider === 'espn') return 'espn';
  if (provider === 'cache') return 'cache';
  return '';
}

function svFifaCleanDetailValue(value) {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return '';
  return text;
}

function svFifaEmptyLineup(team = '') {
  return {
    team: String(team || ''),
    formation: '',
    coach: '',
    players: [],
    substitutes: []
  };
}

function svFifaEmptyMatchDetail(matchId = '', message = FIFA_LIVE_DETAIL_UNAVAILABLE, source = 'none', stale = false) {
  const detail = {
    ok: false,
    generatedAt: new Date().toISOString(),
    source,
    stale: !!stale,
    match: {
      id: String(matchId || ''),
      status: '',
      minute: '',
      homeTeam: '',
      awayTeam: '',
      homeScore: null,
      awayScore: null,
      competition: '',
      stage: '',
      venue: '',
      startTime: ''
    },
    overview: {
      referee: '',
      weather: '',
      attendance: '',
      round: '',
      leg: ''
    },
    statistics: [],
    lineups: {
      home: svFifaEmptyLineup(),
      away: svFifaEmptyLineup()
    },
    events: [],
    standings: [],
    message,
    apiFootballConfigured: !!svFifaApiFootballKey(),
    dataIntegrity: {
      fakeDataUsed: false,
      cardsAreProviderOnly: true,
      statsAreProviderOnly: true
    },
    providerLimitations: []
  };
  detail.fakeDataUsed = false;
  detail.capabilities = svFifaBuildDetailCapabilities(detail);
  detail.provider = svFifaProviderMeta(source);
  return detail;
}

function svFifaMatchDetailHasData(detail) {
  const lineups = detail?.lineups || {};
  return !!(
    svFifaArray(detail?.statistics).length ||
    svFifaArray(detail?.events).length ||
    svFifaArray(detail?.standings).length ||
    svFifaArray(lineups.home?.players).length ||
    svFifaArray(lineups.home?.substitutes).length ||
    svFifaArray(lineups.away?.players).length ||
    svFifaArray(lineups.away?.substitutes).length ||
    lineups.home?.formation ||
    lineups.away?.formation ||
    lineups.home?.coach ||
    lineups.away?.coach
  );
}

function svFifaFinalizeMatchDetail(payload, source, stale = false) {
  const match = svFifaEnrichMatchTeams(payload?.match || {});
  const overview = payload?.overview || {};
  const lineups = payload?.lineups || {};
  const valueSource = stale || source === 'cache' ? 'cache' : 'provider';
  const homePlayers = svFifaCleanPlayers(lineups.home?.players).slice(0, 40);
  const homeSubs = svFifaCleanPlayers(lineups.home?.substitutes).slice(0, 40);
  const awayPlayers = svFifaCleanPlayers(lineups.away?.players).slice(0, 40);
  const awaySubs = svFifaCleanPlayers(lineups.away?.substitutes).slice(0, 40);
  const homeLineupMeta = svFifaTeamMeta(lineups.home?.team || match.homeTeam, lineups.home);
  const awayLineupMeta = svFifaTeamMeta(lineups.away?.team || match.awayTeam, lineups.away);
  const enrichEvent = event => {
    const teamKey = svFifaTeamKey(event?.team);
    const homeKey = svFifaTeamKey(match.homeTeam);
    const awayKey = svFifaTeamKey(match.awayTeam);
    const sideMeta = teamKey && teamKey === homeKey
      ? { logo: match.homeLogo, flag: match.homeFlag, countryCode: match.homeCountryCode }
      : (teamKey && teamKey === awayKey ? { logo: match.awayLogo, flag: match.awayFlag, countryCode: match.awayCountryCode } : {});
    const teamMeta = svFifaTeamMeta(event?.team, event);
    return {
      ...event,
      source: event?.source === 'cache' ? 'cache' : valueSource,
      teamLogo: event?.teamLogo || sideMeta.logo || teamMeta.logo,
      teamFlag: event?.teamFlag || sideMeta.flag || teamMeta.flag,
      teamCountryCode: event?.teamCountryCode || sideMeta.countryCode || teamMeta.countryCode
    };
  };
  const enrichStanding = row => {
    const meta = svFifaTeamMeta(row?.team, row);
    return {
      ...row,
      source: row?.source === 'cache' ? 'cache' : valueSource,
      logo: row?.logo || row?.teamLogo || meta.logo,
      flag: row?.flag || row?.teamFlag || meta.flag,
      countryCode: row?.countryCode || row?.teamCountryCode || meta.countryCode
    };
  };
  const detail = {
    ok: !!payload?.ok,
    generatedAt: new Date().toISOString(),
    source,
    stale: !!stale,
    match: {
      id: String(match.id || payload?.matchId || ''),
      status: String(match.status || ''),
      minute: svFifaCleanDetailValue(match.minute),
      homeTeam: String(match.homeTeam || ''),
      awayTeam: String(match.awayTeam || ''),
      homeScore: match.homeScore === 0 || match.homeScore ? match.homeScore : null,
      awayScore: match.awayScore === 0 || match.awayScore ? match.awayScore : null,
      competition: String(match.competition || ''),
      stage: String(match.stage || match.group || ''),
      venue: String(match.venue || ''),
      startTime: String(match.startTime || match.kickoff || ''),
      homeFlag: match.homeFlag || '',
      homeLogo: match.homeLogo || '',
      homeCountryCode: match.homeCountryCode || '',
      awayFlag: match.awayFlag || '',
      awayLogo: match.awayLogo || '',
      awayCountryCode: match.awayCountryCode || ''
    },
    overview: {
      referee: svFifaCleanDetailValue(overview.referee),
      weather: svFifaCleanDetailValue(overview.weather),
      attendance: svFifaCleanDetailValue(overview.attendance),
      round: svFifaCleanDetailValue(overview.round),
      leg: svFifaCleanDetailValue(overview.leg)
    },
    statistics: svFifaFilterStats(payload?.statistics).slice(0, 32).map(row => ({
      ...row,
      source: row?.source === 'cache' ? 'cache' : valueSource,
      homeFlag: row?.homeFlag || match.homeFlag || '',
      homeLogo: row?.homeLogo || match.homeLogo || '',
      awayFlag: row?.awayFlag || match.awayFlag || '',
      awayLogo: row?.awayLogo || match.awayLogo || ''
    })),
    lineups: {
      home: {
        ...svFifaEmptyLineup(match.homeTeam),
        ...(lineups.home || {}),
        formation: svFifaCleanDetailValue(lineups.home?.formation),
        coach: svFifaCleanDetailValue(lineups.home?.coach),
        logo: lineups.home?.logo || match.homeLogo || homeLineupMeta.logo,
        flag: lineups.home?.flag || match.homeFlag || homeLineupMeta.flag,
        countryCode: lineups.home?.countryCode || match.homeCountryCode || homeLineupMeta.countryCode,
        players: homePlayers,
        substitutes: homeSubs
      },
      away: {
        ...svFifaEmptyLineup(match.awayTeam),
        ...(lineups.away || {}),
        formation: svFifaCleanDetailValue(lineups.away?.formation),
        coach: svFifaCleanDetailValue(lineups.away?.coach),
        logo: lineups.away?.logo || match.awayLogo || awayLineupMeta.logo,
        flag: lineups.away?.flag || match.awayFlag || awayLineupMeta.flag,
        countryCode: lineups.away?.countryCode || match.awayCountryCode || awayLineupMeta.countryCode,
        players: awayPlayers,
        substitutes: awaySubs
      }
    },
    events: svFifaFilterEvents(payload?.events).slice(0, 80).map(enrichEvent),
    standings: svFifaFilterStandings(payload?.standings).slice(0, 48).map(enrichStanding),
    message: String(payload?.message || ''),
    apiFootballConfigured: !!svFifaApiFootballKey(),
    dataIntegrity: {
      fakeDataUsed: false,
      cardsAreProviderOnly: true,
      statsAreProviderOnly: true
    },
    providerLimitations: []
  };
  detail.capabilities = svFifaBuildDetailCapabilities(detail);
  detail.provider = svFifaProviderMeta(source);
  if (detail.ok && detail.provider.limited && (!detail.capabilities.lineups || !detail.capabilities.formations)) {
    detail.providerLimitations.push(FIFA_LIVE_DETAIL_PROVIDER_LIMITED);
    if (!detail.message && !svFifaMatchDetailHasData(detail)) detail.message = FIFA_LIVE_DETAIL_PROVIDER_LIMITED;
  }
  if (detail.ok && !svFifaMatchDetailHasData(detail) && !detail.message) detail.message = FIFA_LIVE_DETAIL_UNAVAILABLE;
  if (!detail.ok && !detail.message) detail.message = FIFA_LIVE_DETAIL_UNAVAILABLE;
  return detail;
}

function svFifaDetailCacheKey(provider, matchId, league = '') {
  return `${provider || 'auto'}:${String(matchId || '').trim()}:${String(league || '').trim().toLowerCase()}`;
}

function svFifaDetailCacheTtl(payload) {
  const status = String(payload?.match?.status || '').toUpperCase();
  return (status === 'LIVE' || status === 'HT') ? FIFA_LIVE_DETAIL_FAST_CACHE_MS : FIFA_LIVE_DETAIL_SLOW_CACHE_MS;
}

function svFifaCacheMatchDetail(key, payload) {
  if (!payload || !payload.ok || payload.source === 'none') return payload;
  fifaMatchDetailCache.set(key, {
    expiresAt: Date.now() + svFifaDetailCacheTtl(payload),
    payload
  });
  return payload;
}

function svFifaMarkDetailStale(payload) {
  return {
    ...payload,
    generatedAt: new Date().toISOString(),
    source: 'cache',
    stale: true,
    message: payload?.message || 'Showing last real match details while the football provider reconnects.'
  };
}

function svFifaMatchCollections(payload) {
  return [
    ...svFifaArray(payload?.liveMatches),
    ...svFifaArray(payload?.upcomingMatches),
    ...svFifaArray(payload?.recentResults)
  ];
}

function svFifaFindSummaryMatch(matchId) {
  const id = String(matchId || '').trim();
  if (!id) return null;
  const payloads = [fifaLiveCache?.payload, fifaLiveLastGood].filter(Boolean);
  for (const payload of payloads) {
    const found = svFifaMatchCollections(payload).find(match => String(match?.id || '') === id);
    if (found) return found;
  }
  return null;
}

async function svFifaInferProvider(matchId) {
  const cached = svFifaFindSummaryMatch(matchId);
  if (cached?.provider) return cached.provider;
  try {
    const payload = await svGetFifaLivePayload();
    const found = svFifaMatchCollections(payload).find(match => String(match?.id || '') === String(matchId || ''));
    if (found?.provider) return found.provider;
  } catch (e) {
    svFifaWarn('match provider inference failed', e);
  }
  return svFifaApiFootballKey() ? 'api-football' : 'espn';
}

function svFifaStatKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function svFifaFriendlyStatLabel(label, name = '') {
  const key = svFifaStatKey(name || label);
  const labels = {
    ballpossession: 'Possession',
    possessionpct: 'Possession',
    totalshots: 'Shots',
    shotsongoal: 'Shots on target',
    shotsontarget: 'Shots on target',
    cornerkicks: 'Corners',
    woncorners: 'Corners',
    foulscommitted: 'Fouls',
    fouls: 'Fouls',
    yellowcards: 'Yellow Cards',
    redcards: 'Red Cards',
    offsides: 'Offsides',
    goalkeepersaves: 'Saves',
    saves: 'Saves',
    totalpasses: 'Passes',
    accuratepasses: 'Pass Accuracy',
    passaccuracy: 'Pass Accuracy',
    passcompletion: 'Pass Accuracy',
    expectedgoals: 'Expected Goals',
    xg: 'Expected Goals'
  };
  return labels[key] || svFifaTitleCase(label || name);
}

function svFifaProviderStatLabel(label) {
  const key = svFifaStatKey(label);
  const labels = {
    shots: 'Shots',
    totalshots: 'Shots',
    shotsongoal: 'Shots on target',
    shotsontarget: 'Shots on target',
    sog: 'Shots on target',
    possession: 'Possession',
    ballpossession: 'Possession',
    possessionpct: 'Possession',
    passes: 'Passes',
    totalpasses: 'Passes',
    passaccuracy: 'Pass Accuracy',
    passcompletion: 'Pass Accuracy',
    accuratepasses: 'Pass Accuracy',
    fouls: 'Fouls',
    foulscommitted: 'Fouls',
    yellowcards: 'Yellow Cards',
    redcards: 'Red Cards',
    offsides: 'Offsides',
    corners: 'Corners',
    cornerkicks: 'Corners',
    woncorners: 'Corners',
    saves: 'Saves',
    goalkeepersaves: 'Saves',
    expectedgoals: 'Expected Goals',
    xg: 'Expected Goals'
  };
  return labels[key] || '';
}

function svFifaNormalizeStatPairs(homeStats, awayStats) {
  const rows = new Map();
  const add = (side, stats) => {
    svFifaArray(stats).forEach(stat => {
      const rawLabel = svFifaFirst(stat?.label, stat?.type, stat?.displayName, stat?.name);
      const rawName = svFifaFirst(stat?.name, stat?.type, rawLabel);
      const label = svFifaProviderStatLabel(svFifaFriendlyStatLabel(rawLabel, rawName));
      const key = svFifaStatKey(label);
      const value = svFifaCleanDetailValue(svFifaFirst(stat?.displayValue, stat?.value));
      if (!label || !value) return;
      const row = rows.get(key) || { label, home: '', away: '', source: 'provider' };
      row[side] = value;
      rows.set(key, row);
    });
  };
  add('home', homeStats);
  add('away', awayStats);
  const order = ['shots', 'shotsontarget', 'possession', 'passes', 'passaccuracy', 'fouls', 'yellowcards', 'redcards', 'offsides', 'corners', 'saves', 'expectedgoals'];
  return [
    ...order.map(key => rows.get(key)).filter(Boolean),
    ...Array.from(rows.entries()).filter(([key]) => !order.includes(key)).map(([, row]) => row)
  ].filter(row => row.home || row.away);
}

function svFifaMatchMinute(elapsed, extra) {
  const base = svFifaNumber(elapsed, null);
  const added = svFifaNumber(extra, null);
  if (base === null) return '';
  return `${base}${added ? `+${added}` : ''}'`;
}

function svFifaNormalizeApiFootballPlayer(entry, starter) {
  const player = entry?.player || entry || {};
  const name = svFifaCleanDetailValue(svFifaFirst(player.name, player.displayName, player.fullName));
  if (!name) return null;
  return {
    number: svFifaNumber(svFifaFirst(player.number, player.jersey), ''),
    name,
    position: svFifaCleanDetailValue(svFifaFirst(player.pos, player.position, player.grid)),
    starter: !!starter,
    captain: !!player.captain
  };
}

function svFifaNormalizeApiFootballLineups(raw, match) {
  const blocks = svFifaArray(raw?.response);
  const findBlock = (side, teamName) => blocks.find(block => {
    const name = String(block?.team?.name || '').toLowerCase();
    return name && name === String(teamName || '').toLowerCase();
  }) || blocks[side === 'home' ? 0 : 1] || {};
  const toLineup = (block, fallbackTeam) => ({
    team: String(block?.team?.name || fallbackTeam || ''),
    logo: svFifaProviderLogo(block?.team),
    flag: svFifaTeamMeta(block?.team?.name || fallbackTeam, block?.team).flag,
    countryCode: svFifaTeamMeta(block?.team?.name || fallbackTeam, block?.team).countryCode,
    formation: svFifaCleanDetailValue(block?.formation),
    coach: svFifaCleanDetailValue(block?.coach?.name),
    players: svFifaArray(block?.startXI).map(item => svFifaNormalizeApiFootballPlayer(item, true)).filter(Boolean),
    substitutes: svFifaArray(block?.substitutes).map(item => svFifaNormalizeApiFootballPlayer(item, false)).filter(Boolean)
  });
  return {
    home: toLineup(findBlock('home', match.homeTeam), match.homeTeam),
    away: toLineup(findBlock('away', match.awayTeam), match.awayTeam)
  };
}

function svFifaNormalizeApiFootballStatistics(raw, match) {
  const blocks = svFifaArray(raw?.response);
  const homeBlock = blocks.find(block => String(block?.team?.name || '').toLowerCase() === String(match.homeTeam || '').toLowerCase()) || blocks[0] || {};
  const awayBlock = blocks.find(block => String(block?.team?.name || '').toLowerCase() === String(match.awayTeam || '').toLowerCase()) || blocks[1] || {};
  return svFifaNormalizeStatPairs(homeBlock.statistics, awayBlock.statistics);
}

function svFifaNormalizeApiFootballEvents(raw) {
  return svFifaArray(raw?.response).map(event => ({
    minute: svFifaMatchMinute(event?.time?.elapsed, event?.time?.extra),
    team: String(event?.team?.name || ''),
    teamLogo: svFifaProviderLogo(event?.team),
    teamFlag: svFifaTeamMeta(event?.team?.name, event?.team).flag,
    teamCountryCode: svFifaTeamMeta(event?.team?.name, event?.team).countryCode,
    player: svFifaCleanDetailValue(event?.player?.name),
    type: svFifaCleanDetailValue(svFifaFirst(event?.type, event?.detail)),
    detail: svFifaCleanDetailValue(svFifaFirst(event?.detail, event?.comments, event?.assist?.name))
  })).filter(event => event.type || event.player || event.team);
}

async function svFifaFetchApiFootballDetail(matchId) {
  const apiKey = svFifaApiFootballKey();
  if (!apiKey) return svFifaEmptyMatchDetail(matchId, FIFA_LIVE_DETAIL_UNAVAILABLE, 'none');
  const headers = svFifaApiFootballHeaders(apiKey);
  const fixture = await svFifaFetchJson(`${FIFA_LIVE_API_FOOTBALL_BASE}/fixtures?id=${encodeURIComponent(matchId)}`, { headers });
  const fixtureItem = svFifaArray(fixture?.response)[0];
  if (!fixtureItem) return svFifaEmptyMatchDetail(matchId, FIFA_LIVE_DETAIL_UNAVAILABLE, 'api-football');
  const match = svFifaNormalizeApiFootballFixture(fixtureItem);
  const league = fixtureItem?.league || {};
  const season = svFifaNumber(league.season, new Date(match.startTime || Date.now()).getUTCFullYear());
  const urls = [
    svFifaFetchJson(`${FIFA_LIVE_API_FOOTBALL_BASE}/fixtures/statistics?fixture=${encodeURIComponent(match.id)}`, { headers }),
    svFifaFetchJson(`${FIFA_LIVE_API_FOOTBALL_BASE}/fixtures/lineups?fixture=${encodeURIComponent(match.id)}`, { headers }),
    svFifaFetchJson(`${FIFA_LIVE_API_FOOTBALL_BASE}/fixtures/events?fixture=${encodeURIComponent(match.id)}`, { headers })
  ];
  if (league.id && season) urls.push(svFifaFetchJson(`${FIFA_LIVE_API_FOOTBALL_BASE}/standings?league=${encodeURIComponent(league.id)}&season=${encodeURIComponent(season)}`, { headers }));
  const [statsRes, lineupsRes, eventsRes, standingsRes] = await Promise.allSettled(urls);
  const detail = svFifaFinalizeMatchDetail({
    ok: true,
    match,
    overview: {
      referee: fixtureItem?.fixture?.referee || '',
      weather: '',
      attendance: '',
      round: league.round || '',
      leg: ''
    },
    statistics: statsRes.status === 'fulfilled' ? svFifaNormalizeApiFootballStatistics(statsRes.value, match) : [],
    lineups: lineupsRes.status === 'fulfilled' ? svFifaNormalizeApiFootballLineups(lineupsRes.value, match) : {
      home: svFifaEmptyLineup(match.homeTeam),
      away: svFifaEmptyLineup(match.awayTeam)
    },
    events: eventsRes.status === 'fulfilled' ? svFifaNormalizeApiFootballEvents(eventsRes.value) : [],
    standings: standingsRes?.status === 'fulfilled' ? svFifaNormalizeApiFootballStandings(standingsRes.value) : []
  }, 'api-football');
  return detail;
}

function svFifaNormalizeEspnPlayer(entry) {
  const athlete = entry?.athlete || {};
  const name = svFifaCleanDetailValue(svFifaFirst(athlete.displayName, athlete.fullName, athlete.shortName));
  if (!name) return null;
  return {
    number: svFifaNumber(svFifaFirst(entry?.jersey, athlete.jersey), ''),
    name,
    position: svFifaCleanDetailValue(svFifaFirst(entry?.position?.abbreviation, entry?.position?.displayName, entry?.position?.name)),
    starter: !!entry?.starter,
    captain: !!entry?.captain
  };
}

function svFifaNormalizeEspnLineups(raw, match) {
  const rosters = svFifaArray(raw?.rosters);
  const find = side => rosters.find(item => item?.homeAway === side) || rosters[side === 'home' ? 0 : 1] || {};
  const toLineup = (block, fallbackTeam) => {
    const roster = svFifaArray(block?.roster).map(svFifaNormalizeEspnPlayer).filter(Boolean);
    return {
      team: String(block?.team?.displayName || fallbackTeam || ''),
      logo: svFifaProviderLogo(block?.team),
      flag: svFifaTeamMeta(block?.team?.displayName || fallbackTeam, block?.team).flag,
      countryCode: svFifaTeamMeta(block?.team?.displayName || fallbackTeam, block?.team).countryCode,
      formation: svFifaCleanDetailValue(block?.formation),
      coach: svFifaCleanDetailValue(svFifaFirst(block?.coach?.displayName, block?.coach?.name)),
      players: roster.filter(player => player.starter),
      substitutes: roster.filter(player => !player.starter)
    };
  };
  return {
    home: toLineup(find('home'), match.homeTeam),
    away: toLineup(find('away'), match.awayTeam)
  };
}

function svFifaNormalizeEspnStatistics(raw) {
  const teams = svFifaArray(raw?.boxscore?.teams);
  const home = teams.find(team => team?.homeAway === 'home') || teams[0] || {};
  const away = teams.find(team => team?.homeAway === 'away') || teams[1] || {};
  return svFifaNormalizeStatPairs(home.statistics, away.statistics);
}

function svFifaNormalizeEspnEvents(raw) {
  const events = svFifaArray(raw?.keyEvents).length
    ? svFifaArray(raw?.keyEvents)
    : svFifaArray(raw?.commentary).map(item => item?.play || item);
  const important = /goal|card|substitution|kickoff|half|regular time|penalty/i;
  return events.map(event => {
    const type = svFifaCleanDetailValue(svFifaFirst(event?.type?.text, event?.type?.description, event?.type?.type));
    if (!type || !important.test(type)) return null;
    const participants = svFifaArray(event?.participants);
    return {
      minute: svFifaCleanDetailValue(svFifaFirst(event?.clock?.displayValue, event?.time?.displayValue)),
      team: String(event?.team?.displayName || ''),
      teamLogo: svFifaProviderLogo(event?.team),
      teamFlag: svFifaTeamMeta(event?.team?.displayName, event?.team).flag,
      teamCountryCode: svFifaTeamMeta(event?.team?.displayName, event?.team).countryCode,
      player: svFifaCleanDetailValue(participants[0]?.athlete?.displayName),
      type,
      detail: svFifaCleanDetailValue(svFifaFirst(event?.shortText, event?.text))
    };
  }).filter(Boolean);
}

function svFifaEspnStandingStat(entry, keys) {
  const wanted = new Set(keys.map(svFifaStatKey));
  const stats = svFifaArray(entry?.stats);
  const found = stats.find(stat => {
    const names = [stat?.name, stat?.displayName, stat?.shortDisplayName, stat?.abbreviation, stat?.type]
      .map(svFifaStatKey)
      .filter(Boolean);
    return names.some(name => wanted.has(name));
  });
  return svFifaCleanDetailValue(svFifaFirst(found?.displayValue, found?.value));
}

function svFifaNormalizeEspnStandings(raw) {
  const standings = raw?.standings || {};
  const rows = svFifaArray(standings.groups).flatMap(group => {
    const groupName = String(group?.header || standings.header || '');
    return svFifaArray(group?.standings?.entries).map((entry, index) => ({
      group: groupName,
      rank: svFifaNumber(svFifaEspnStandingStat(entry, ['rank', 'rk', 'position']), index + 1),
      team: String(entry?.team?.displayName || entry?.team || ''),
      logo: svFifaProviderLogo(entry?.team),
      flag: svFifaTeamMeta(entry?.team?.displayName || entry?.team, entry?.team).flag,
      countryCode: svFifaTeamMeta(entry?.team?.displayName || entry?.team, entry?.team).countryCode,
      played: svFifaEspnStandingStat(entry, ['gamesplayed', 'gamesPlayed', 'played', 'matchesplayed', 'mp', 'gp']),
      wins: svFifaEspnStandingStat(entry, ['wins', 'w']),
      draws: svFifaEspnStandingStat(entry, ['draws', 'ties', 'd', 't']),
      losses: svFifaEspnStandingStat(entry, ['losses', 'l']),
      goalDifference: svFifaEspnStandingStat(entry, ['goaldifference', 'goalDifference', 'goalsdiff', 'gd', 'pointdifferential', 'pd']),
      points: svFifaEspnStandingStat(entry, ['points', 'pts'])
    }));
  });
  return svFifaFilterStandings(rows);
}

async function svFifaFetchEspnDetail(matchId, league = '') {
  const leagues = [...new Set([league, 'fifa.world', 'all'].map(item => String(item || '').trim()).filter(Boolean))];
  let raw = null;
  let lastErr = null;
  let usedLeague = leagues[0] || 'fifa.world';
  for (const slug of leagues) {
    try {
      raw = await svFifaFetchJson(`${FIFA_LIVE_ESPN_BASE}/${encodeURIComponent(slug)}/summary?event=${encodeURIComponent(matchId)}`, {
        timeout: FIFA_LIVE_UPSTREAM_TIMEOUT_MS,
        maxBytes: 5 * 1024 * 1024
      });
      usedLeague = slug;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!raw) throw lastErr || new Error('ESPN match detail unavailable');
  const header = raw?.header || {};
  if (!header?.id && !svFifaArray(header?.competitions).length) return svFifaEmptyMatchDetail(matchId, FIFA_LIVE_DETAIL_UNAVAILABLE, 'espn');
  const match = svFifaNormalizeEspnEvent(header, usedLeague);
  match.id = String(match.id || matchId);
  const competition = header?.competitions?.[0] || {};
  const detail = svFifaFinalizeMatchDetail({
    ok: true,
    match,
    overview: {
      referee: svFifaArray(competition?.officials).find(item => /referee/i.test(item?.position?.name || item?.role || ''))?.displayName || '',
      weather: svFifaCleanDetailValue(raw?.gameInfo?.weather?.displayValue),
      attendance: svFifaCleanDetailValue(competition?.attendance),
      round: svFifaCleanDetailValue(svFifaFirst(competition?.altGameNote, header?.season?.slug)),
      leg: ''
    },
    statistics: svFifaNormalizeEspnStatistics(raw),
    lineups: svFifaNormalizeEspnLineups(raw, match),
    events: svFifaNormalizeEspnEvents(raw),
    standings: svFifaNormalizeEspnStandings(raw)
  }, 'espn');
  return detail;
}

async function svGetFifaMatchDetail(provider, matchId, options = {}) {
  const id = String(matchId || '').trim();
  if (!id) return svFifaEmptyMatchDetail('', FIFA_LIVE_DETAIL_UNAVAILABLE, 'none');
  const cleanProvider = svFifaCleanProvider(provider) || await svFifaInferProvider(id);
  const summaryMatch = svFifaFindSummaryMatch(id);
  const league = svFifaCleanDetailValue(options.league || summaryMatch?.leagueSlug);
  const key = svFifaDetailCacheKey(cleanProvider, id, league);
  const cached = fifaMatchDetailCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;
  if (fifaMatchDetailInflight.has(key)) return fifaMatchDetailInflight.get(key);

  const fetcher = cleanProvider === 'api-football'
    ? () => svFifaFetchApiFootballDetail(id)
    : () => svFifaFetchEspnDetail(id, league);

  const inFlight = fetcher()
    .then(payload => {
      if (payload?.ok) return svFifaCacheMatchDetail(key, payload);
      if (cached?.payload?.ok) return svFifaMarkDetailStale(cached.payload);
      return payload || svFifaEmptyMatchDetail(id, FIFA_LIVE_DETAIL_UNAVAILABLE, 'none');
    })
    .catch(err => {
      svFifaWarn(`${cleanProvider || 'football'} match detail failed`, err);
      if (cached?.payload?.ok) return svFifaMarkDetailStale(cached.payload);
      return svFifaEmptyMatchDetail(id, FIFA_LIVE_DETAIL_UNAVAILABLE, 'none');
    })
    .finally(() => { fifaMatchDetailInflight.delete(key); });

  fifaMatchDetailInflight.set(key, inFlight);
  return inFlight;
}

async function svSendFifaMatchDetail(req, res, provider, matchId) {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  try {
    res.json(await svGetFifaMatchDetail(provider, matchId, { league: req.query?.league }));
  } catch (e) {
    svFifaWarn('match detail endpoint response failed', e);
    res.json(svFifaEmptyMatchDetail(matchId, FIFA_LIVE_DETAIL_UNAVAILABLE, 'none'));
  }
}

app.get('/api/fifa-live/match/:provider/:matchId', async (req, res) => {
  await svSendFifaMatchDetail(req, res, req.params.provider, req.params.matchId);
});

app.get('/api/fifa-live/match/:matchId', async (req, res) => {
  await svSendFifaMatchDetail(req, res, '', req.params.matchId);
});

app.get('/api/fifa-live/news', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  try {
    res.json(await svGetFifaNewsPayload());
  } catch (e) {
    svFifaWarn('news endpoint response failed', e);
    if (fifaLiveNewsLastGood) {
      res.json(svFifaMarkNewsStale(fifaLiveNewsLastGood));
      return;
    }
    res.json(svFifaNewsPayload([], 'none'));
  }
});

app.get('/api/fifa-live', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  try {
    const payload = await svGetFifaLivePayload({ allowStale: true });
    res.setHeader('X-StreamVault-Fifa-Cache', payload?.stale ? 'stale-refreshing' : 'fresh');
    res.json(payload);
  } catch (e) {
    svFifaWarn('endpoint response failed', e);
    res.json(svFifaEmptyPayload(FIFA_LIVE_REAL_UNAVAILABLE, false, 'none'));
  }
});

const SV_LIVE_DEBUG = process.env.SV_LIVE_DEBUG === '1';
const SV_LIVE_PLAYLIST_MAX_BYTES = 1024 * 1024;
const SV_LIVE_MEDIA_SEGMENT_WINDOW = Math.max(5, Number(process.env.SV_LIVE_MEDIA_SEGMENT_WINDOW || 6));
const SV_LIVE_FAST_MEDIA_SEGMENT_WINDOW = Math.max(2, Number(process.env.SV_LIVE_FAST_MEDIA_SEGMENT_WINDOW || 3));
const SV_LIVE_PLAYLIST_TIMEOUT_MS = Math.max(2500, Number(process.env.SV_LIVE_PLAYLIST_TIMEOUT_MS || 7000));
const SV_LIVE_FAST_PLAYLIST_TIMEOUT_MS = Math.max(2000, Number(process.env.SV_LIVE_FAST_PLAYLIST_TIMEOUT_MS || 4500));
const SV_LIVE_SEGMENT_CACHE_TTL_MS = Math.max(15000, Number(process.env.SV_LIVE_SEGMENT_CACHE_TTL_MS || 60000));
const SV_LIVE_SEGMENT_CACHE_MAX_PER_CHANNEL = Math.max(4, Number(process.env.SV_LIVE_SEGMENT_CACHE_MAX_PER_CHANNEL || 10));
const SV_LIVE_SEGMENT_CACHE_MAX_BYTES = Math.max(32 * 1024 * 1024, Number(process.env.SV_LIVE_SEGMENT_CACHE_MAX_BYTES || 192 * 1024 * 1024));
const SV_LIVE_SEGMENT_CACHE_MAX_SEGMENT_BYTES = Math.max(1024 * 1024, Number(process.env.SV_LIVE_SEGMENT_CACHE_MAX_SEGMENT_BYTES || 20 * 1024 * 1024));
const SV_LIVE_SEGMENT_ADVANCE_RETRIES = Math.max(0, Number(process.env.SV_LIVE_SEGMENT_ADVANCE_RETRIES || 5));
const SV_LIVE_RELAY_DIR = path.join(__dirname, 'cache', 'live-relay');
const SV_LIVE_RELAY_IDLE_MS = Math.max(5 * 60 * 1000, Number(process.env.SV_LIVE_RELAY_IDLE_MS || 10 * 60 * 1000));
const SV_LIVE_RELAY_STALE_MS = Math.max(15000, Number(process.env.SV_LIVE_RELAY_STALE_MS || 30000));
const SV_LIVE_RELAY_STARTUP_MS = Math.max(10000, Number(process.env.SV_LIVE_RELAY_STARTUP_MS || 25000));
const SV_LIVE_RELAY_SEGMENT_WAIT_MS = Math.max(500, Number(process.env.SV_LIVE_RELAY_SEGMENT_WAIT_MS || 2500));
const svLiveHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 32, keepAliveMsecs: 10000 });
const svLiveHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32, keepAliveMsecs: 10000 });
const svLiveSegmentCache = new Map();
const svLiveSegmentInflight = new Map();
let svLiveSegmentCacheBytes = 0;

function svLiveDebugLog(message, data = {}) {
  if (!SV_LIVE_DEBUG) return;
  console.log('[Live Debug]', message, data);
}

function svLiveHeaders(sourceUrl) {
  let origin = '';
  try { origin = new URL(sourceUrl).origin; } catch {}
  return {
    'User-Agent': 'Mozilla/5.0 StreamVault-LiveTV/1.0',
    'Accept': '*/*',
    ...(origin ? { 'Referer': origin + '/', 'Origin': origin } : {})
  };
}

function svLiveSegmentContentType(sourceUrl, upstreamType) {
  const type = String(upstreamType || '').trim();
  if (/\.m4s(?:$|[?#])/i.test(sourceUrl)) return type || 'video/iso.segment';
  if (/\.ts(?:$|[?#])/i.test(sourceUrl)) return 'video/MP2T';
  return type || 'video/MP2T';
}

function svLiveSetSegmentHeaders(res, meta = {}, cacheState = 'MISS') {
  if (res.headersSent) return false;
  const status = meta.status || 200;
  res.status(status);
  res.setHeader('Content-Type', meta.contentType || 'video/MP2T');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type, X-SV-Upstream-Status, X-SV-Upstream-Ms, X-SV-Live-Cache');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-SV-Live-Cache', cacheState);
  res.setHeader('X-SV-Upstream-Status', String(meta.upstreamStatus || status));
  res.setHeader('X-SV-Upstream-Ms', String(meta.upstreamMs ?? 0));
  if (meta.acceptRanges) res.setHeader('Accept-Ranges', meta.acceptRanges);
  if (meta.contentLength) res.setHeader('Content-Length', meta.contentLength);
  if (meta.contentRange) res.setHeader('Content-Range', meta.contentRange);
  return true;
}

function svLivePruneSegmentCache() {
  const now = Date.now();
  for (const [key, entry] of svLiveSegmentCache) {
    if (now - entry.createdAt > SV_LIVE_SEGMENT_CACHE_TTL_MS) {
      svLiveSegmentCache.delete(key);
      svLiveSegmentCacheBytes -= entry.bytes || 0;
    }
  }

  const byChannel = new Map();
  for (const [key, entry] of svLiveSegmentCache) {
    if (!byChannel.has(entry.channelId)) byChannel.set(entry.channelId, []);
    byChannel.get(entry.channelId).push([key, entry]);
  }
  for (const entries of byChannel.values()) {
    entries.sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
    for (const [key, entry] of entries.slice(SV_LIVE_SEGMENT_CACHE_MAX_PER_CHANNEL)) {
      if (svLiveSegmentCache.delete(key)) svLiveSegmentCacheBytes -= entry.bytes || 0;
    }
  }

  if (svLiveSegmentCacheBytes > SV_LIVE_SEGMENT_CACHE_MAX_BYTES) {
    const entries = [...svLiveSegmentCache.entries()].sort((a, b) =>
      (a[1].lastAccess || a[1].createdAt || 0) - (b[1].lastAccess || b[1].createdAt || 0)
    );
    for (const [key, entry] of entries) {
      if (svLiveSegmentCacheBytes <= SV_LIVE_SEGMENT_CACHE_MAX_BYTES) break;
      if (svLiveSegmentCache.delete(key)) svLiveSegmentCacheBytes -= entry.bytes || 0;
    }
  }
  if (svLiveSegmentCacheBytes < 0) svLiveSegmentCacheBytes = 0;
}

function svLiveStoreSegment(channelId, sourceUrl, meta, body) {
  if (!Buffer.isBuffer(body) || !body.length) return;
  if (body.length > SV_LIVE_SEGMENT_CACHE_MAX_SEGMENT_BYTES) return;
  if ((meta.status || 200) < 200 || (meta.status || 200) >= 300) return;

  const key = sourceUrl;
  const prev = svLiveSegmentCache.get(key);
  if (prev) svLiveSegmentCacheBytes -= prev.bytes || 0;
  const entry = {
    channelId,
    sourceUrl,
    body,
    bytes: body.length,
    createdAt: Date.now(),
    lastAccess: Date.now(),
    meta: {
      ...meta,
      contentLength: String(body.length),
      upstreamMs: meta.upstreamMs || 0
    }
  };
  svLiveSegmentCache.set(key, entry);
  svLiveSegmentCacheBytes += body.length;
  svLivePruneSegmentCache();
}

function svLiveServeCachedSegment(sourceUrl, res) {
  const entry = svLiveSegmentCache.get(sourceUrl);
  if (!entry) return false;
  if (Date.now() - entry.createdAt > SV_LIVE_SEGMENT_CACHE_TTL_MS) {
    svLiveSegmentCache.delete(sourceUrl);
    svLiveSegmentCacheBytes -= entry.bytes || 0;
    return false;
  }
  entry.lastAccess = Date.now();
  svLiveSetSegmentHeaders(res, entry.meta, 'HIT');
  res.end(entry.body);
  return true;
}

function svLiveInflightAddClient(inflight, res, cacheState = 'DEDUP') {
  if (res.destroyed || res.writableEnded) return;
  inflight.clients.add(res);
  res.on('close', () => {
    inflight.clients.delete(res);
    if (!inflight.done && inflight.clients.size === 0) {
      try { inflight.request?.destroy(); } catch {}
    }
  });
  if (inflight.meta && !res.headersSent) {
    svLiveSetSegmentHeaders(res, inflight.meta, cacheState);
    for (const chunk of inflight.chunks) {
      if (res.destroyed || res.writableEnded) break;
      res.write(chunk);
    }
  }
}

function svAssertHttpUrl(raw) {
  const u = new URL(String(raw || '').trim());
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Unsupported live URL');
  return u.href;
}

function svResolveUrl(base, relative) {
  return new URL(String(relative || '').trim(), base).href;
}

function svLiveProxyPath(channelId, upstreamUrl, options = {}) {
  const isPlaylist = /\.m3u8(?:$|[?#])/i.test(upstreamUrl);
  return isPlaylist
    ? `/live/${encodeURIComponent(channelId)}/playlist.m3u8?src=${encodeURIComponent(upstreamUrl)}${options.fast ? '&fast=1' : ''}`
    : `/live/${encodeURIComponent(channelId)}/segment?url=${encodeURIComponent(upstreamUrl)}`;
}

function svRewriteLiveUri(channelId, baseUrl, uri, options = {}) {
  return svLiveProxyPath(channelId, svResolveUrl(baseUrl, uri), options);
}

async function svFetchBuffer(url, options = {}) {
  return new Promise((resolve, reject) => {
    let sourceUrl;
    try { sourceUrl = svAssertHttpUrl(url); } catch (e) { return reject(e); }

    const startedAt = Date.now();
    const mod = sourceUrl.startsWith('https://') ? https : http;
    const timeoutMs = Math.max(1500, Number(options.timeoutMs || 15000));
    const req = mod.get(sourceUrl, {
      timeout: timeoutMs,
      headers: svLiveHeaders(sourceUrl),
      agent: sourceUrl.startsWith('https://') ? svLiveHttpsAgent : svLiveHttpAgent,
    }, res => {
      const chunks = [];
      let total = 0;
      res.on('data', c => {
        total += c.length;
        if (total > SV_LIVE_PLAYLIST_MAX_BYTES) {
          req.destroy(new Error('Playlist too large'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
        finalUrl: sourceUrl,
        elapsedMs: Date.now() - startedAt
      }));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Timeout')); });
  });
}

function rewriteM3u8(content, channelId, sourceBaseUrl, options = {}) {
  return String(content || '').replace(/\r\n/g, '\n').split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith('#')) {
      return line.replace(/\bURI=(?:"([^"]+)"|([^,\s]+))/gi, (_, quotedUri, bareUri) =>
        `URI="${svRewriteLiveUri(channelId, sourceBaseUrl, quotedUri || bareUri, options)}"`
      );
    }

    return svRewriteLiveUri(channelId, sourceBaseUrl, trimmed, options);
  }).join('\n');
}

function svAddFastLiveStart(content) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  if (lines.some(line => line.includes('#EXT-X-START'))) return lines.join('\n');
  if (lines.some(line => line.includes('#EXT-X-STREAM-INF'))) return lines.join('\n');
  const insertAt = Math.max(1, lines.findIndex((line, index) => index > 0 && !line.trim().startsWith('#')) - 1);
  lines.splice(insertAt > 0 ? insertAt : 1, 0, '#EXT-X-START:TIME-OFFSET=-6,PRECISE=NO');
  return lines.join('\n');
}

function svLiveSourceCandidates(ch, requestedSource) {
  const candidates = [];
  const add = value => {
    const text = String(value || '').trim();
    if (text && !candidates.includes(text)) candidates.push(text);
  };
  if (requestedSource) add(requestedSource);
  else {
    add(ch?.url);
    if (Array.isArray(ch?.fallbackUrls)) ch.fallbackUrls.forEach(add);
  }
  return candidates;
}

function svTrimLiveMediaPlaylist(content, maxSegments = SV_LIVE_MEDIA_SEGMENT_WINDOW) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  if (lines.some(line => line.includes('#EXT-X-STREAM-INF'))) return lines.join('\n');
  if (lines.some(line => /^#EXT-X-(KEY|MAP)\b/i.test(line.trim()))) return lines.join('\n');

  const segmentTag = line => /^#EXT(?:INF|-X-PROGRAM-DATE-TIME|-X-BYTERANGE|-X-DISCONTINUITY)/i.test(line.trim());
  const prefix = [];
  const suffix = [];
  const segments = [];
  let pending = [];
  let sawSegment = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      if (segmentTag(line)) pending.push(line);
      else if (sawSegment) suffix.push(line);
      else prefix.push(line);
      continue;
    }

    sawSegment = true;
    segments.push([...pending, line]);
    pending = [];
  }

  if (segments.length <= maxSegments) return lines.join('\n');

  const dropped = segments.length - maxSegments;
  const adjustedPrefix = prefix.map(line =>
    line.replace(/^#EXT-X-MEDIA-SEQUENCE:(\d+)/i, (_, n) => `#EXT-X-MEDIA-SEQUENCE:${Number(n) + dropped}`)
  );

  return [...adjustedPrefix, ...segments.slice(-maxSegments).flat(), ...suffix].join('\n');
}


async function svFetchM3u8Text(url, options = {}) {
  const result = await svFetchBuffer(url, options);
  const text = result.body.toString('utf8');

  if (result.status < 200 || result.status >= 300) {
    throw new Error('Upstream playlist HTTP ' + result.status);
  }

  if (!text.includes('#EXTM3U')) {
    throw new Error('Upstream is not an M3U8 playlist');
  }

  return {
    status: result.status,
    url: result.finalUrl || url,
    text,
    bytes: result.body.length,
    elapsedMs: result.elapsedMs || 0
  };
}

app.get('/live/:channelId/playlist.m3u8', async (req, res) => {
  const ch = channels.find(c => c.id === req.params.channelId);
  const requestedSource = String(req.query.src || '').trim();
  const candidates = svLiveSourceCandidates(ch, requestedSource);
  const fast = req.query.fast !== '0';

  const ip2 = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  tracker.trackStreamStart(ip2, req.params.channelId, ch?.name || req.params.channelId, 'live', req.headers['user-agent'] || '');

  if (!candidates.length) return res.status(404).send('Channel URL missing');

  let lastError = null;
  try {
    let fetched = null;
    for (const candidate of candidates) {
      const attempts = fast ? 2 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          fetched = await svFetchM3u8Text(candidate, { timeoutMs: fast ? SV_LIVE_FAST_PLAYLIST_TIMEOUT_MS : SV_LIVE_PLAYLIST_TIMEOUT_MS });
          break;
        } catch (e) {
          lastError = e;
          svLiveDebugLog('playlist candidate failed', { channel: req.params.channelId, candidate, attempt: attempt + 1, error: e.message });
        }
      }
      if (fetched) break;
    }
    if (!fetched) throw lastError || new Error('No live playlist candidates worked');

    const isMaster = fetched.text.includes('#EXT-X-STREAM-INF');
    let playlistText = isMaster ? fetched.text : svTrimLiveMediaPlaylist(fetched.text, fast ? SV_LIVE_FAST_MEDIA_SEGMENT_WINDOW : SV_LIVE_MEDIA_SEGMENT_WINDOW);
    if (fast && !isMaster) playlistText = svAddFastLiveStart(playlistText);
    const rewritten = rewriteM3u8(playlistText, req.params.channelId, fetched.url, { fast });

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-SV-Live-Playlist-Type', isMaster ? 'master' : 'media');
    if (!isMaster) res.setHeader('X-SV-Live-Segment-Window', String(fast ? SV_LIVE_FAST_MEDIA_SEGMENT_WINDOW : SV_LIVE_MEDIA_SEGMENT_WINDOW));
    res.setHeader('X-SV-Upstream-Status', String(fetched.status || 0));
    res.setHeader('X-SV-Upstream-Ms', String(fetched.elapsedMs || 0));
    svLiveDebugLog('playlist', {
      channel: req.params.channelId,
      type: isMaster ? 'master' : 'media',
      source: fetched.url,
      fetched: fetched.url,
      status: fetched.status,
      ms: fetched.elapsedMs,
      bytes: fetched.bytes
    });
    res.send(rewritten);
  } catch (e) {
    console.error('[Live] Playlist fetch error for ' + req.params.channelId + ':', e.message);
    res.status(502).send('Cannot reach channel source: ' + e.message);
  }
});

function svLiveAdvanceDatedSegmentUrl(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    const match = parsed.pathname.match(/^(.*\/)(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})-(\d{5})\.([a-z0-9]+)$/i);
    if (!match) return '';
    const [, prefix, yyyy, mm, dd, hh, min, ss, durText, ext] = match;
    const durationMs = Math.max(1000, Math.round((Number(durText) || 6000) / 1000) * 1000);
    const next = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss)));
    if (Number.isNaN(next.getTime())) return '';
    next.setUTCMilliseconds(next.getUTCMilliseconds() + durationMs);
    const pad = value => String(value).padStart(2, '0');
    parsed.pathname = `${prefix}${next.getUTCFullYear()}/${pad(next.getUTCMonth() + 1)}/${pad(next.getUTCDate())}/${pad(next.getUTCHours())}/${pad(next.getUTCMinutes())}/${pad(next.getUTCSeconds())}-${durText}.${ext}`;
    return parsed.href;
  } catch {
    return '';
  }
}

function svStreamLiveSegmentWithRetry(channelId, sourceUrl, res, attempt = 0, redirectsLeft = 5) {
  svLivePruneSegmentCache();
  if (svLiveServeCachedSegment(sourceUrl, res)) return;

  const existing = svLiveSegmentInflight.get(sourceUrl);
  if (existing) {
    svLiveInflightAddClient(existing, res, 'DEDUP');
    return;
  }

  const mod = sourceUrl.startsWith('https://') ? https : http;
  const startedAt = Date.now();
  const chunks = [];
  const inflight = {
    channelId,
    sourceUrl,
    clients: new Set(),
    chunks,
    cachedBytes: 0,
    meta: null,
    request: null,
    done: false
  };
  svLiveSegmentInflight.set(sourceUrl, inflight);
  svLiveInflightAddClient(inflight, res, 'MISS');

  const retryClients = (nextUrl = sourceUrl, nextAttempt = attempt + 1, delay = 250) => {
    const clients = [...inflight.clients].filter(client => !client.destroyed && !client.writableEnded);
    inflight.clients.clear();
    inflight.done = true;
    svLiveSegmentInflight.delete(sourceUrl);
    setTimeout(() => {
      for (const client of clients) {
        if (!client.headersSent) svStreamLiveSegmentWithRetry(channelId, nextUrl, client, nextAttempt, redirectsLeft);
        else {
          try { client.destroy(); } catch {}
        }
      }
    }, delay);
  };

  const failClients = (status, message, err) => {
    inflight.done = true;
    svLiveSegmentInflight.delete(sourceUrl);
    for (const client of [...inflight.clients]) {
      if (client.destroyed || client.writableEnded) continue;
      if (!client.headersSent) client.status(status).end(message);
      else {
        try { client.destroy(err); } catch {}
      }
    }
    inflight.clients.clear();
  };

  const proxyReq = mod.get(sourceUrl, {
    timeout: 45000,
    agent: sourceUrl.startsWith('https://') ? svLiveHttpsAgent : svLiveHttpAgent,
    headers: {
      ...svLiveHeaders(sourceUrl),
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache'
    }
  }, proxyRes => {
    const status = proxyRes.statusCode || 502;
    const location = proxyRes.headers.location;

    if ([301, 302, 303, 307, 308].includes(status) && location && redirectsLeft > 0 && !res.headersSent) {
      proxyRes.resume();
      const nextUrl = new URL(location, sourceUrl).href;
      inflight.done = true;
      svLiveSegmentInflight.delete(sourceUrl);
      for (const client of [...inflight.clients]) {
        if (!client.destroyed && !client.writableEnded && !client.headersSent) {
          svStreamLiveSegmentWithRetry(channelId, nextUrl, client, attempt, redirectsLeft - 1);
        }
      }
      inflight.clients.clear();
      return;
    }

    const advancedSegmentUrl = (status === 404 || status === 410) ? svLiveAdvanceDatedSegmentUrl(sourceUrl) : '';
    if (advancedSegmentUrl && attempt < SV_LIVE_SEGMENT_ADVANCE_RETRIES) {
      proxyRes.resume();
      svLiveDebugLog('advance expired segment', { status, attempt: attempt + 1, from: sourceUrl, to: advancedSegmentUrl });
      retryClients(advancedSegmentUrl, attempt + 1, 80);
      return;
    }

    if (status >= 400 && attempt < 2) {
      proxyRes.resume();
      svLiveDebugLog('retry segment status', { status, attempt: attempt + 1, url: sourceUrl });
      retryClients(sourceUrl, attempt + 1);
      return;
    }

    const meta = {
      status,
      contentType: svLiveSegmentContentType(sourceUrl, proxyRes.headers['content-type']),
      acceptRanges: proxyRes.headers['accept-ranges'],
      contentLength: proxyRes.headers['content-length'],
      contentRange: proxyRes.headers['content-range'],
      upstreamStatus: status,
      upstreamMs: Date.now() - startedAt
    };
    inflight.meta = meta;
    for (const client of [...inflight.clients]) svLiveSetSegmentHeaders(client, meta, client === res ? 'MISS' : 'DEDUP');

    svLiveDebugLog('segment', {
      status,
      ms: Date.now() - startedAt,
      bytes: proxyRes.headers['content-length'] || '',
      url: sourceUrl
    });

    proxyRes.on('error', e => {
      console.error('[Live] upstream segment stream error:', e.message);
      failClients(502, 'Segment stream failed', e);
    });

    proxyRes.on('data', chunk => {
      if ((status >= 200 && status < 300) && inflight.cachedBytes + chunk.length <= SV_LIVE_SEGMENT_CACHE_MAX_SEGMENT_BYTES) {
        chunks.push(chunk);
        inflight.cachedBytes += chunk.length;
      }
      for (const client of [...inflight.clients]) {
        if (client.destroyed || client.writableEnded) {
          inflight.clients.delete(client);
          continue;
        }
        client.write(chunk);
      }
    });

    proxyRes.on('end', () => {
      inflight.done = true;
      svLiveSegmentInflight.delete(sourceUrl);
      if (status >= 200 && status < 300 && chunks.length) {
        svLiveStoreSegment(channelId, sourceUrl, meta, Buffer.concat(chunks));
      }
      for (const client of [...inflight.clients]) {
        if (!client.destroyed && !client.writableEnded) client.end();
      }
      inflight.clients.clear();
    });
  });
  inflight.request = proxyReq;

  proxyReq.on('error', e => {
    const advancedSegmentUrl = svLiveAdvanceDatedSegmentUrl(sourceUrl);
    if (advancedSegmentUrl && attempt < SV_LIVE_SEGMENT_ADVANCE_RETRIES) {
      svLiveDebugLog('advance segment after error', { error: e.message, attempt: attempt + 1, from: sourceUrl, to: advancedSegmentUrl });
      retryClients(advancedSegmentUrl, attempt + 1, 80);
      return;
    }

    if (attempt < 2) {
      svLiveDebugLog('retry segment error', { error: e.message, attempt: attempt + 1, url: sourceUrl });
      retryClients(sourceUrl, attempt + 1);
      return;
    }

    console.error('[Live] Segment fetch error:', e.message);
    failClients(502, 'Segment fetch failed', e);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy(new Error('Segment timeout'));
  });
}

app.get('/live/:channelId/segment', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url param');

  let sourceUrl;
  try {
    sourceUrl = svAssertHttpUrl(url);
  } catch (e) {
    return res.status(400).send(e.message);
  }

  svStreamLiveSegmentWithRetry(req.params.channelId, sourceUrl, res, 0);
});



const svLiveRelaySessions = new Map();
const svLiveRelayRetiredDirs = new Map();

function svLiveRelayLog(channelId, message, data = {}) {
  if (channelId !== 'tsports' && !SV_LIVE_DEBUG) return;
  console.log(`[Live Relay:${channelId}] ${message}`, data);
}

function svLiveRelayChannel(channelId) {
  if (!/^[a-z0-9_-]+$/i.test(String(channelId || ''))) return null;
  return channels.find(channel => channel.id === channelId) || null;
}

function svLiveRelayRememberDir(channelId, dir) {
  if (!dir) return;
  const retired = svLiveRelayRetiredDirs.get(channelId) || [];
  retired.push({ dir, expiresAt: Date.now() + 60000 });
  svLiveRelayRetiredDirs.set(channelId, retired.slice(-3));
}

function svLiveRelayPlaylistState(session) {
  try {
    const stat = fs.statSync(session.playlistPath);
    const text = fs.readFileSync(session.playlistPath, 'utf8');
    const lines = text.split(/\r?\n/);
    const segments = lines.map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    const readySegments = segments.filter(file => fs.existsSync(path.join(session.dir, path.basename(file))));
    const normalizedText = lines.map(line => line.trim() && !line.trim().startsWith('#') ? path.basename(line.trim()) : line).join('\n');
    return { ready: text.includes('#EXTM3U') && readySegments.length >= 2, stat, text: normalizedText, segments: readySegments.length };
  } catch {
    return { ready: false, stat: null, text: '', segments: 0 };
  }
}

function svStopLiveRelay(session, reason) {
  if (!session) return;
  if (session.restartTimer) clearTimeout(session.restartTimer);
  session.restartTimer = null;
  try { session.process?.kill('SIGKILL'); } catch {}
  session.process = null;
  svLiveRelayLog(session.channelId, 'stopped', { reason });
}

function svStartLiveRelay(channelId, reason = 'start', candidateIndex = 0) {
  const channel = svLiveRelayChannel(channelId);
  if (!channel) return null;
  const candidates = [channel.url, ...(Array.isArray(channel.fallbackUrls) ? channel.fallbackUrls : [])]
    .map(value => String(value || '').trim())
    .filter((value, index, list) => value && list.indexOf(value) === index);
  if (!candidates.length) return null;

  const previous = svLiveRelaySessions.get(channelId);
  const lastAccess = previous?.lastAccess || Date.now();
  if (previous) {
    svLiveRelayRememberDir(channelId, previous.dir);
    svStopLiveRelay(previous, reason);
  }

  fs.mkdirSync(SV_LIVE_RELAY_DIR, { recursive: true });
  const generation = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const dir = path.join(SV_LIVE_RELAY_DIR, `${channelId}-${generation}`);
  fs.mkdirSync(dir, { recursive: true });
  const playlistPath = path.join(dir, 'index.m3u8');
  const selectedIndex = ((candidateIndex % candidates.length) + candidates.length) % candidates.length;
  const source = candidates[selectedIndex];
  const ffmpegArgs = [
    '-hide_banner', '-loglevel', 'warning', '-nostdin',
    '-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-rw_timeout', '15000000', '-fflags', '+genpts+discardcorrupt',
    '-i', source,
    '-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy', '-max_muxing_queue_size', '2048',
    '-f', 'hls', '-hls_time', '4', '-hls_list_size', '8',
    '-hls_flags', 'delete_segments+omit_endlist+independent_segments+temp_file',
    '-hls_segment_filename', path.join(dir, 'segment_%09d.ts'),
    playlistPath,
  ];
  const relayProcess = spawn(FFMPEG_BIN, ffmpegArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
  const session = {
    channelId,
    channelName: channel.name || channelId,
    process: relayProcess,
    dir,
    playlistPath,
    source,
    candidateIndex: selectedIndex,
    startedAt: Date.now(),
    lastAccess,
    restartTimer: null,
    stderrTail: '',
  };
  svLiveRelaySessions.set(channelId, session);
  svLiveRelayLog(channelId, reason === 'start' ? 'start' : 'restart', { reason, source, pid: relayProcess.pid });

  relayProcess.stderr.on('data', chunk => {
    session.stderrTail = (session.stderrTail + chunk.toString()).slice(-2000);
  });
  relayProcess.on('error', error => {
    svLiveRelayLog(channelId, 'FFmpeg error', { error: error.message });
  });
  relayProcess.on('close', code => {
    if (svLiveRelaySessions.get(channelId) !== session) return;
    session.process = null;
    svLiveRelayLog(channelId, 'FFmpeg exited', { code, stderr: session.stderrTail.trim().slice(-500) });
    if (Date.now() - session.lastAccess < SV_LIVE_RELAY_IDLE_MS) {
      session.restartTimer = setTimeout(() => {
        if (svLiveRelaySessions.get(channelId) === session && !session.process) {
          svStartLiveRelay(channelId, 'dead relay', session.candidateIndex + 1);
        }
      }, 1200);
      session.restartTimer.unref?.();
    }
  });
  return session;
}

function svEnsureLiveRelay(channelId) {
  let session = svLiveRelaySessions.get(channelId);
  if (!session) return svStartLiveRelay(channelId, 'start', 0);
  session.lastAccess = Date.now();
  const state = svLiveRelayPlaylistState(session);
  const processDead = !session.process || session.process.exitCode !== null || session.process.killed;
  const stale = state.stat && Date.now() - state.stat.mtimeMs > SV_LIVE_RELAY_STALE_MS;
  const startupStuck = !state.stat && Date.now() - session.startedAt > SV_LIVE_RELAY_STARTUP_MS;
  if (processDead || stale || startupStuck) {
    const reason = processDead ? 'dead relay' : (stale ? 'stale playlist' : 'startup stalled');
    session = svStartLiveRelay(channelId, reason, session.candidateIndex + 1);
  }
  return session;
}

async function svWaitForLiveRelayPlaylist(session, timeoutMs = SV_LIVE_RELAY_STARTUP_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (svLiveRelaySessions.get(session.channelId) !== session) return null;
    const state = svLiveRelayPlaylistState(session);
    if (state.ready) return state;
    if (!session.process || session.process.exitCode !== null) return null;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return null;
}

async function svWaitForLiveRelaySegment(channelId, filename) {
  const deadline = Date.now() + SV_LIVE_RELAY_SEGMENT_WAIT_MS;
  while (Date.now() <= deadline) {
    const current = svLiveRelaySessions.get(channelId);
    const dirs = [current?.dir, ...(svLiveRelayRetiredDirs.get(channelId) || []).map(entry => entry.dir)].filter(Boolean);
    for (const dir of dirs) {
      const filePath = path.join(dir, filename);
      if (fs.existsSync(filePath)) return filePath;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return '';
}

app.get('/live-relay/:channelId/index.m3u8', async (req, res) => {
  const channelId = req.params.channelId;
  const channel = svLiveRelayChannel(channelId);
  if (!channel) return res.status(404).send('Channel not found');
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  tracker.trackStreamStart(ip, channelId, channel.name || channelId, 'live-relay', req.headers['user-agent'] || '');

  let session = svEnsureLiveRelay(channelId);
  if (!session) return res.status(404).send('Channel URL missing');
  session.lastAccess = Date.now();
  let state = await svWaitForLiveRelayPlaylist(session);
  if (!state) {
    session = svStartLiveRelay(channelId, 'playlist readiness timeout', session.candidateIndex + 1);
    state = session ? await svWaitForLiveRelayPlaylist(session) : null;
  }
  if (!state) {
    svLiveRelayLog(channelId, 'playlist unavailable after retry');
    res.setHeader('Retry-After', '1');
    return res.status(503).send('Live relay is starting');
  }

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-SV-Live-Relay-Segments', String(state.segments));
  res.send(state.text);
});

app.get('/live-relay/:channelId/:segment', async (req, res) => {
  const channelId = req.params.channelId;
  const filename = path.basename(String(req.params.segment || ''));
  if (!svLiveRelayChannel(channelId)) return res.status(404).send('Channel not found');
  if (!/^segment_\d+\.ts$/i.test(filename)) return res.status(400).send('Invalid relay segment');
  const session = svLiveRelaySessions.get(channelId);
  if (session) session.lastAccess = Date.now();
  const filePath = await svWaitForLiveRelaySegment(channelId, filename);
  if (!filePath) {
    svLiveRelayLog(channelId, 'segment missing after wait', { filename });
    return res.status(404).send('Segment not ready');
  }
  res.setHeader('Content-Type', 'video/MP2T');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.sendFile(filePath);
});

setInterval(() => {
  const now = Date.now();
  for (const [channelId, session] of svLiveRelaySessions) {
    if (now - session.lastAccess > SV_LIVE_RELAY_IDLE_MS) {
      svStopLiveRelay(session, 'idle timeout');
      svLiveRelaySessions.delete(channelId);
      svLiveRelayRememberDir(channelId, session.dir);
      continue;
    }
    svEnsureLiveRelay(channelId);
  }
  for (const [channelId, entries] of svLiveRelayRetiredDirs) {
    const keep = [];
    for (const entry of entries) {
      if (entry.expiresAt > now) keep.push(entry);
      else fs.rm(entry.dir, { recursive: true, force: true }, () => {});
    }
    if (keep.length) svLiveRelayRetiredDirs.set(channelId, keep);
    else svLiveRelayRetiredDirs.delete(channelId);
  }
}, 30000).unref?.();

app.get('/api/live-test/:channelId', async (req, res) => {
  const ch = channels.find(c => c.id === req.params.channelId);
  const sourceUrl = req.query.src || (ch && ch.url);
  if (!sourceUrl) return res.status(404).json({ ok:false, error:'Channel missing' });

  try {
    const result = await svFetchBuffer(sourceUrl);
    const text = result.body.toString('utf8');
    res.json({
      ok: true,
      channel: ch?.name || req.params.channelId,
      status: result.status,
      bytes: result.body.length,
      hasM3U: text.includes('#EXTM3U'),
      mediaLines: text.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length,
      keyLines: text.split('\n').filter(l => l.includes('#EXT-X-KEY')).length,
      mapLines: text.split('\n').filter(l => l.includes('#EXT-X-MAP')).length,
      preview: rewriteM3u8(text, req.params.channelId, result.finalUrl || sourceUrl).split('\n').slice(0, 15)
    });
  } catch (e) {
    res.status(502).json({ ok:false, error:e.message });
  }
});

// API: MOVIES (with cartoon filter applied)
// ═══════════════════════════════════════════════════════════════════════════════
const mobileHlsSessions = new Map();

function mobileHlsPresetFromQuality(quality) {
  const q = String(quality || '').toLowerCase();
  if (q === '720p' || q === '1080p' || q === 'high') {
    return {
      key: '1280-2200k-128k',
      maxWidth: 1280,
      maxFps: MOBILE_HLS_MAX_FPS,
      videoMaxrate: '2200k',
      videoBufsize: '4400k',
      audioBitrate: '128k',
      crf: '29',
    };
  }
  return {
    key: `${MOBILE_HLS_MAX_WIDTH}-${MOBILE_HLS_VIDEO_MAXRATE}-${MOBILE_HLS_AUDIO_BITRATE}`,
    maxWidth: MOBILE_HLS_MAX_WIDTH,
    maxFps: MOBILE_HLS_MAX_FPS,
    videoMaxrate: MOBILE_HLS_VIDEO_MAXRATE,
    videoBufsize: MOBILE_HLS_VIDEO_BUFSIZE,
    audioBitrate: MOBILE_HLS_AUDIO_BITRATE,
    crf: '32',
  };
}

function hlsSessionKey(scope, source, startSec, audioKey = '') {
  return crypto
    .createHash('sha1')
    .update(`${MOBILE_HLS_PROFILE}|${scope}|${source}|${Math.floor(Number(startSec) || 0)}|${audioKey}`)
    .digest('hex')
    .slice(0, 24);
}

function hlsSessionId(scope, key) {
  return `${scope}:${key}`;
}

function touchMobileHlsSession(scope, key) {
  const session = mobileHlsSessions.get(hlsSessionId(scope, key));
  if (session) session.lastAccess = Date.now();
  return session;
}

function stopMobileHlsSession(scope, key, reason = 'stopped') {
  const sessionId = hlsSessionId(scope, key);
  const session = mobileHlsSessions.get(sessionId);
  if (!session) return false;
  session.stopping = true;
  mobileHlsSessions.delete(sessionId);
  console.log(`[Mobile HLS] stop ${sessionId} (${reason})`);
  try {
    if (!session.process.killed) session.process.kill('SIGKILL');
  } catch {}
  return true;
}

function cleanupMobileHlsSessions(reason = 'idle') {
  const now = Date.now();
  const sessions = [...mobileHlsSessions.entries()];
  for (const [sessionId, session] of sessions) {
    if (now - (session.lastAccess || session.createdAt) > MOBILE_HLS_IDLE_MS) {
      const [scope, key] = sessionId.split(':');
      stopMobileHlsSession(scope, key, reason);
    }
  }

  const remaining = [...mobileHlsSessions.entries()]
    .sort((a, b) => (a[1].lastAccess || a[1].createdAt) - (b[1].lastAccess || b[1].createdAt));
  while (remaining.length > MOBILE_HLS_MAX_SESSIONS) {
    const [sessionId] = remaining.shift();
    const [scope, key] = sessionId.split(':');
    stopMobileHlsSession(scope, key, 'session limit');
  }
}

setInterval(() => cleanupMobileHlsSessions(), Math.min(MOBILE_HLS_IDLE_MS, 30000)).unref?.();

function waitForHlsPlaylist(playlistPath, timeoutMs = 15000, sessionId = '') {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const session = sessionId ? mobileHlsSessions.get(sessionId) : null;
      if (session?.error) return reject(new Error(session.error));
      if (fs.existsSync(playlistPath)) {
        const content = fs.readFileSync(playlistPath, 'utf8');
        if (content.includes('.ts')) return resolve(content);
      }
      if (Date.now() - started >= timeoutMs) return reject(new Error('Mobile HLS startup timed out'));
      setTimeout(check, 250);
    };
    check();
  });
}

function startMobileHlsSession({
  scope,
  key,
  input,
  startSec = 0,
  audioMap = '0:a:0?',
  clientId = '',
  preset = mobileHlsPresetFromQuality(),
}) {
  fs.mkdirSync(MOBILE_HLS_DIR, { recursive: true });
  const sessionDir = path.join(MOBILE_HLS_DIR, scope, key);
  const playlistPath = path.join(sessionDir, 'index.m3u8');
  const sessionId = hlsSessionId(scope, key);
  const existing = mobileHlsSessions.get(sessionId);
  if (existing && !existing.process.killed && fs.existsSync(playlistPath)) {
    existing.lastAccess = Date.now();
    return playlistPath;
  }

  cleanupMobileHlsSessions('new session');

  fs.rmSync(sessionDir, { recursive: true, force: true });
  fs.mkdirSync(sessionDir, { recursive: true });

  const ffmpegArgs = ['-hide_banner', '-loglevel', 'warning', '-nostdin'];
  if (startSec > 0) ffmpegArgs.push('-ss', String(Math.floor(startSec)));
  ffmpegArgs.push('-re');
  if (/^https?:\/\//i.test(input)) {
    ffmpegArgs.push(
      '-fflags', '+genpts',
      '-probesize', '1048576',
      '-analyzeduration', '1000000',
      '-rw_timeout', '15000000'
    );
  }
  ffmpegArgs.push(
    '-i', input,
    '-map', '0:v:0',
    '-map', audioMap,
    '-sn', '-dn',
    '-vf', `scale=w=min(${preset.maxWidth}\\,iw):h=-2,fps=${preset.maxFps}`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-threads', MOBILE_HLS_FFMPEG_THREADS,
    '-filter_threads', '1',
    '-profile:v', 'baseline',
    '-level', '3.1',
    '-crf', preset.crf,
    '-maxrate', preset.videoMaxrate,
    '-bufsize', preset.videoBufsize,
    '-pix_fmt', 'yuv420p',
    '-g', '48',
    '-keyint_min', '48',
    '-sc_threshold', '0',
    '-c:a', 'aac',
    '-b:a', preset.audioBitrate,
    '-ar', '48000',
    '-ac', '2',
    '-f', 'hls',
    '-hls_time', '3',
    '-hls_list_size', '0',
    '-hls_flags', 'independent_segments',
    '-hls_segment_filename', path.join(sessionDir, 'seg_%05d.ts'),
    playlistPath
  );

  console.log(`[Mobile HLS] start ${sessionId} input=${input}`);
  const process = spawn(FFMPEG_BIN, ffmpegArgs);
  const session = { process, dir: sessionDir, createdAt: Date.now(), lastAccess: Date.now(), clientId, error: null };
  mobileHlsSessions.set(sessionId, session);
  process.stderr.on('data', d => console.log('[Mobile HLS FFmpeg]', d.toString().trim()));
  process.on('close', code => {
    console.log(`[Mobile HLS] ended ${sessionId} code=${code}`);
    const current = mobileHlsSessions.get(sessionId);
    if (current?.process === process) {
      if (current.error) current.ended = true;
      else mobileHlsSessions.delete(sessionId);
    }
  });
  process.on('error', err => {
    session.error = err.message;
    console.error('[Mobile HLS] spawn error:', err.message);
  });
  return playlistPath;
}

function sendMobileHlsPlaylist(res, scope, key, playlistPath) {
  touchMobileHlsSession(scope, key);
  waitForHlsPlaylist(playlistPath, 15000, hlsSessionId(scope, key))
    .then(content => {
      touchMobileHlsSession(scope, key);
      const rewritten = content.replace(/^(seg_[^\r\n]+\.ts)$/gm, `/api/mobile-hls/${scope}/${key}/$1`);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(rewritten);
    })
    .catch(err => {
      console.error('[Mobile HLS] playlist error:', err.message);
      res.status(504).send('#EXTM3U\n');
    });
}

app.get('/api/mobile-hls/local/:id/index.m3u8', (req, res) => {
  const idx = parseInt(req.params.id, 10);
  const entry = fileIndex[idx];
  if (!entry) return res.status(404).send('Not found');
  const filePath = entryPath(entry);
  if (!fs.existsSync(filePath)) return res.status(404).send('File missing');
  const startSec = parseFloat(req.query.start) || 0;
  const preset = mobileHlsPresetFromQuality(req.query.quality);
  const key = hlsSessionKey('local', filePath, startSec, preset.key);
  const clientId = /^[a-zA-Z0-9_-]{8,80}$/.test(String(req.query.client || '')) ? String(req.query.client) : '';
  const playlistPath = startMobileHlsSession({ scope: 'local', key, input: filePath, startSec, clientId, preset });
  sendMobileHlsPlaylist(res, 'local', key, playlistPath);
});

function allApiMoviesForDetails() {
  const localMovies = _movieList || buildMovieListSync();
  const ftpMovies = (ftpCatalog.movies || [])
    .filter(m => !isCartoonOrAnime(m))
    .map((m, i) => ({
      id: `ftp_${i}`,
      name: m.title,
      file: m.filename,
      poster: m.poster || null,
      backdrop: m.backdrop || m.poster || null,
      tmdbId: m.tmdbId || null,
      imdbId: m.imdbId || '',
      overview: m.overview || '',
      year: m.year || '',
      rating: m.rating || null,
      type: 'movie',
      genre: m.genre || '',
      category: m.category || '',
      runtime: m.runtime || '',
      director: m.director || '',
      language: m.language || '',
      productionCompanies: m.productionCompanies || [],
      streamUrl: m.streamUrl,
      isFtp: true,
    }));
  const seenLocal = new Set(localMovies.map(m => m.name));
  return [...localMovies, ...ftpMovies.filter(m => !seenLocal.has(m.name))];
}

function allApiSeriesForDetails() {
  const localSeries = _seriesList || buildSeriesListSync();
  const ftpSeries = (ftpCatalog.series || [])
    .filter(s => !isCartoonOrAnime(s))
    .map(s => ({
      name: s.title,
      poster: s.poster || null,
      backdrop: s.backdrop || s.poster || null,
      tmdbId: s.tmdbId || null,
      imdbId: s.imdbId || '',
      overview: s.overview || '',
      year: s.year || '',
      rating: s.rating || null,
      genre: s.genre || '',
      category: s.category || '',
      language: s.language || '',
      productionCompanies: s.productionCompanies || [],
      isFtp: true,
      seasons: (s.seasons || []).reduce((acc, seasonObj) => {
        const num = parseInt(String(seasonObj.season || '').match(/\d+/)?.[0] || '1', 10);
        acc[num] = (seasonObj.episodes || []).map((e, i) => {
          const parsed = parseSeriesFilename(e.filename);
          const epNum = parsed?.episode || i + 1;
          return {
            streamId: null,
            episode: epNum,
            epTitle: parsed?.epTitle?.trim() || `Episode ${epNum}`,
            file: e.filename,
            streamUrl: e.streamUrl,
            thumb: e.thumb || e.thumbnail || null,
            overview: e.overview || '',
            isFtp: true,
          };
        });
        return acc;
      }, {}),
    }));
  const seenShows = new Set(localSeries.map(s => s.name));
  return [...localSeries, ...ftpSeries.filter(s => !seenShows.has(s.name))];
}

function splitDetailGenres(value) {
  return String(value || '').split(/[,/|]/).map(g => g.trim().toLowerCase()).filter(Boolean);
}

function normalizeDetailTitle(title, fallbackYear = '') {
  let raw = String(title || '')
    .replace(/\.[a-z0-9]{2,5}$/i, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let year = String(fallbackYear || '').match(/(?:19|20)\d{2}/)?.[0] || '';
  const parenYear = raw.match(/[\(\[\{]\s*((?:19|20)\d{2})\s*(?:[–-]\s*)?[\)\]\}]?/);
  if (parenYear) {
    if (!year) year = parenYear[1];
    raw = raw.replace(parenYear[0], ' ');
  }
  const trailingYear = raw.match(/\b((?:19|20)\d{2})\b/);
  if (trailingYear && !year) year = trailingYear[1];

  raw = raw
    .replace(/\bS\d{1,2}E\d{1,3}\b/ig, ' ')
    .replace(/\[[^\]]*\]|\([^\)]*(?:Hindi|English|Dual Audio|Audio|ESub|MSubs|WEBRip|BluRay|x264|x265|HEVC|AAC|NF|AMZN|HMAX|DSNP|WEB-DL|HDRip|BRRip)[^\)]*\)/ig, ' ')
    .replace(/\b(2160p|1080p|720p|540p|480p|4k|uhd|hdr|webrip|web-rip|webdl|web-dl|bluray|brrip|hdrip|hdtv|dvdrip|x264|x265|hevc|aac|dts|ddp?5\.1|5\.1|7\.1|nf|amzn|hmax|dsnp|itunes|mkv|mp4|mkvC|mkvCinemas|msmod|pahe|rarbg|yts|galaxyrg|esub|msubs|dual audio|multi audio|hindi|english|bengali|bangla)\b.*$/ig, ' ')
    .replace(/\b((?:19|20)\d{2})\b/g, ' ')
    .replace(/[^\p{L}\p{N}:'&!?, -]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { title: raw, year };
}

function normalizedTitleKey(value) {
  return normalizeDetailTitle(value).title.toLowerCase();
}

function looseTitleScore(a, b) {
  const aw = new Set(normalizedTitleKey(a).split(/\s+/).filter(w => w.length > 1));
  const bw = new Set(normalizedTitleKey(b).split(/\s+/).filter(w => w.length > 1));
  if (!aw.size || !bw.size) return 0;
  let overlap = 0;
  aw.forEach(w => { if (bw.has(w)) overlap++; });
  return overlap / Math.max(aw.size, bw.size);
}

function playbackTitleYear(value) {
  return String(value || '').match(/(?:19|20)\d{2}/)?.[0] || '';
}

function findPlaybackCatalogItem(items, requestedId, requestedTitle, requestedYear, isPlayable) {
  const available = (items || []).filter(item => item && isPlayable(item));
  const id = String(requestedId || '');
  const direct = available.find(item => String(item.id || '') === id);
  if (direct) return direct;

  const title = String(requestedTitle || '').trim();
  if (!title) return null;
  const key = normalizedTitleKey(title);
  const year = playbackTitleYear(requestedYear || title);
  const exact = available.filter(item => normalizedTitleKey(item.name || item.title || item.file) === key);
  if (exact.length) {
    return exact.find(item => !year || playbackTitleYear(item.year || item.name || item.title) === year) || exact[0];
  }

  let best = null;
  let bestScore = 0;
  for (const item of available) {
    const score = looseTitleScore(title, item.name || item.title || item.file)
      + (year && playbackTitleYear(item.year || item.name || item.title) === year ? 0.08 : 0);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore >= 0.72 ? best : null;
}

// Lightweight home cards intentionally omit stream URLs. Resolve the trusted
// catalog source only after the user presses Watch, keeping the home feed small.
app.get('/api/playback/movie/:id', (req, res) => {
  const movie = findPlaybackCatalogItem(
    allApiMoviesForDetails(),
    req.params.id,
    req.query.title,
    req.query.year,
    item => !!item.streamUrl
  );
  if (!movie) return jsonError(res, 404, 'MOVIE_PLAYBACK_NOT_FOUND', 'Playable movie source was not found');
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json({
    ok: true,
    id: req.params.id,
    title: movie.name || movie.title || '',
    streamUrl: movie.streamUrl,
    isFtp: true,
    streamAvailable: true,
    hasStream: true,
  });
});

// Series summaries contain counts only. Hydrate seasons and episode URLs on
// detail click instead of putting the full series catalog back in home-feed.json.
app.get('/api/series/detail', (req, res) => {
  const show = findPlaybackCatalogItem(
    allApiSeriesForDetails(),
    req.query.id,
    req.query.name || req.query.title,
    req.query.year,
    item => Object.values(item.seasons || {}).some(eps => Array.isArray(eps) && eps.some(ep => ep.streamUrl || ep.streamId != null))
  );
  if (!show) return jsonError(res, 404, 'SERIES_PLAYBACK_NOT_FOUND', 'Playable series episodes were not found');
  const seasons = show.seasons || {};
  const episodeCount = Object.values(seasons).reduce((total, eps) => total + (Array.isArray(eps) ? eps.length : 0), 0);
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.json({
    ...show,
    id: req.query.id || show.id,
    type: 'series',
    isFtp: !!show.isFtp,
    isSummary: false,
    streamAvailable: episodeCount > 0,
    hasStream: episodeCount > 0,
    seasonCount: Object.keys(seasons).length,
    episodeCount,
  });
});

function localSimilarForDetails(item, mediaType) {
  const genres = splitDetailGenres(item?.genre);
  const source = mediaType === 'tv' ? allApiSeriesForDetails() : allApiMoviesForDetails();
  const current = String(mediaType === 'tv' ? (item?.name || item?.id || '') : (item?.id || item?.name || ''));
  const year = Number(String(item?.year || '').match(/(?:19|20)\d{2}/)?.[0] || 0);
  const category = String(item?.category || '').toLowerCase();
  const scored = source
    .filter(other => String(mediaType === 'tv' ? (other.name || other.id || '') : (other.id || other.name || '')) !== current)
    .map(other => {
      const otherGenres = splitDetailGenres(other.genre);
      const otherYear = Number(String(other.year || '').match(/(?:19|20)\d{2}/)?.[0] || 0);
      let score = genres.length ? otherGenres.filter(g => genres.some(seed => g.includes(seed) || seed.includes(g))).length * 4 : 0;
      if (category && String(other.category || '').toLowerCase() === category) score += 3;
      if (year && otherYear && Math.abs(year - otherYear) <= 5) score += 2;
      if (other.poster) score += 0.5;
      score += Math.min(Number(other.rating || 0) || 0, 10) / 10;
      return { other, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.other.rating || 0) - Number(a.other.rating || 0))
    .slice(0, 18)
    .map(x => x.other);
  return scored;
}

function localDirectorForDetails(item) {
  const director = String(item?.director || '').trim().toLowerCase();
  if (!director) return [];
  return allApiMoviesForDetails().filter(m => m !== item && String(m.director || '').trim().toLowerCase() === director).slice(0, 18);
}

function localDetailsObject(item, mediaType, title = '', options = {}) {
  const generateFallbacks = options.generateFallbacks !== false;
  const companies = Array.isArray(item?.productionCompanies)
    ? item.productionCompanies.map((c, i) => typeof c === 'string' ? { id: i, name: c, logo: null } : c).filter(c => c?.name)
    : [];
  return {
    ok: true,
    localOnly: true,
    type: mediaType,
    id: item?.id || item?.name || '',
    tmdbId: item?.tmdbId || null,
    imdbId: item?.imdbId || '',
    title: item?.name || title,
    overview: item?.overview || '',
    poster: item?.poster || null,
    backdrop: item?.backdrop || item?.poster || null,
    year: item?.year || '',
    rating: item?.rating || null,
    runtime: item?.runtime || '',
    genres: item?.genre || '',
    language: item?.language || '',
    ratings: item?.rating ? [{ source: 'Catalog', value: `${item.rating}/10`, subvalue: 'Local cache', available: true }] : [],
    trailers: Array.isArray(item?.trailers) ? item.trailers : [],
    cast: Array.isArray(item?.cast) ? item.cast : [],
    crew: Array.isArray(item?.crew) ? item.crew : [],
    productionCompanies: companies,
    similar: Array.isArray(item?.similar) && item.similar.length ? item.similar : (generateFallbacks ? localSimilarForDetails(item, mediaType) : []),
    moreByDirector: Array.isArray(item?.moreByDirector) && item.moreByDirector.length ? item.moreByDirector : (generateFallbacks ? localDirectorForDetails(item) : []),
    director: item?.director || null,
    episodes: mediaType === 'tv' ? item?.seasons || {} : [],
    about: [],
    playbackInfo: [],
  };
}

function findLocalDetailItem(mediaType, rawId, title) {
  const id = decodeURIComponent(String(rawId || ''));
  const normalizedRequest = normalizeDetailTitle(title || id);
  const requestTitle = normalizedRequest.title.toLowerCase();
  const requestYear = normalizedRequest.year;
  const matchesNormalized = item => {
    const name = item.name || item.title || item.filename || '';
    const normalized = normalizeDetailTitle(name, item.year);
    if (String(item.tmdbId || '') && String(item.tmdbId) === id) return true;
    if (requestTitle && normalized.title.toLowerCase() === requestTitle) return true;
    if (requestTitle && requestYear && normalized.title.toLowerCase() === requestTitle && String(normalized.year || item.year || '').slice(0, 4) === requestYear) return true;
    return requestTitle && looseTitleScore(name, requestTitle) >= 0.72;
  };
  if (mediaType === 'tv') {
    const local = (_seriesList || buildSeriesListSync()).find(item =>
      String(item.id || '') === id ||
      String(item.tmdbId || '') === id ||
      matchesNormalized(item)
    );
    if (local) return local;
    const raw = (ftpCatalog.series || []).find(item =>
      String(item.tmdbId || '') === id ||
      matchesNormalized(item)
    );
    if (raw) return {
      name: raw.title,
      poster: raw.poster || null,
      backdrop: raw.backdrop || raw.poster || null,
      tmdbId: raw.tmdbId || null,
      imdbId: raw.imdbId || '',
      overview: raw.overview || '',
      year: raw.year || '',
      rating: raw.rating || null,
      genre: raw.genre || '',
      category: raw.category || '',
      language: raw.language || '',
      productionCompanies: raw.productionCompanies || [],
      isFtp: true,
      seasons: {},
    };
    return { id, name: title || id, type: mediaType };
  }

  const local = (_movieList || buildMovieListSync()).find(item =>
    String(item.id || '') === id ||
    String(item.tmdbId || '') === id ||
    matchesNormalized(item)
  );
  if (local) return local;
  const raw = (ftpCatalog.movies || []).find((item, i) =>
    `ftp_${i}` === id ||
    String(item.tmdbId || '') === id ||
    matchesNormalized(item)
  );
  if (raw) return {
    id,
    name: raw.title,
    file: raw.filename,
    poster: raw.poster || null,
    backdrop: raw.backdrop || raw.poster || null,
    tmdbId: raw.tmdbId || null,
    imdbId: raw.imdbId || '',
    overview: raw.overview || '',
    year: raw.year || '',
    rating: raw.rating || null,
    type: 'movie',
    genre: raw.genre || '',
    category: raw.category || '',
    runtime: raw.runtime || '',
    director: raw.director || '',
    language: raw.language || '',
    productionCompanies: raw.productionCompanies || [],
    streamUrl: raw.streamUrl,
    isFtp: true,
  };
  return { id, name: title || id, type: mediaType };
}

app.get('/api/details/debug', async (req, res) => {
  const matrix = await tmdbGet('/movie/603?language=en-US');
  res.json({
    ok: true,
    hasTmdbToken: !!TMDB_TOKEN,
    movies: _movieList?.length || 0,
    series: _seriesList?.length || 0,
    catalogMovies: ftpCatalog.movies?.length || 0,
    catalogSeries: ftpCatalog.series?.length || 0,
    cacheKeys: Object.keys(diskDetailCache || {}).length,
    tmdbTestTitle: matrix?.title || null,
  });
});

app.get('/api/details/:type/:id', async (req, res) => {
  const mediaType = ['tv', 'series', 'show'].includes(String(req.params.type || '').toLowerCase()) ? 'tv' : 'movie';
  const normalizedTitle = normalizeDetailTitle(req.query.title || req.query.name || req.params.id || '', req.query.year || '');
  const item = findLocalDetailItem(mediaType, req.params.id, normalizedTitle.title);
  const tmdbId = tmdbIdFromRequest({ ...req.query, id: req.params.id }, mediaType) || (/^\d+$/.test(String(item.tmdbId || '')) ? item.tmdbId : '');
  console.log('[DETAIL REQUEST]', req.params, req.query);
  console.log('[DETAIL ITEM]', item);
  console.log('[DETAIL TMDB ID]', tmdbId);
  console.log('[Details] request', { mediaType, id: req.params.id, title: req.query.title, year: req.query.year, tmdbId });
  console.log('[Details] matched local item', item?.name || item?.title, item?.tmdbId);
  const cacheKey = `${mediaType}:${tmdbId || normalizedTitle.title || item.name || req.params.id}:${normalizedTitle.year || item.year || ''}`;
  const memoryCached = titleDetailsCache.get(cacheKey);
  const skipDiskCache = true;
  const diskCached = skipDiskCache ? null : diskDetailCache[cacheKey];

  if (memoryCached && hasExtendedDetail(memoryCached.data) && Date.now() - memoryCached.time < TITLE_DETAILS_CACHE_MS) {
    const local = localDetailsObject(item, mediaType, normalizedTitle.title, { generateFallbacks: false });
    console.log('[DETAIL LOCAL]', local);
    console.log('[DETAIL FRESH]', memoryCached.data);
    res.setHeader('Cache-Control', 'public, max-age=900');
    return res.json({ ...local, ...memoryCached.data, localOnly: false });
  }

  if (diskCached && hasExtendedDetail(diskCached.data) && Date.now() - Number(diskCached.time || 0) < TITLE_DETAILS_CACHE_MS) {
    const local = localDetailsObject(item, mediaType, normalizedTitle.title, { generateFallbacks: false });
    titleDetailsCache.set(cacheKey, { time: diskCached.time, data: diskCached.data });
    res.setHeader('Cache-Control', 'public, max-age=900');
    return res.json({ ...local, ...diskCached.data, localOnly: false });
  }

  try {
    const fresh = await withTimeout(
      buildTmdbExtendedDetails(mediaType, tmdbId, normalizedTitle.title || item.name, normalizedTitle.year || item.year),
      15000,
      null
    );
    console.log('[DETAIL FRESH]', fresh);
    if (fresh && fresh.ok) {
      const local = localDetailsObject(item, mediaType, normalizedTitle.title, { generateFallbacks: true });
      console.log('[DETAIL LOCAL]', local);
      const data = { ...local, ...fresh, localOnly: false };
      console.log('[Details] result counts', {
        trailers: data.trailers?.length,
        cast: data.cast?.length,
        crew: data.crew?.length,
        companies: data.productionCompanies?.length,
        similar: data.similar?.length,
      });
      titleDetailsCache.set(cacheKey, { time: Date.now(), data: fresh });
      diskDetailCache[cacheKey] = { time: Date.now(), data: fresh };
      saveDetailCache();
      res.setHeader('Cache-Control', 'public, max-age=900');
      return res.json(data);
    }
    console.warn(`[Details] Empty TMDB details for ${mediaType}:${normalizedTitle.title || item.name || req.params.id}`);
  } catch (e) {
    console.warn(`[Details] Fetch failed for ${mediaType}:${normalizedTitle.title || item.name || req.params.id}:`, e.message);
  }

  const local = localDetailsObject(item, mediaType, normalizedTitle.title, { generateFallbacks: true });
  console.log('[DETAIL LOCAL]', local);
  console.log('[DETAIL FRESH]', null);
  console.log('[Details] result counts', {
    trailers: local.trailers?.length,
    cast: local.cast?.length,
    crew: local.crew?.length,
    companies: local.productionCompanies?.length,
    similar: local.similar?.length,
  });
  res.setHeader('Cache-Control', 'public, max-age=120');
  res.json(local);
});

app.post('/api/details/cache/clear', (req, res) => {
  titleDetailsCache.clear();
  diskDetailCache = {};
  try { if (fs.existsSync(DETAIL_CACHE_FILE)) fs.unlinkSync(DETAIL_CACHE_FILE); } catch (e) {
    console.warn('[Details] cache clear file delete failed:', e.message);
  }
  res.json({ ok: true, cleared: true });
});

app.get('/api/mobile-hls/ftp/index.m3u8', (req, res) => {
  const trusted = readTrustedRemotePlaybackMedia(req, res, false);
  if (!trusted) return;
  const srcUrl = trusted.srcUrl;
  const startSec = parseFloat(req.query.start) || 0;
  const audioMap = playbackAudioMapFromReq(req);
  const preset = mobileHlsPresetFromQuality(req.query.quality);
  const key = hlsSessionKey('ftp', srcUrl, startSec, `${audioMap}|${preset.key}`);
  const clientId = /^[a-zA-Z0-9_-]{8,80}$/.test(String(req.query.client || '')) ? String(req.query.client) : '';
  const playlistPath = startMobileHlsSession({ scope: 'ftp', key, input: srcUrl, startSec, audioMap, clientId, preset });
  sendMobileHlsPlaylist(res, 'ftp', key, playlistPath);
});

app.get('/api/mobile-hls/:scope/:key/:file', (req, res) => {
  if (!/^(local|ftp)$/.test(req.params.scope)) return res.status(404).end();
  if (!/^[a-f0-9]{24}$/.test(req.params.key)) return res.status(404).end();
  if (!/^seg_\d+\.ts$/.test(req.params.file)) return res.status(404).end();
  touchMobileHlsSession(req.params.scope, req.params.key);
  const filePath = path.join(MOBILE_HLS_DIR, req.params.scope, req.params.key, req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.setHeader('Content-Type', 'video/MP2T');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const stream = fs.createReadStream(filePath);
  res.on('close', () => stream.destroy());
  stream.on('error', err => {
    console.error('[Mobile HLS] segment read error:', err.message);
    if (!res.headersSent) res.status(500).end();
  });
  stream.pipe(res);
});

app.post('/api/mobile-hls/stop', (req, res) => {
  const sessions = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
  const clientId = /^[a-zA-Z0-9_-]{8,80}$/.test(String(req.body?.client || '')) ? String(req.body.client) : '';
  let stopped = 0;
  for (const session of sessions) {
    const scope = String(session?.scope || '');
    const key = String(session?.key || '');
    if (/^(local|ftp)$/.test(scope) && /^[a-f0-9]{24}$/.test(key)) {
      if (stopMobileHlsSession(scope, key, 'client closed')) stopped++;
    }
  }
  if (clientId) {
    for (const [sessionId, session] of [...mobileHlsSessions.entries()]) {
      if (session.clientId === clientId) {
        const [scope, key] = sessionId.split(':');
        if (stopMobileHlsSession(scope, key, 'client closed')) stopped++;
      }
    }
  }
  res.json({ ok: true, stopped });
});

function ffmpegMp4Args({ input, mode = 'remux', startSec = 0, audioMap = '0:a:0?', remote = false }) {
  const args = ['-hide_banner', '-loglevel', 'warning', '-nostdin'];
  if (startSec > 0) args.push('-ss', String(Math.floor(startSec)));
  if (remote) {
    args.push(
      '-fflags', '+genpts',
      '-probesize', '1048576',
      '-analyzeduration', '1000000',
      '-rw_timeout', '15000000'
    );
  }
  args.push('-i', input, '-map', '0:v:0', '-map', audioMap, '-sn', '-dn');
  if (mode === 'audio') {
    args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2');
  } else {
    args.push('-c', 'copy');
  }
  args.push(
    '-avoid_negative_ts', 'make_zero',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1'
  );
  return args;
}

function streamFfmpegMp4(req, res, options) {
  const mode = options.mode === 'audio' ? 'audio' : 'remux';
  const label = options.label || options.input;
  if (activeMediaFfmpegStreams >= MEDIA_FFMPEG_STREAM_MAX) {
    return jsonError(res, 429, 'MEDIA_FFMPEG_BUSY', 'Media fallback workers are busy; try again in a moment', {
      active: activeMediaFfmpegStreams,
      limit: MEDIA_FFMPEG_STREAM_MAX,
    });
  }

  const args = ffmpegMp4Args({ ...options, mode });
  console.log(`[Media FFmpeg] ${mode} start ${label}`);
  activeMediaFfmpegStreams += 1;
  const ffmpeg = spawn(FFMPEG_BIN, args);
  let started = false;
  let closed = false;
  let stderr = '';
  const headers = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'none',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };

  const startupTimer = setTimeout(() => {
    if (started || closed) return;
    console.error(`[Media FFmpeg] ${mode} startup timeout ${label}`);
    try { ffmpeg.kill('SIGKILL'); } catch {}
    if (!res.headersSent) {
      jsonError(res, 504, 'MEDIA_FFMPEG_STARTUP_TIMEOUT', 'Media fallback did not start in time', {
        mode,
        details: stderr.slice(-1000),
      });
    } else if (!res.writableEnded) {
      res.end();
    }
  }, MEDIA_FFMPEG_STARTUP_MS);

  ffmpeg.stdout.on('data', chunk => {
    if (closed || res.writableEnded) return;
    if (!started) {
      started = true;
      clearTimeout(startupTimer);
      res.writeHead(200, headers);
    }
    if (!res.write(chunk)) {
      ffmpeg.stdout.pause();
      res.once('drain', () => ffmpeg.stdout.resume());
    }
  });

  ffmpeg.stdout.on('end', () => {
    if (started && !res.writableEnded) res.end();
  });

  ffmpeg.stderr.on('data', data => {
    stderr += data.toString();
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });

  ffmpeg.on('error', err => {
    console.error(`[Media FFmpeg] ${mode} spawn error ${label}:`, err.message);
    clearTimeout(startupTimer);
    if (!started && !res.headersSent) {
      jsonError(res, 500, 'MEDIA_FFMPEG_SPAWN_FAILED', 'Could not start media fallback', {
        mode,
        details: err.message,
      });
    }
  });

  ffmpeg.on('close', code => {
    closed = true;
    clearTimeout(startupTimer);
    activeMediaFfmpegStreams = Math.max(0, activeMediaFfmpegStreams - 1);
    if (code !== 0 && !started && !res.headersSent) {
      console.error(`[Media FFmpeg] ${mode} failed ${label}:`, stderr.trim());
      jsonError(res, 502, 'MEDIA_FFMPEG_FAILED', 'Media fallback failed before playback started', {
        mode,
        details: stderr.slice(-1000),
      });
    } else if (code !== 0) {
      console.error(`[Media FFmpeg] ${mode} ended code=${code} ${label}:`, stderr.slice(-1000));
      if (started && !res.writableEnded) res.end();
    } else {
      console.log(`[Media FFmpeg] ${mode} ended ${label}`);
    }
  });

  req.on('close', () => {
    if (!closed) {
      try { ffmpeg.kill('SIGKILL'); } catch {}
    }
  });
}


// ── Homepage section APIs restored/protected ─────────────────────────────────
// These use ONLY the normal catalog. Massive 500k catalog is never used here.
const SV_HOME_SECTIONS = [
  ['netflixRow','netflix','Netflix Originals'],
  ['marvelRow','marvel','Marvel Studios'],
  ['dcRow','dc','DC'],
  ['universalRow','universal','Universal Pictures'],
  ['disneyRow','disney','Disney'],
  ['warnerRow','warner','Warner Bros'],
  ['hboRow','hbo','HBO'],
  ['appleTvRow','apple','Apple TV+'],
  ['indianRow','indian','Indian Movies & Drama'],
  ['animeRow','anime','Anime'], ['koreanRow','koreanDrama','Korean Drama'], ['horrorRow','horrorNights','Horror Nights'],
  ['scifiRow','cyberpunkScifi','Cyberpunk & Sci-Fi'], ['mindfuckRow','mindfuck','Mindfuck Movies'],
  ['cultClassicsRow','cultClassics','Cult Classics'], ['a24Row','a24','A24 Collection'],
  ['nostalgia90sRow','nostalgia90s','90s Nostalgia'], ['midnightCinemaRow','midnightCinema','Midnight Cinema'],
  ['trueCrimeRow','trueCrime','True Crime'], ['thrillerRow','psychThriller','Psychological Thriller'],
  ['adultAnimationRow','adultAnimation','Adult Animation'], ['postApocalypticRow','postApocalyptic','Post-Apocalyptic'],
  ['feelGoodRow','feelGood','Feel Good Movies'], ['darkComedyRow','darkComedy','Dark Comedy'], ['timeTravelRow','timeTravel','Time Travel'],
  ['spaceAiRow','spaceAi','Space & AI'], ['crimeRow','crimeSyndicates','Crime Syndicates'], ['zombieRow','zombie','Zombie Universe'],
  ['indieGemsRow','indieGems','Indie Gems'], ['hiddenMasterpiecesRow','hiddenMasterpieces','Hidden Masterpieces'],
  ['liveConcertsRow','liveConcerts','Live Concerts'], ['documentaryRow','documentaryVault','Documentary Vault'],
  ['ghibliRow','ghibli','Studio Ghibli'], ['romanticRow','romanceMidnight','Romance After Midnight'], ['comingSoonRow','comingSoon','Coming Soon'],
  ['dramaRow','drama','Drama & Emotion'], ['spanishRow','spanish','Spanish & Latino'], ['highRatedRow','topRated','⭐ Top Rated (8+)'],
  ['allRow','allMovies','All Movies'], ['recentlyAddedRow','recentlyAdded','Recently Added'], ['mostWatchedTodayRow','mostWatchedToday','Most Watched Today'],
  ['trendingRow','trending','🔥 Trending Now'], ['seriesRow','series','Series'], ['newRow','new','New to StreamVault']
];

const SV_PREBUILT_HOME_FEED_FILE = path.join(__dirname, 'home-feed.json');
const SV_PREBUILT_HOME_FEED = loadJSON(SV_PREBUILT_HOME_FEED_FILE, null);
const SV_PREBUILT_HOME_ROWS = new Map(
  (Array.isArray(SV_PREBUILT_HOME_FEED?.rows) ? SV_PREBUILT_HOME_FEED.rows : [])
    .filter(row => row?.rowId && Array.isArray(row.items))
    .map(row => [row.rowId, row])
);
const svPrebuiltHomeJsonCache = new Map();
const SV_HOME_MIN_PREBUILT_ITEMS = 8;
const SV_DYNAMIC_HOME_SECTION_KEYS = new Set(['warner','hbo']);

function svPrebuiltHomePayload(limit) {
  if (!SV_PREBUILT_HOME_ROWS.size) return null;
  const rows = SV_HOME_SECTIONS.map(([rowId, sectionKey, title]) => {
    const cached = SV_PREBUILT_HOME_ROWS.get(rowId);
    let items = Array.isArray(cached?.items) ? cached.items : [];
    if (SV_DYNAMIC_HOME_SECTION_KEYS.has(sectionKey) || (items.length > 0 && items.length < Math.min(limit, SV_HOME_MIN_PREBUILT_ITEMS))) {
      const fresh = svSectionList(sectionKey);
      if (fresh.length > items.length) items = fresh;
    }
    if (!items.length) return null;
    return { rowId, sectionKey, title, items:items.slice(0, limit) };
  }).filter(Boolean);
  const hero = (rows.find(row => row.rowId === 'newRow')?.items || rows[0]?.items || [])
    .filter(item => item.poster || item.backdrop)
    .slice(0, 10);
  return {
    ok:true,
    generatedAt:SV_PREBUILT_HOME_FEED.generatedAt || null,
    source:`${SV_PREBUILT_HOME_FEED.source || 'prebuilt-home-feed'}:cached`,
    hero,
    rows
  };
}

let svNormalMovieItemsCache = null;
let svNormalSeriesItemsCache = null;
const svSectionListCache = new Map();

function svNormalMovieItems() {
  if (svNormalMovieItemsCache) return svNormalMovieItemsCache;
  const localMovies = (_movieList || buildMovieListSync()).map(m => ({ ...m, type:'movie', _sourceRank:0 }));
  const ftpMovies = getCachedMovies()
    .filter(m => !isCartoonOrAnime(m))
    .map((m, i) => ({
      id:`ftp_home_${i}`, name:m.title, title:m.title, file:m.filename || '', poster:m.poster || null,
      backdrop:m.backdrop || m.poster || null, tmdbId:m.tmdbId || null, overview:m.overview || '',
      year:m.year || '', rating:m.rating || null, type:'movie', genre:m.genre || '', category:m.category || '',
      language:m.language || '', productionCompanies:m.productionCompanies || [], streamUrl:m.streamUrl, isFtp:true, _sourceRank:1
    }));
  const seen = new Set();
  svNormalMovieItemsCache = [...localMovies, ...ftpMovies].filter(item => {
    const key = `${String(item.name || item.title || '').toLowerCase()}|${item.year || ''}|${item.tmdbId || ''}|${item.streamUrl || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return svNormalMovieItemsCache;
}

function svNormalSeriesItems() {
  if (svNormalSeriesItemsCache) return svNormalSeriesItemsCache;
  const localSeries = (_seriesList || buildSeriesListSync()).map(s => ({ ...s, type:'series', _sourceRank:0 }));
  const ftpSeries = getCachedSeries()
    .filter(s => !isCartoonOrAnime(s))
    .map((s, i) => ({
      id:`ftp_series_home_${i}`, name:s.title, title:s.title, poster:s.poster || null, backdrop:s.backdrop || s.poster || null,
      tmdbId:s.tmdbId || null, overview:s.overview || '', year:s.year || '', rating:s.rating || null,
      genre:s.genre || '', category:s.category || '', language:s.language || '', type:'series', isFtp:true,
      seasons: (s.seasons || []).reduce((acc, seasonObj) => {
        const num = parseInt(String(seasonObj.season || '').match(/\d+/)?.[0] || '1', 10);
        acc[num] = (seasonObj.episodes || []).map((e, idx) => ({
          streamId:null, episode:idx + 1, epTitle:`Episode ${idx + 1}`, file:e.filename, streamUrl:e.streamUrl, isFtp:true
        }));
        return acc;
      }, {}),
      _sourceRank:1
    }));
  const seen = new Set();
  svNormalSeriesItemsCache = [...localSeries, ...ftpSeries].filter(item => {
    const key = `${String(item.name || item.title || '').toLowerCase()}|${item.year || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return svNormalSeriesItemsCache;
}

function svHomeText(item) {
  return [item.name, item.title, item.file, item.overview, item.genre, item.category, item.language, item.year, ...(item.productionCompanies || [])]
    .filter(Boolean).join(' ').toLowerCase();
}
function svHasAny(text, words) { return words.some(w => text.includes(w)); }
function svYearNum(item) { return parseInt(String(item.year || '').match(/(?:19|20)\d{2}/)?.[0] || '0', 10) || 0; }
function svRatingNum(item) { return parseFloat(item.rating || 0) || 0; }
function svHomeSort(items) {
  return items.slice().sort((a,b) => {
    const bp = (b.poster || b.backdrop ? 1 : 0) - (a.poster || a.backdrop ? 1 : 0);
    if (bp) return bp;
    const br = svRatingNum(b) - svRatingNum(a); if (br) return br;
    return svYearNum(b) - svYearNum(a);
  });
}
const SV_STUDIO_KEYWORDS = {
  marvel: [
    'iron man','iron man 2','iron man 3','the incredible hulk','thor','thor the dark world','thor ragnarok','thor love and thunder',
    'captain america','the first avenger','winter soldier','civil war','the avengers','avengers','age of ultron','infinity war','endgame',
    'guardians of the galaxy','ant man','ant-man','doctor strange','black panther','captain marvel','shang chi','eternals',
    'black widow','spider man','spider-man','no way home','homecoming','far from home','venom','deadpool','wolverine','x men','x-men','fantastic four'
  ],
  dc: [
    'batman','the batman','dark knight','superman','man of steel','wonder woman','aquaman','justice league','zack snyder','joker','suicide squad',
    'the suicide squad','birds of prey','black adam','shazam','the flash','blue beetle','watchmen','constantine','green lantern','gotham','peacemaker','v for vendetta'
  ],
  universal: [
    'jurassic park','jurassic world','fast and furious','fast & furious','the fast and the furious','furious 7','fast five','hobbs and shaw',
    'jaws','e t','et the extra terrestrial','back to the future','bourne','jason bourne','the mummy','mummy returns','despicable me','minions',
    'sing','secret life of pets','kung fu panda','how to train your dragon','shrek','puss in boots','trolls','oppenheimer','nope','get out','us','halloween','the purge'
  ],
  disney: [
    'disney','pixar','toy story','finding nemo','finding dory','incredibles','cars','monsters inc','inside out','coco','up','wall e','ratatouille',
    'frozen','moana','encanto','zootopia','lion king','aladdin','beauty and the beast','mulan','little mermaid','lilo stitch','pirates of the caribbean',
    'star wars','mandalorian','ahsoka','obi wan','andor','loki','wandavision','moon knight','ms marvel','hawkeye','she hulk'
  ],
  warner: [
    'warner','harry potter','fantastic beasts','lord of the rings','the hobbit','matrix','dune','godzilla','kong','mad max','blade runner','inception',
    'interstellar','tenet','conjuring','annabelle','it chapter','it ','sherlock holmes','ocean','creed','rocky','space jam','barbie','wonka'
  ],
  hbo: [
    'hbo','max original','house of the dragon','game of thrones','the last of us','true detective','succession','euphoria','westworld','the wire',
    'sopranos','chernobyl','boardwalk empire','watchmen','mare of easttown','big little lies','white lotus','silicon valley','barry','peacemaker'
  ],
  apple: [
    'apple tv','appletv','apple original','ted lasso','severance','silo','foundation','for all mankind','the morning show','slow horses','see','invasion',
    'servant','defending jacob','black bird','shrinking','mythic quest','monarch legacy of monsters','lessons in chemistry','pachinko','masters of the air'
  ]
};

const SV_STUDIO_COMPANIES = {
  netflix: ['netflix'],
  marvel: ['marvel studios','marvel entertainment','marvel enterprises'],
  dc: ['dc entertainment','dc films','dc studios','dc comics'],
  universal: ['universal pictures','universal studios','illumination','dreamworks animation','focus features'],
  disney: ['walt disney','disney','pixar','lucasfilm','marvel studios','20th century studios'],
  warner: ['warner bros','warner brothers','new line cinema','legendary pictures','dc entertainment','castle rock'],
  hbo: ['hbo','home box office','warner media','max'],
  apple: ['apple tv','apple studios','apple original films']
};

function svHomeTitleText(item) {
  return svNormalizeSearchText([
    item.name,
    item.title,
    item.file,
    item.filename,
    item.category,
    item.year,
    ...(item.productionCompanies || [])
  ].filter(Boolean).join(' '));
}

function svCompanyText(item) {
  return svNormalizeSearchText([...(item.productionCompanies || []), item.studio, item.network, item.category].filter(Boolean).join(' '));
}

function svHasStudioCompany(item, key) {
  const companyText = svCompanyText(item);
  const companies = SV_STUDIO_COMPANIES[key] || [];
  return companies.some(company => companyText.includes(svNormalizeSearchText(company)));
}

function svTitlePhraseHit(item, phrase) {
  const titleText = svHomeTitleText(item);
  const p = svNormalizeSearchText(phrase);
  if (!p) return false;
  return titleText === p || titleText.startsWith(p + ' ') || titleText.includes(' ' + p + ' ') || titleText.includes(p);
}


// v12: ONLY the 3 headline rows below use curated popularity ranking.
// Other homepage rows and all other APIs stay on the existing logic.
const SV_FEATURED_POPULAR_TITLES = {
  netflix: [
    'stranger things','wednesday','squid game','money heist','dark','black mirror','the witcher','narcos','ozark','the crown',
    'bridgerton','house of cards','mindhunter','the queens gambit','sex education','you','lupin','cobra kai','one piece','avatar the last airbender',
    '3 body problem','the night agent','arcane','the sandman','all of us are dead','alice in borderland','kingdom','the gentleman','the gentlemen',
    'dahmer','beef','maid','bodyguard','the umbrella academy','lost in space','the haunting of hill house','the fall of the house of usher',
    'love death robots','our planet','extraction','extraction 2','the gray man','red notice','bird box','enola holmes','the irishman','marriage story',
    'glass onion','dont look up','the adam project','army of the dead','leave the world behind','the old guard','society of the snow','the platform'
  ],
  marvel: [
    'avengers endgame','avengers infinity war','the avengers','avengers age of ultron',
    'iron man','iron man 2','iron man 3','captain america the first avenger','captain america the winter soldier','captain america civil war',
    'thor','thor the dark world','thor ragnarok','thor love and thunder','guardians of the galaxy','guardians of the galaxy vol 2','guardians of the galaxy vol 3',
    'spider man homecoming','spider man far from home','spider man no way home','spider man into the spider verse','spider man across the spider verse',
    'black panther','black panther wakanda forever','doctor strange','doctor strange in the multiverse of madness','ant man','ant man and the wasp','ant man and the wasp quantumania',
    'captain marvel','the marvels','shang chi','eternals','black widow','deadpool','deadpool 2','deadpool wolverine','logan','the wolverine','x men days of future past',
    'x men first class','x men','x2','x men apocalypse','fantastic four','daredevil','loki','wandavision','moon knight','the punisher','jessica jones',
    'luke cage','iron fist','hawkeye','ms marvel','she hulk','the falcon and the winter soldier','agents of shield','agent carter','what if','x men 97'
  ],
  dc: [
    'the dark knight','the dark knight rises','batman begins','the batman','batman','batman returns','batman forever','batman mask of the phantasm',
    'joker','joker folie a deux','superman','superman ii','superman returns','man of steel','batman v superman','zack snyders justice league','justice league',
    'wonder woman','wonder woman 1984','aquaman','aquaman and the lost kingdom','the flash','shazam','shazam fury of the gods','black adam','blue beetle',
    'suicide squad','the suicide squad','birds of prey','watchmen','constantine','green lantern','v for vendetta','peacemaker','the penguin','gotham',
    'superman and lois','arrow','the flash tv','titans','doom patrol','stargirl','swamp thing','pennyworth','batwoman','smallville','lucifer','young justice','harley quinn'
  ]
};

function svFeaturedTitleBase(item) {
  return svNormalizeSearchText(item.name || item.title || item.file || item.filename || '')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b(2160p|1080p|720p|480p|4k|uhd|hdr|sdr|web|webrip|webdl|web-dl|bluray|brrip|dvdrip|hdtc|hdts|x264|x265|h264|hevc|aac|ddp|dd5|dts|remux|repack|yify|rarbg|tigole|psa|mkv|mp4|reencoded|dual|audio|hindi|english|esub|msub)\b/g, ' ')
    .replace(/\b(s\d{1,2}e\d{1,3}|season|episode|vol|volume)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function svFeaturedPriorityHit(item, key) {
  const base = svFeaturedTitleBase(item);
  const hay = ` ${base} `;
  let best = { score: 0, phrase: '' };
  const phrases = SV_FEATURED_POPULAR_TITLES[key] || [];
  for (let i = 0; i < phrases.length; i++) {
    const phrase = svNormalizeSearchText(phrases[i]);
    if (!phrase) continue;
    const wrapped = ` ${phrase} `;
    let score = 0;
    if (base === phrase) score = 320000 - (i * 1000);
    else if (base.startsWith(phrase + ' ')) score = 230000 - (i * 1000);
    else if (hay.includes(wrapped)) score = 200000 - (i * 1000);
    else if (base.includes(phrase)) score = 170000 - (i * 1000);
    if (score > best.score) best = { score, phrase };
  }
  return best;
}

function svFeaturedNetflixIndicatorScore(item) {
  const raw = String([item.name,item.title,item.file,item.filename,item.category,...(item.productionCompanies || [])].filter(Boolean).join(' ')).toLowerCase();
  if (svHasStudioCompany(item, 'netflix')) return 70000;
  if (raw.includes('netflix') || raw.includes('netflix original') || raw.includes('nf-web') || raw.includes('nf web') || /(^|[\s._\-/])nf([\s._\-/]|$)/i.test(raw)) return 52000;
  return 0;
}

function svFeaturedMediaScore(item, key) {
  const hit = svFeaturedPriorityHit(item, key);
  let score = hit.score;
  if (key === 'netflix') score = Math.max(score, svFeaturedNetflixIndicatorScore(item));
  else if (svHasStudioCompany(item, key)) score += 55000;
  if (!score) return { score: 0, phrase: '' };
  const art = item.backdrop ? 9000 : (item.poster ? 6500 : 0);
  const rating = Math.round(Math.max(0, Math.min(10, svRatingNum(item))) * 500);
  const year = Math.max(0, Math.min(2500, (svYearNum(item) || 0) - 1980));
  const playable = item.streamUrl || item.file ? 1200 : 0;
  return { score: score + art + rating + year + playable, phrase: hit.phrase };
}

function svFeaturedDedupeKey(item, key, phrase) {
  const type = item.type || (item.seasons ? 'series' : 'movie');
  const y = svYearNum(item) || '';
  const p = phrase || svFeaturedTitleBase(item);
  return `${key}|${type}|${p}|${y}`;
}

function svBetterFeaturedCandidate(a, b) {
  const artA = (a.item.backdrop ? 3 : 0) + (a.item.poster ? 2 : 0);
  const artB = (b.item.backdrop ? 3 : 0) + (b.item.poster ? 2 : 0);
  if (artA !== artB) return artA - artB;
  const score = (a.score || 0) - (b.score || 0);
  if (score) return score;
  return svRatingNum(a.item) - svRatingNum(b.item);
}

function svUpgradeTmdbImage(url, wide = false) {
  const value = String(url || '').trim();
  if (!value || !value.includes('image.tmdb.org/t/p/')) return value;
  return value.replace(/\/t\/p\/(?:original|w\d+)\//, `/t/p/${wide ? 'w1280' : 'w780'}/`);
}

function svFeaturedHdStudioItem(item) {
  const next = { ...item };
  if (next.poster) next.poster = svUpgradeTmdbImage(next.poster, false);
  if (next.backdrop) next.backdrop = svUpgradeTmdbImage(next.backdrop, true);
  if (!next.backdrop && next.poster) next.backdrop = next.poster;
  return next;
}

function svPopularFeaturedSection(all, key, limit = 500) {
  const bestByKey = new Map();
  for (const item of all) {
    if (!item || !(item.poster || item.backdrop)) continue;
    const ranked = svFeaturedMediaScore(item, key);
    if (!ranked.score) continue;
    const dedupeKey = svFeaturedDedupeKey(item, key, ranked.phrase);
    const candidate = { item, score: ranked.score, phrase: ranked.phrase };
    const current = bestByKey.get(dedupeKey);
    if (!current || svBetterFeaturedCandidate(current, candidate) < 0) bestByKey.set(dedupeKey, candidate);
  }
  return [...bestByKey.values()]
    .sort((a, b) => b.score - a.score)
    .map(hit => (key === 'marvel' || key === 'dc') ? svFeaturedHdStudioItem(hit.item) : hit.item)
    .slice(0, limit);
}

function svStudioScore(item, key) {
  const titleText = svHomeTitleText(item);
  const companies = svHasStudioCompany(item, key) ? 500 : 0;
  let keywordScore = 0;
  for (const phrase of SV_STUDIO_KEYWORDS[key] || []) {
    const p = svNormalizeSearchText(phrase);
    if (!p) continue;
    if (titleText === p) keywordScore = Math.max(keywordScore, 450);
    else if (titleText.startsWith(p + ' ')) keywordScore = Math.max(keywordScore, 360);
    else if (titleText.includes(' ' + p + ' ') || titleText.includes(p)) keywordScore = Math.max(keywordScore, 260);
  }
  if (!companies && !keywordScore) return 0;
  const art = (item.poster || item.backdrop) ? 60 : 0;
  const rating = Math.min(100, Math.round(svRatingNum(item) * 10));
  const year = Math.max(0, Math.min(40, svYearNum(item) - 1985));
  return companies + keywordScore + art + rating + year;
}

function svStudioSection(all, key, limit = 500) {
  const seen = new Set();
  return all
    .map(item => ({ item, score: svStudioScore(item, key) }))
    .filter(hit => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(hit => hit.item)
    .filter(item => {
      const key = `${svNormalizeSearchText(item.name || item.title || '')}|${item.year || ''}|${item.type || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function svLatestNetflixSection(all) {
  return svPopularFeaturedSection(all, 'netflix').slice(5);
}


function svSectionList(key) {
  const cacheKey = String(key || 'allMovies');
  if (svSectionListCache.has(cacheKey)) return svSectionListCache.get(cacheKey);
  const moviesOnly = svNormalMovieItems();
  const seriesOnly = svNormalSeriesItems();
  const all = [...moviesOnly, ...seriesOnly];
  let list;
  const pick = (list, fn) => svHomeSort(list.filter(item => fn(svHomeText(item), item)));
  switch (key) {
    case 'series': list = svHomeSort(seriesOnly); break;
    case 'allMovies': list = svHomeSort(moviesOnly); break;
    case 'topRated': list = svHomeSort(all.filter(i => svRatingNum(i) >= 8)); break;
    case 'new': case 'recentlyAdded': list = svHomeSort(all).sort((a,b)=>svYearNum(b)-svYearNum(a)); break;
    case 'trending': case 'mostWatchedToday': list = svHomeSort(all).slice(0, 300); break;
    case 'netflix': list = svLatestNetflixSection(all); break;
    case 'marvel': list = svPopularFeaturedSection(all, 'marvel'); break;
    case 'dc': list = svPopularFeaturedSection(all, 'dc'); break;
    case 'universal': list = svStudioSection(all, 'universal'); break;
    case 'disney': list = svStudioSection(all, 'disney'); break;
    case 'warner': list = svStudioSection(all, 'warner'); break;
    case 'hbo': list = svStudioSection(all, 'hbo'); break;
    case 'apple': list = svStudioSection(all, 'apple'); break;
    case 'indian': list = pick(all, t => svHasAny(t, ['hindi','bangla','bengali','kolkata','tamil','telugu','malayalam','kannada','punjabi','bollywood','south indian','india'])); break;
    case 'anime': list = pick(all, t => svHasAny(t, ['anime','animation','japanese','demon slayer','naruto','one piece','jujutsu','attack on titan'])); break;
    case 'koreanDrama': list = pick(all, t => svHasAny(t, ['korean','k-drama','k drama','korea'])); break;
    case 'horrorNights': list = pick(all, t => svHasAny(t, ['horror','ghost','haunt','demon','evil','conjuring','scream','strangers'])); break;
    case 'cyberpunkScifi': list = pick(all, t => svHasAny(t, ['sci-fi','science fiction','cyberpunk','space','alien','robot','ai','future','matrix','blade runner'])); break;
    case 'mindfuck': list = pick(all, t => svHasAny(t, ['mind','dream','memory','loop','inception','tenet','shutter island','memento','black mirror'])); break;
    case 'cultClassics': list = pick(all, t => svHasAny(t, ['cult','classic','pulp fiction','fight club','trainspotting','big lebowski'])); break;
    case 'a24': list = pick(all, t => svHasAny(t, ['a24','hereditary','midsommar','moonlight','lady bird','ex machina','uncut gems','everything everywhere'])); break;
    case 'nostalgia90s': list = pick(all, (t,i) => svYearNum(i) >= 1990 && svYearNum(i) <= 1999); break;
    case 'midnightCinema': list = pick(all, t => svHasAny(t, ['midnight','neon','noir','cult','horror','thriller'])); break;
    case 'trueCrime': list = pick(all, t => svHasAny(t, ['true crime','crime documentary','serial killer','murder','detective'])); break;
    case 'psychThriller': list = pick(all, t => svHasAny(t, ['psychological','thriller','mystery','suspense','obsession'])); break;
    case 'adultAnimation': list = pick(all, t => svHasAny(t, ['adult animation','rick and morty','family guy','south park','bojack'])); break;
    case 'postApocalyptic': list = pick(all, t => svHasAny(t, ['apocalypse','post-apocalyptic','zombie','wasteland','last of us','walking dead'])); break;
    case 'feelGood': list = pick(all, t => svHasAny(t, ['comedy','family','feel good','romance','adventure'])); break;
    case 'darkComedy': list = pick(all, t => svHasAny(t, ['dark comedy','black comedy','satire'])); break;
    case 'timeTravel': list = pick(all, t => svHasAny(t, ['time travel','time loop','back to the future','timeline'])); break;
    case 'spaceAi': list = pick(all, t => svHasAny(t, ['space','artificial intelligence',' ai ','robot','mars','moon','interstellar'])); break;
    case 'crimeSyndicates': list = pick(all, t => svHasAny(t, ['crime','mafia','gang','cartel','syndicate','godfather','peaky blinders'])); break;
    case 'zombie': list = pick(all, t => svHasAny(t, ['zombie','undead','walking dead','resident evil'])); break;
    case 'indieGems': list = pick(all, t => svHasAny(t, ['indie','festival','independent'])); break;
    case 'hiddenMasterpieces': list = svHomeSort(all.filter(i => svRatingNum(i) >= 7 && (i.poster || i.backdrop))).slice(0, 500); break;
    case 'liveConcerts': list = pick(all, t => svHasAny(t, ['concert','music','live','documentary'])); break;
    case 'documentaryVault': list = pick(all, t => svHasAny(t, ['documentary','docu','nature','history','biography'])); break;
    case 'ghibli': list = pick(all, t => svHasAny(t, ['ghibli','miyazaki','spirited away','totoro','howl'])); break;
    case 'romanceMidnight': list = pick(all, t => svHasAny(t, ['romance','romantic','love','relationship'])); break;
    case 'comingSoon': list = svHomeSort(all.filter(i => svYearNum(i) >= new Date().getFullYear())); break;
    case 'drama': list = pick(all, t => svHasAny(t, ['drama','emotion','life','family'])); break;
    case 'spanish': list = pick(all, t => svHasAny(t, ['spanish','latino','latin','mexico','argentina','colombia'])); break;
    default: list = svHomeSort(all); break;
  }
  svSectionListCache.set(cacheKey, list);
  return list;
}

app.get('/api/section/:key', (req, res) => {
  try {
    const key = String(req.params.key || 'allMovies');
    const page = Math.max(0, parseInt(req.query.page || '0', 10) || 0);
    const limit = Math.min(120, Math.max(1, parseInt(req.query.limit || '24', 10) || 24));
    const prebuilt = req.query.summary === '1' && page === 0
      ? Array.from(SV_PREBUILT_HOME_ROWS.values()).find(row => row.sectionKey === key)
      : null;
    if (!SV_DYNAMIC_HOME_SECTION_KEYS.has(key) && prebuilt?.items?.length >= Math.min(limit, SV_HOME_MIN_PREBUILT_ITEMS)) {
      const items = prebuilt.items.slice(0, limit);
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
      res.setHeader('X-StreamVault-Section', 'prebuilt');
      return res.json({ key, items, total:prebuilt.items.length, page:0, pages:1 });
    }
    const list = svSectionList(key);
    const start = page * limit;
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ key, items:list.slice(start, start + limit), total:list.length, page, pages:Math.ceil(list.length / limit) || 1 });
  } catch (e) {
    console.error('/api/section error:', e.message);
    res.json({ key:req.params.key, items:[], total:0, page:0, pages:0 });
  }
});

app.get('/api/home-feed', (req, res) => {
  try {
    const limit = Math.min(50, Math.max(6, parseInt(req.query.limit || '18', 10) || 18));
    const prebuilt = svPrebuiltHomePayload(limit);
    if (prebuilt) {
      let json = svPrebuiltHomeJsonCache.get(limit);
      if (!json) {
        json = JSON.stringify(prebuilt);
        svPrebuiltHomeJsonCache.set(limit, json);
      }
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
      res.setHeader('X-StreamVault-Feed', 'prebuilt');
      return res.type('application/json').send(json);
    }
    const rows = SV_HOME_SECTIONS.map(([rowId, sectionKey, title]) => {
      const items = svSectionList(sectionKey).slice(0, limit);
      return { rowId, sectionKey, title, items };
    }).filter(row => row.items.length);
    const hero = (rows.find(r => r.rowId === 'newRow')?.items || rows[0]?.items || [])
      .filter(item => item.poster || item.backdrop)
      .slice(0, 10);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ ok:true, hero, rows });
  } catch (e) {
    console.error('/api/home-feed error:', e.message);
    res.json({ ok:false, hero:[], rows:[] });
  }
});

app.get('/api/movies', (req, res) => {
  try {
    const localMovies = _movieList || buildMovieListSync();

    const ftpMoviesRaw = getCachedMovies();
    const ftpMovies = ftpMoviesRaw
      .filter(m => !isCartoonOrAnime(m))
      .map((m, i) => ({
        id:        `ftp_${i}`,
        name:      m.title,
        title:     m.title,
        file:      m.filename,
        poster:    m.poster    || null,
        backdrop:  m.backdrop   || m.poster || null,
        tmdbId:    m.tmdbId    || null,
        year:      m.year      || '',
        rating:    m.rating    || null,
        type:      'movie',
        genre:     m.genre     || '',
        category:  m.category  || '',
        streamUrl: m.streamUrl,
        isFtp:     true,
      }));

    const seenLocal = new Set(localMovies.map(m => `${String(m.name || m.title || '').toLowerCase()}|${m.year || ''}`));
    const ftpFiltered = ftpMovies.filter(m => !seenLocal.has(`${String(m.name || m.title || '').toLowerCase()}|${m.year || ''}`));
    const baseMovies = [...localMovies, ...ftpFiltered];

    // IMPORTANT: massive catalog is SEARCH-ONLY here.
    // Default movies page stays poster-rich and does not pollute homepage/browse with 500k null-poster items.
    let allMovies = baseMovies;
    const hasSearch = String(req.query.q || '').trim().length >= 2;
    if (hasSearch && String(req.query.massive || '1') !== '0') {
      loadMassiveCatalog();
      const seen = new Set(baseMovies.map(m => `${String(m.name || m.title || '').toLowerCase()}|${m.year || ''}|${m.streamUrl || m.id || ''}`));
      const extra = _massiveMovies.filter(m => {
        const key = `${String(m.name || m.title || '').toLowerCase()}|${m.year || ''}|${m.streamUrl || m.id || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      allMovies = [...baseMovies, ...extra];
    }

    const paged = svFilterPaged(allMovies, req, true, 'movies');
    res.json({
      movies: paged.items,
      total:  paged.list.length,
      page:   paged.page,
      pages:  paged.pages,
    });
  } catch (e) { console.error('/api/movies error:', e.message); res.json({ movies: [], total: 0, page: 0, pages: 0 }); }
});

app.get('/api/search', (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(120, Math.max(1, parseInt(req.query.limit || '72', 10) || 72));
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    if (q.length < 2) return res.json({ items: [], total: 0, page, pages: 0, instant: true });

    const kindRaw = String(req.query.kind || req.query.type || 'mixed').toLowerCase();
    const kind = kindRaw === 'movie' || kindRaw === 'movies' ? 'movie' : (kindRaw === 'series' || kindRaw === 'tv' || kindRaw === 'show' || kindRaw === 'shows' ? 'series' : 'mixed');
    const list = svFastSearch(req, kind) || [];
    const start = (page - 1) * limit;
    res.json({
      items: list.slice(start, start + limit),
      total: list.length,
      page,
      pages: Math.ceil(list.length / limit) || 1,
      instant: true,
      indexed: true
    });
  } catch (e) {
    console.error('/api/search error:', e.message);
    res.json({ items: [], total: 0, page: 1, pages: 0, instant: false, error: e.message });
  }
});

app.get('/api/catalog-stats', (req, res) => {
  try {
    loadMassiveCatalog();
    res.json({
      ok: true,
      homepageUntouched: true,
      existingMovies: (_movieList || buildMovieListSync()).length + getCachedMovies().length,
      existingSeries: (_seriesList || buildSeriesListSync()).length + getCachedSeries().length,
      massiveMovies: _massiveMovies.length,
      massiveSeries: _massiveSeries.length,
      massiveTotal: _massiveMovies.length + _massiveSeries.length
    });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

app.get('/api/movies/keywords', (req, res) => {
  const kw = (req.query.q || '').toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
  if (!kw.length) return res.json([]);
  const all = getCachedMovies().filter(m => !isCartoonOrAnime(m));
  const matched = all.filter(m => {
    const t = (m.title || '').toLowerCase().replace(/[\.\-_]/g, ' ');
    return kw.some(k => t.includes(k));
  }).slice(0, 200);

  res.json(matched.map((m, i) => {
    let poster = m.poster || null;
    let rating = m.rating || null;
    let year = m.year || '';
    let genre = m.genre || '';
    if (!poster) {
      const cleaned = cleanTitle(m.title || '');
      const cacheHit = posterCache[cleaned] || Object.values(posterCache).find(v =>
        v && cleaned && (v.title||'').toLowerCase() === cleaned.toLowerCase()
      );
      if (cacheHit) {
        poster = cacheHit.poster || null;
        rating = rating || cacheHit.rating || null;
        genre  = genre  || cacheHit.genre  || '';
      }
    }
    return {
      id: `ftp_kw_${i}`, name: m.title, file: m.filename || '',
      tmdbId: m.tmdbId || null,
      poster, year, rating, type: 'movie', genre, streamUrl: m.streamUrl, isFtp: true,
    };
  }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// API: SERIES (with cartoon filter applied)
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/api/series', (req, res) => {
  try {
    const localSeries = _seriesList || buildSeriesListSync();
    const limit = Math.max(0, parseInt(req.query.limit || '0', 10) || 0);
    const hasQuery = !!String(req.query.q || '').trim();

    // Fast path for small browse/stress requests. The old code called
    // getCachedSeries() first, which deduplicates the entire remote series
    // catalog synchronously before honoring `limit`. On a large catalog that
    // can block the Node event loop long enough for Cloudflare to return 502s
    // for this request and unrelated concurrent requests.
    const fastLimitedBrowse = limit > 0 && !hasQuery;
    const ftpSeriesRaw = fastLimitedBrowse ? ftpCatalog.series : getCachedSeries();
    const ftpSource = fastLimitedBrowse
      ? ftpSeriesRaw.slice(0, Math.max(limit - localSeries.length, 0))
      : ftpSeriesRaw;
    const ftpSeries = ftpSource
      .filter(s => !isCartoonOrAnime(s))
      .map(s => ({
        name:   s.title,
        title:  s.title,
        poster: s.poster  || null,
        backdrop: s.backdrop || s.poster || null,
        tmdbId: s.tmdbId  || null,
        year:   s.year    || '',
        rating: s.rating  || null,
        genre:  s.genre   || '',
        type:   'series',
        isFtp:  true,
        seasons: s.seasons.reduce((acc, seasonObj) => {
          const num = parseInt(seasonObj.season.match(/\d+/)?.[0] || '1');
          acc[num] = seasonObj.episodes.map((e, i) => {
            const parsed = parseSeriesFilename(e.filename);
            const epNum  = parsed?.episode || i + 1;
            const epTitle = (parsed?.epTitle && parsed.epTitle.trim())
              ? parsed.epTitle.trim()
              : `Episode ${epNum}`;
            return {
              streamId:  null,
              episode:   epNum,
              epTitle,
              file:      e.filename,
              streamUrl: e.streamUrl,
              isFtp:     true,
            };
          });
          return acc;
        }, {}),
      }));

    const seenShows = new Set(localSeries.map(s => String(s.name || s.title || '').toLowerCase()));
    const baseSeries = [...localSeries, ...ftpSeries.filter(s => !seenShows.has(String(s.name || s.title || '').toLowerCase()))];
    let allSeries = baseSeries;

    const hasSearch = String(req.query.q || '').trim().length >= 2;
    if (hasSearch && String(req.query.massive || '1') !== '0') {
      loadMassiveCatalog();
      const seen = new Set(baseSeries.map(s => `${String(s.name || s.title || '').toLowerCase()}|${s.year || ''}`));
      allSeries = [...baseSeries, ..._massiveSeries.filter(s => {
        const key = `${String(s.name || s.title || '').toLowerCase()}|${s.year || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })];
      const paged = svFilterPaged(allSeries, req, true, 'series');
      return res.json({ series: paged.items, total: paged.list.length, page: paged.page, pages: paged.pages });
    }

    if (String(req.query.page || '') !== '' || String(req.query.q || '').trim()) {
      const paged = svFilterPaged(allSeries, req, true, 'series');
      return res.json({ series: paged.items, total: paged.list.length, page: paged.page, pages: paged.pages });
    }

    res.json(limit ? allSeries.slice(0, limit) : allSeries);
  } catch (e) { console.error('/api/series error:', e.message); res.json([]); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TMDB — episode data (titles, thumbnails, overviews)
// GET /api/episode-titles?show=Breaking+Bad&season=1
// ═══════════════════════════════════════════════════════════════════════════════
const EP_CACHE_FILE = path.join(__dirname, 'episode-title-cache.json');
let epTitleCache = {};
try { if (fs.existsSync(EP_CACHE_FILE)) epTitleCache = JSON.parse(fs.readFileSync(EP_CACHE_FILE, 'utf8')); } catch {}
function saveEpCache() { try { fs.writeFileSync(EP_CACHE_FILE, JSON.stringify(epTitleCache, null, 2)); } catch {} }

function tmdbGet(path) {
  return new Promise(resolve => {
    const req2 = https.get(
      `https://api.themoviedb.org/3${path}`,
      { headers: { Authorization: `Bearer ${TMDB_TOKEN}`, Accept: 'application/json' } },
      r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
      }
    );
    req2.on('error', () => resolve(null));
    req2.setTimeout(8000, () => { req2.destroy(); resolve(null); });
  });
}

const TITLE_DETAILS_CACHE_MS = 6 * 60 * 60 * 1000;
const titleDetailsCache = new Map();
const DETAIL_CACHE_FILE = path.join(__dirname, 'detail-cache.json');
let diskDetailCache = {};
try {
  if (process.env.DEBUG_DETAIL_RESET === '1') {
    diskDetailCache = {};
    fs.writeFileSync(DETAIL_CACHE_FILE, '{}');
  } else if (fs.existsSync(DETAIL_CACHE_FILE)) {
    diskDetailCache = JSON.parse(fs.readFileSync(DETAIL_CACHE_FILE, 'utf8'));
  }
} catch (e) {
  console.warn('Could not load detail-cache.json:', e.message);
  diskDetailCache = {};
}

function saveDetailCache() {
  try { fs.writeFileSync(DETAIL_CACHE_FILE, JSON.stringify(diskDetailCache, null, 2)); }
  catch (e) { console.warn('Could not save detail-cache.json:', e.message); }
}

function withTimeout(promise, ms, fallback) {
  let timer;
  return Promise.race([
    promise,
    new Promise(resolve => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function tmdbImage(size, imgPath) {
  return imgPath ? `${TMDB_IMG}/${size}${imgPath}` : null;
}

function requestMediaType(query) {
  const rawType = String(query.type || query.mediaType || '').toLowerCase();
  const rawId = String(query.id || '');
  if (rawId.startsWith('tmdb_tv_')) return 'tv';
  if (['tv', 'series', 'show'].includes(rawType)) return 'tv';
  return 'movie';
}

function tmdbIdFromRequest(query, mediaType) {
  const direct = String(query.tmdbId || '').trim();
  if (/^\d+$/.test(direct)) return direct;
  const rawId = String(query.id || '').trim();
  if (mediaType === 'tv') {
    const m = rawId.match(/^tmdb_tv_(\d+)$/);
    return m ? m[1] : '';
  }
  const m = rawId.match(/^tmdb_(\d+)$/);
  return m ? m[1] : '';
}

function resultTitle(item, mediaType) {
  return mediaType === 'tv' ? (item?.name || item?.original_name || '') : (item?.title || item?.original_title || '');
}

function resultYear(item, mediaType) {
  const date = mediaType === 'tv' ? item?.first_air_date : item?.release_date;
  return String(date || '').slice(0, 4);
}

function cleanSearchTitle(title) {
  return normalizeDetailTitle(title).title;
}

function splitSearchTitleYear(title, year = '') {
  const normalized = normalizeDetailTitle(title, year);
  return { title: normalized.title, year: normalized.year };
}

function pickTmdbResult(results, title, year, mediaType) {
  const clean = cleanSearchTitle(title).toLowerCase();
  const desiredYear = String(year || '').slice(0, 4);
  const cleanWords = new Set(clean.split(/\s+/).filter(w => w.length > 1));
  return (results || [])
    .map(item => {
      const name = resultTitle(item, mediaType).toLowerCase();
      const itemYear = resultYear(item, mediaType);
      const nameWords = new Set(name.split(/\s+/).filter(w => w.length > 1));
      let overlap = 0;
      cleanWords.forEach(w => { if (nameWords.has(w)) overlap++; });
      const titleOverlap = cleanWords.size ? overlap / Math.max(cleanWords.size, nameWords.size) : 0;
      const titleMatch = name === clean || (clean.length >= 4 && (name.includes(clean) || clean.includes(name))) || titleOverlap >= 0.55;
      let score = Number(item.popularity || 0) / 100;
      if (name === clean) score += 20;
      if (clean.length >= 4 && (name.includes(clean) || clean.includes(name))) score += 8;
      if (titleOverlap >= 0.55) score += titleOverlap * 6;
      if (desiredYear && itemYear === desiredYear) score += 8;
      if (item.poster_path) score += 2;
      if (!titleMatch) score = 0;
      return { item, score };
    })
    .filter(x => x.score >= 5)
    .sort((a, b) => b.score - a.score)[0]?.item || null;
}

async function searchTmdbMedia(title, year, mediaType) {
  const normalized = splitSearchTitleYear(title, year);
  const clean = normalized.title;
  const searchYear = normalized.year;
  if (!clean) return null;
  const endpoint = mediaType === 'tv' ? '/search/tv' : '/search/movie';
  const yearParam = searchYear
    ? mediaType === 'tv'
      ? `&first_air_date_year=${encodeURIComponent(searchYear)}`
      : `&year=${encodeURIComponent(searchYear)}`
    : '';
  let data = await tmdbGet(`${endpoint}?query=${encodeURIComponent(clean)}${yearParam}&include_adult=false&language=en-US&page=1`);
  let picked = pickTmdbResult(data?.results || [], clean, searchYear, mediaType);
  if (!picked && yearParam) {
    data = await tmdbGet(`${endpoint}?query=${encodeURIComponent(clean)}&include_adult=false&language=en-US&page=1`);
    picked = pickTmdbResult(data?.results || [], clean, searchYear, mediaType);
  }
  if (picked) console.log('[Details] TMDB matched', picked.id, resultTitle(picked, mediaType), resultYear(picked, mediaType));
  return picked;
}

function mapTmdbMediaCard(item, fallbackType) {
  const mediaType = item.media_type === 'tv' || fallbackType === 'tv' ? 'tv' : 'movie';
  const name = resultTitle(item, mediaType);
  if (!item?.id || !name) return null;
  const card = {
    id: mediaType === 'tv' ? `tmdb_tv_${item.id}` : `tmdb_${item.id}`,
    tmdbId: item.id,
    name,
    type: mediaType,
    poster: tmdbImage('w500', item.poster_path),
    backdrop: tmdbImage('w1280', item.backdrop_path),
    overview: item.overview || '',
    year: resultYear(item, mediaType),
    rating: item.vote_average ? Number(item.vote_average).toFixed(1) : null,
    genre: (item.genre_ids || []).slice(0, 3).map(id => TMDB_GENRES[id]).filter(Boolean).join(', '),
    isTrending: true,
    streamUrl: null,
    isFtp: false,
  };
  if (mediaType === 'tv') card.seasons = {};
  return card;
}

function mapUniqueMedia(items, fallbackType, currentId) {
  const seen = new Set();
  return (items || [])
    .map(item => mapTmdbMediaCard(item, item.media_type || fallbackType))
    .filter(item => {
      if (!item) return false;
      if (String(item.tmdbId) === String(currentId) && (item.type || fallbackType) === fallbackType) return false;
      const key = `${item.type}:${item.tmdbId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
}

function mapVideos(videos) {
  const priority = { Trailer: 0, Teaser: 1 };
  return (videos || [])
    .filter(v => v?.site === 'YouTube' && v.key && (v.type === 'Trailer' || v.type === 'Teaser'))
    .sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9) || Number(!!b.official) - Number(!!a.official))
    .slice(0, 12)
    .map(v => ({
      name: v.name || v.type || 'Trailer',
      type: v.type || 'Video',
      key: v.key,
      url: `https://www.youtube.com/watch?v=${v.key}`,
      embedUrl: `https://www.youtube.com/embed/${v.key}`,
      thumbnail: `https://img.youtube.com/vi/${v.key}/hqdefault.jpg`,
      publishedAt: v.published_at || '',
      source: 'TMDB',
    }));
}

function httpsGetJson(url, headers = {}) {
  return new Promise(resolve => {
    const req = https.get(url, { headers: { Accept: 'application/json', ...headers } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

async function youtubeTrailerFallback(title, year, mediaType) {
  if (!YOUTUBE_API_KEY || !title) return [];
  const query = `${title} ${year || ''} ${mediaType === 'tv' ? 'series' : 'movie'} official trailer`;
  const data = await httpsGetJson(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=6&q=${encodeURIComponent(query)}&key=${encodeURIComponent(YOUTUBE_API_KEY)}`
  );
  return (data?.items || []).map(item => {
    const key = item?.id?.videoId;
    if (!key) return null;
    return {
      name: item.snippet?.title || 'Official Trailer',
      type: 'Trailer',
      key,
      url: `https://www.youtube.com/watch?v=${key}`,
      embedUrl: `https://www.youtube.com/embed/${key}`,
      thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || `https://img.youtube.com/vi/${key}/hqdefault.jpg`,
      publishedAt: item.snippet?.publishedAt || '',
      source: 'YouTube Data API',
    };
  }).filter(Boolean);
}

function mapPeople(people, roleField, limit = 16) {
  const seen = new Set();
  return (people || [])
    .filter(p => p?.name)
    .filter(p => {
      if (!p.id) return true;
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .slice(0, limit)
    .map(p => ({
      id: p.id || null,
      name: p.name,
      role: p[roleField] || p.job || p.department || '',
      image: tmdbImage('w185', p.profile_path),
    }));
}

function mapCompanies(companies) {
  return (companies || [])
    .filter(c => c?.name)
    .slice(0, 12)
    .map(c => ({
      id: c.id || null,
      name: c.name,
      logo: tmdbImage('w300', c.logo_path),
      country: c.origin_country || '',
    }));
}

function movieCertification(releaseDates) {
  const country = (releaseDates?.results || []).find(r => r.iso_3166_1 === 'US') || releaseDates?.results?.[0];
  const cert = (country?.release_dates || []).find(r => r.certification)?.certification;
  return cert || '';
}

function tvCertification(contentRatings) {
  const country = (contentRatings?.results || []).find(r => r.iso_3166_1 === 'US') || contentRatings?.results?.[0];
  return country?.rating || '';
}

function selectDirector(detail, credits, mediaType) {
  const crew = credits?.crew || [];
  return crew.find(p => p.job === 'Director')
    || crew.find(p => /director/i.test(p.job || ''))
    || (mediaType === 'tv' ? detail?.created_by?.[0] : null)
    || null;
}

async function moreByDirector(detail, credits, mediaType) {
  const person = selectDirector(detail, credits, mediaType);
  if (!person?.id) return { person: null, items: [] };
  const data = await tmdbGet(`/person/${person.id}/combined_credits?language=en-US`);
  const creditsList = (data?.crew || [])
    .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
    .filter(item => {
      if (mediaType === 'movie') return /director/i.test(item.job || '');
      return /director|creator|writer|producer|showrunner/i.test(item.job || '');
    })
    .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));
  return {
    person: {
      id: person.id,
      name: person.name,
      role: person.job || (mediaType === 'tv' ? 'Creator' : 'Director'),
      image: tmdbImage('w185', person.profile_path),
    },
    items: mapUniqueMedia(creditsList, mediaType, detail.id),
  };
}

function formatDateLabel(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function languageLabel(detail) {
  if (Array.isArray(detail?.spoken_languages) && detail.spoken_languages.length) {
    return detail.spoken_languages.map(l => l.english_name || l.name).filter(Boolean).slice(0, 3).join(', ');
  }
  return detail?.original_language ? String(detail.original_language).toUpperCase() : '';
}

function aboutItems(detail, mediaType) {
  const isTv = mediaType === 'tv';
  const releaseDate = isTv ? detail.first_air_date : detail.release_date;
  const runtime = isTv
    ? detail.episode_run_time?.[0] ? `${detail.episode_run_time[0]} min episodes` : ''
    : detail.runtime ? `${detail.runtime} min` : '';
  const certification = isTv ? tvCertification(detail.content_ratings) : movieCertification(detail.release_dates);
  return [
    { label: 'Year', value: String(releaseDate || '').slice(0, 4) },
    { label: isTv ? 'First Aired' : 'Released', value: formatDateLabel(releaseDate) },
    { label: 'Runtime', value: runtime },
    { label: 'Rating', value: certification },
    { label: 'Genres', value: (detail.genres || []).map(g => g.name).join(', ') },
    { label: 'Language', value: languageLabel(detail) },
    { label: 'Origin', value: (detail.origin_country || detail.production_countries || []).map(c => c.name || c).join(', ') },
    { label: 'Status', value: detail.status || '' },
    isTv ? { label: 'Seasons', value: detail.number_of_seasons ? String(detail.number_of_seasons) : '' } : null,
    isTv ? { label: 'Episodes', value: detail.number_of_episodes ? String(detail.number_of_episodes) : '' } : null,
    isTv ? { label: 'Networks', value: (detail.networks || []).map(n => n.name).join(', ') } : null,
  ].filter(item => item && item.value);
}

async function tmdbExternalIds(mediaType, tmdbId) {
  if (!tmdbId) return {};
  return await tmdbGet(`/${mediaType}/${tmdbId}/external_ids`) || {};
}

async function omdbByImdbId(imdbId) {
  if (!OMDB_KEY || !imdbId) return null;
  return await httpsGetJson(`https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(OMDB_KEY)}`);
}

function omdbRatingValue(omdb, source) {
  const item = (omdb?.Ratings || []).find(r => r.Source === source);
  return item?.Value && item.Value !== 'N/A' ? item.Value : '';
}

function ratingItems(detail, externalIds = {}, omdb = null) {
  const external = externalIds || {};
  const voteAverage = Number(detail.vote_average || 0);
  const imdbValue = omdbRatingValue(omdb, 'Internet Movie Database')
    || (omdb?.imdbRating && omdb.imdbRating !== 'N/A' ? `${omdb.imdbRating}/10` : '');
  const rtValue = omdbRatingValue(omdb, 'Rotten Tomatoes');
  const metacriticValue = omdbRatingValue(omdb, 'Metacritic')
    || (omdb?.Metascore && omdb.Metascore !== 'N/A' ? `${omdb.Metascore}/100` : '');
  return [
    {
      source: 'TMDB',
      value: voteAverage ? `${voteAverage.toFixed(1)}/10` : 'No Data Available',
      subvalue: detail.vote_count ? `${detail.vote_count.toLocaleString()} votes` : '',
      available: !!voteAverage,
    },
    {
      source: 'IMDb',
      value: imdbValue || 'No Data Available',
      subvalue: external.imdb_id ? `ID ${external.imdb_id}` : '',
      url: external.imdb_id ? `https://www.imdb.com/title/${external.imdb_id}/` : '',
      available: !!imdbValue,
    },
    { source: 'Rotten Tomatoes', value: rtValue || 'No Data Available', subvalue: omdb ? 'OMDb' : '', available: !!rtValue },
    { source: 'Metacritic', value: metacriticValue || 'No Data Available', subvalue: omdb ? 'OMDb' : '', available: !!metacriticValue },
  ];
}

function emptyTitleDetails(mediaType, title = '') {
  return {
    ok: false,
    type: mediaType,
    title,
    ratings: [],
    trailers: [],
    cast: [],
    crew: [],
    productionCompanies: [],
    similar: [],
    moreByDirector: [],
    director: null,
    about: [],
    playbackInfo: [],
  };
}

function tmdbRatingItemsOnly(detail) {
  const voteAverage = Number(detail?.vote_average || 0);
  return voteAverage ? [{
    source: 'TMDB',
    value: `${voteAverage.toFixed(1)}/10`,
    subvalue: detail.vote_count ? `${detail.vote_count.toLocaleString()} votes` : '',
    available: true,
  }] : [];
}

function hasExtendedDetail(data) {
  return !!data && (
    (Array.isArray(data.trailers) && data.trailers.length) ||
    (Array.isArray(data.cast) && data.cast.length) ||
    (Array.isArray(data.crew) && data.crew.length) ||
    (Array.isArray(data.productionCompanies) && data.productionCompanies.length) ||
    (Array.isArray(data.similar) && data.similar.length) ||
    (Array.isArray(data.moreByDirector) && data.moreByDirector.length)
  );
}

async function buildTmdbExtendedDetails(mediaType, tmdbId, title, year) {
  let resolvedId = tmdbId;
  let searchResult = null;
  if (!resolvedId) {
    searchResult = await searchTmdbMedia(title, year, mediaType);
    resolvedId = searchResult?.id;
  }
  console.log(`[Details] TMDB id: ${resolvedId || 'none'} (${mediaType}${title ? `: ${title}` : ''})`);
  if (!resolvedId) return emptyTitleDetails(mediaType, title);

  const [
    detailRaw,
    creditsRaw,
    videosRaw,
    externalIdsRaw,
    similarRaw,
    recommendationsRaw,
    ratingsMetaRaw,
  ] = await Promise.all([
    tmdbGet(`/${mediaType}/${resolvedId}?language=en-US`),
    tmdbGet(`/${mediaType}/${resolvedId}/credits?language=en-US`),
    tmdbGet(`/${mediaType}/${resolvedId}/videos?language=en-US`),
    tmdbExternalIds(mediaType, resolvedId),
    tmdbGet(`/${mediaType}/${resolvedId}/similar?language=en-US&page=1`),
    tmdbGet(`/${mediaType}/${resolvedId}/recommendations?language=en-US&page=1`),
    tmdbGet(mediaType === 'tv' ? `/tv/${resolvedId}/content_ratings` : `/movie/${resolvedId}/release_dates`),
  ]);

  const detail = detailRaw?.id ? detailRaw : {
    id: Number(resolvedId),
    title: mediaType === 'movie' ? resultTitle(searchResult, mediaType) || title : undefined,
    name: mediaType === 'tv' ? resultTitle(searchResult, mediaType) || title : undefined,
    overview: searchResult?.overview || '',
    poster_path: searchResult?.poster_path || null,
    backdrop_path: searchResult?.backdrop_path || null,
    release_date: searchResult?.release_date || '',
    first_air_date: searchResult?.first_air_date || '',
    vote_average: searchResult?.vote_average || 0,
    vote_count: searchResult?.vote_count || 0,
    genres: [],
    status: '',
  };
  if (!detail?.id) return emptyTitleDetails(mediaType, title);
  console.log('[Details] TMDB matched', detail.id, mediaType === 'tv' ? detail.name : detail.title, resultYear(detail, mediaType));

  const credits = creditsRaw || {};
  const externalIds = externalIdsRaw || {};
  const createdBy = mediaType === 'tv'
    ? (detail.created_by || []).map(p => ({ ...p, job: 'Creator' }))
    : [];
  let trailers = mapVideos(videosRaw?.results || []);
  if (!trailers.length) trailers = await youtubeTrailerFallback(mediaType === 'tv' ? detail.name : detail.title, resultYear(detail, mediaType) || year, mediaType);
  const cast = mapPeople(credits.cast || [], 'character', 18);
  const crew = mapPeople([...createdBy, ...(credits.crew || [])]
    .filter(p => /director|creator|producer|writer|screenplay|showrunner/i.test(p.job || '')), 'job', 18);
  const productionCompanies = mapCompanies(
    detail.production_companies?.length ? detail.production_companies : detail.networks
  );
  const similar = mapUniqueMedia([
    ...(similarRaw?.results || []),
    ...(recommendationsRaw?.results || []),
  ], mediaType, detail.id);
  let directorBundle = { person: null, items: [] };
  try {
    directorBundle = await moreByDirector(detail, credits, mediaType);
  } catch (e) {
    console.warn('[Details] more by director unavailable:', e.message);
  }

  if (mediaType === 'tv') detail.content_ratings = ratingsMetaRaw || null;
  else detail.release_dates = ratingsMetaRaw || null;

  console.log('[Details] result counts', {
    trailers: trailers.length,
    cast: cast.length,
    crew: crew.length,
    companies: productionCompanies.length,
    similar: similar.length,
  });

  return {
    ok: true,
    tmdbId: detail.id,
    imdbId: externalIds.imdb_id || '',
    type: mediaType,
    title: mediaType === 'tv' ? detail.name : detail.title,
    overview: detail.overview || '',
    poster: tmdbImage('w500', detail.poster_path),
    backdrop: tmdbImage('w1280', detail.backdrop_path),
    year: String((mediaType === 'tv' ? detail.first_air_date : detail.release_date) || '').slice(0, 4),
    rating: detail.vote_average ? Number(detail.vote_average).toFixed(1) : null,
    runtime: mediaType === 'movie' && detail.runtime ? `${detail.runtime} min` : '',
    genres: (detail.genres || []).map(g => g.name).join(', '),
    genre: (detail.genres || []).map(g => g.name).join(', '),
    language: languageLabel(detail),
    ratings: tmdbRatingItemsOnly(detail),
    trailers,
    cast,
    crew,
    productionCompanies,
    similar,
    moreByDirector: directorBundle.items,
    director: directorBundle.person,
    about: aboutItems(detail, mediaType),
    playbackInfo: [],
  };
}

async function buildTitleDetails(mediaType, tmdbId, title, year) {
  let resolvedId = tmdbId;
  let searchResult = null;
  if (!resolvedId) {
    searchResult = await searchTmdbMedia(title, year, mediaType);
    resolvedId = searchResult?.id;
  }
  console.log(`[TitleDetails] tmdbId found: ${resolvedId || 'none'} (${mediaType}${title ? `: ${title}` : ''})`);
  if (!resolvedId) return emptyTitleDetails(mediaType, title);

  const [
    detailRaw,
    creditsRaw,
    videosRaw,
    externalIdsRaw,
    similarRaw,
    recommendationsRaw,
    ratingsMetaRaw,
  ] = await Promise.all([
    tmdbGet(`/${mediaType}/${resolvedId}?language=en-US`),
    tmdbGet(`/${mediaType}/${resolvedId}/credits?language=en-US`),
    tmdbGet(`/${mediaType}/${resolvedId}/videos?language=en-US`),
    tmdbExternalIds(mediaType, resolvedId),
    tmdbGet(`/${mediaType}/${resolvedId}/similar?language=en-US&page=1`),
    tmdbGet(`/${mediaType}/${resolvedId}/recommendations?language=en-US&page=1`),
    tmdbGet(mediaType === 'tv' ? `/tv/${resolvedId}/content_ratings` : `/movie/${resolvedId}/release_dates`),
  ]);

  const detail = detailRaw?.id ? detailRaw : {
    id: Number(resolvedId),
    title: mediaType === 'movie' ? resultTitle(searchResult, mediaType) || title : undefined,
    name: mediaType === 'tv' ? resultTitle(searchResult, mediaType) || title : undefined,
    overview: searchResult?.overview || '',
    poster_path: searchResult?.poster_path || null,
    backdrop_path: searchResult?.backdrop_path || null,
    release_date: searchResult?.release_date || '',
    first_air_date: searchResult?.first_air_date || '',
    vote_average: searchResult?.vote_average || 0,
    vote_count: searchResult?.vote_count || 0,
    genres: [],
    status: '',
  };
  if (!detail?.id) return emptyTitleDetails(mediaType, title);

  const externalIds = externalIdsRaw || {};
  const omdb = await omdbByImdbId(externalIds.imdb_id);
  const credits = creditsRaw || {};
  const createdBy = mediaType === 'tv'
    ? (detail.created_by || []).map(p => ({ ...p, job: 'Creator' }))
    : [];
  let trailers = mapVideos(videosRaw?.results || []);
  if (!trailers.length) trailers = await youtubeTrailerFallback(mediaType === 'tv' ? detail.name : detail.title, resultYear(detail, mediaType) || year, mediaType);
  const cast = mapPeople(credits.cast || [], 'character', 18);
  const crew = mapPeople([...createdBy, ...(credits.crew || [])]
    .filter(p => /director|creator|producer|writer|screenplay|showrunner/i.test(p.job || '')), 'job', 18);
  const productionCompanies = mapCompanies(
    detail.production_companies?.length ? detail.production_companies : detail.networks
  );
  const similar = mapUniqueMedia([
    ...(similarRaw?.results || []),
    ...(recommendationsRaw?.results || []),
  ], mediaType, detail.id);
  let directorBundle = { person: null, items: [] };
  try {
    directorBundle = await moreByDirector(detail, credits, mediaType);
  } catch (e) {
    console.warn('[TitleDetails] more by director unavailable:', e.message);
  }

  if (mediaType === 'tv') detail.content_ratings = ratingsMetaRaw || null;
  else detail.release_dates = ratingsMetaRaw || null;

  console.log(`[TitleDetails] external imdb_id found: ${externalIds.imdb_id || 'none'}`);
  console.log(`[TitleDetails] videos count: ${trailers.length}`);
  console.log(`[TitleDetails] cast count: ${cast.length}`);
  console.log(`[TitleDetails] crew count: ${crew.length}`);
  console.log(`[TitleDetails] production companies count: ${productionCompanies.length}`);
  console.log(`[TitleDetails] similar count: ${similar.length}`);

  return {
    ok: true,
    tmdbId: detail.id,
    imdbId: externalIds.imdb_id || '',
    type: mediaType,
    title: mediaType === 'tv' ? detail.name : detail.title,
    overview: detail.overview || '',
    poster: tmdbImage('w500', detail.poster_path),
    backdrop: tmdbImage('w1280', detail.backdrop_path),
    year: String((mediaType === 'tv' ? detail.first_air_date : detail.release_date) || '').slice(0, 4),
    rating: detail.vote_average ? Number(detail.vote_average).toFixed(1) : null,
    runtime: mediaType === 'movie' && detail.runtime ? `${detail.runtime} min` : '',
    genres: (detail.genres || []).map(g => g.name).join(', '),
    language: languageLabel(detail),
    ratings: ratingItems(detail, externalIds, omdb),
    trailers,
    cast,
    crew,
    productionCompanies,
    similar,
    moreByDirector: directorBundle.items,
    director: directorBundle.person,
    about: aboutItems(detail, mediaType),
    playbackInfo: [],
  };
}

app.get('/api/title-details', async (req, res) => {
  const mediaType = requestMediaType(req.query);
  const normalizedTitle = splitSearchTitleYear(req.query.title || req.query.name || '', req.query.year || '');
  const title = normalizedTitle.title;
  const year = normalizedTitle.year;
  const tmdbId = tmdbIdFromRequest(req.query, mediaType);
  const cacheKey = `${mediaType}:${tmdbId || title}:${year}`;
  const cached = titleDetailsCache.get(cacheKey);
  if (cached && Date.now() - cached.time < TITLE_DETAILS_CACHE_MS) {
    res.setHeader('Cache-Control', 'public, max-age=900');
    return res.json(cached.data);
  }

  try {
    const data = await withTimeout(buildTitleDetails(mediaType, tmdbId, title, year), 5000, emptyTitleDetails(mediaType, title));
    titleDetailsCache.set(cacheKey, { time: Date.now(), data });
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.json(data);
  } catch (e) {
    console.error('/api/title-details error:', e.message);
    res.json(emptyTitleDetails(mediaType, title));
  }
});

app.get('/api/version', (req, res) => {
  res.json({ ok: true, version: 'title-details-route-active', time: new Date().toISOString() });
});

app.get('/api/episode-titles', async (req, res) => {
  const { show, season } = req.query;
  if (!show || !season) return res.status(400).json({ error: 'Missing show or season' });

  const cleanShow = show
    .replace(/[\[\(][^\]\)]*[\]\)]/g, '')
    .replace(/\b(720p|1080p|480p|4k|WEBRip|BluRay|x264|x265|HEVC|AAC|NF|AMZN|HDTV)\b.*/i, '')
    .replace(/\s+/g, ' ').trim();

  const cacheKey = `${cleanShow}__S${season}`;
  if (epTitleCache[cacheKey]) return res.json(epTitleCache[cacheKey]);

  try {
    const idKey = `__tmdb_id__${cleanShow}`;
    let tmdbId = epTitleCache[idKey];
    if (!tmdbId) {
      const search = await tmdbGet(`/search/tv?query=${encodeURIComponent(cleanShow)}&page=1`);
      tmdbId = search?.results?.[0]?.id;
      if (!tmdbId) return res.json([]);
      epTitleCache[idKey] = tmdbId;
      saveEpCache();
    }

    const data = await tmdbGet(`/tv/${tmdbId}/season/${season}`);
    if (!data?.episodes?.length) return res.json([]);

    const result = data.episodes.map(e => ({
      episode:  e.episode_number,
      title:    e.name        || '',
      overview: e.overview    || '',
      thumb:    e.still_path  ? TMDB_IMG + e.still_path : null,
      rating:   e.vote_average ? e.vote_average.toFixed(1) : null,
      airDate:  e.air_date    || '',
    }));

    epTitleCache[cacheKey] = result;
    saveEpCache();
    res.json(result);
  } catch (e) {
    console.error('[TMDB] Error:', e.message);
    res.json([]);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// API: MEDIA INFO
// Probed on demand and cached so seek math can use the real source duration.
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/api/media-info/:id', async (req, res) => {
  const idx = parseInt(req.params.id, 10);
  const entry = fileIndex[idx];
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const filePath = entryPath(entry);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });

  try {
    const info = await getCachedMediaInfo(filePath);
    res.json(info);
  } catch (e) {
    console.error(`[Media Info] Error for ${entry.file}:`, e.message);
    res.json({ audioTracks: [], subtitleTracks: [], videoCodec: 'unknown', duration: 0 });
  }
});

// ── Duration info ────
app.get('/api/duration/:id', async (req, res) => {
  const idx = parseInt(req.params.id, 10);
  const entry = fileIndex[idx];
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const filePath = entryPath(entry);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });

  try {
    const info = await getCachedMediaInfo(filePath);
    res.json({ duration: Number(info.duration) || 0 });
  } catch (e) {
    console.error(`[Duration] Error for ${entry.file}:`, e.message);
    res.json({ duration: 0 });
  }
});

// ── Quality info ──────────────────────────────────────────────────────────────
app.get('/api/qualities/:id', (req, res) => {
  const idx = parseInt(req.params.id, 10);
  const entry = fileIndex[idx];
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const filePath = entryPath(entry);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });
  const filename = entry.file;
  let native = 'unknown';
  if (/2160p|4k|uhd/i.test(filename))  native = '2160p';
  else if (/1080p/i.test(filename))     native = '1080p';
  else if (/720p/i.test(filename))      native = '720p';
  else if (/480p/i.test(filename))      native = '480p';
  let sizeMB = 0;
  try { sizeMB = Math.round(fs.statSync(filePath).size / (1024 * 1024)); } catch {}
  res.json({ available: ['auto', '1080p', '720p', '480p', '360p'], native, sizeMB });
});

// ── Subtitles ─────────────────────────────────────────────────────────────────
app.get('/api/subtitles/:id', (req, res) => {
  const idx = parseInt(req.params.id, 10);
  const entry = fileIndex[idx];
  if (!entry) return res.json([]);
  const tracks = findSubtitleTracks(entry.dir, entry.file).map((t, i) => ({ index: i, label: t.label, lang: t.lang, src: `/subtitles/${idx}/${i}` }));
  res.json(tracks);
});

// ── Watch history ─────────────────────────────────────────────────────────────
app.get('/api/history', (req, res) => res.json(watchHistory));
app.post('/api/history', (req, res) => {
  const { id, progress, name, poster, duration } = req.body;
  if (id === undefined || typeof id !== 'number') return res.status(400).json({ error: 'valid id required' });
  if (typeof progress !== 'number' || progress < 0 || progress > 1) return res.status(400).json({ error: 'invalid progress' });
  watchHistory[id] = { progress, name: String(name || '').slice(0, 200), poster: poster || null, duration: duration || 0, updatedAt: Date.now() };
  saveHistory();
  res.json({ ok: true });
});
app.delete('/api/history/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  delete watchHistory[id];
  saveHistory();
  res.json({ ok: true });
});

// ── Refresh poster ────────────────────────────────────────────────────────────
app.get('/api/refresh-poster/:id', async (req, res) => {
  const idx = parseInt(req.params.id, 10);
  const entry = fileIndex[idx];
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const key = path.basename(entry.file, path.extname(entry.file));
  delete posterCache[key];
  saveCache();
  const info = await omdbEnqueue(cleanTitle(entry.file), entry.type === 'episode' ? 'series' : 'movie');
  if (info) { posterCache[key] = info; saveCache(); res.json(info); }
  else res.json({ error: 'Not found on TMDB' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECT STREAM ENDPOINT (NO HLS FOR NOW - FASTEST)
// ═══════════════════════════════════════════════════════════════════════════════
function localPlaybackPlan(id, req, entry, filePath) {
  const requestedMode = req.query.forceHls === '1' ? 'hls' : normalizePlaybackMode(req.query.mode, 'direct');
  const startSec = playbackStartFromReq(req);
  const query = playbackQueryFromReq(req);
  let src;
  let mode = requestedMode;

  if (mode === 'hls') {
    src = localPlaybackHlsUrl(id, req);
  } else if (mode === 'remux' || mode === 'audio') {
    src = `/api/playback/local/${encodeURIComponent(id)}/stream${playbackQueryFromReq(req, { mode })}`;
  } else {
    mode = 'direct';
    src = `/stream/${encodeURIComponent(id)}${query}`;
  }

  return {
    ok: true,
    id,
    filename: entry.file,
    directPlayable: isRemoteDirectPlayable(filePath),
    unsupportedVideoHint: playbackUrlHasUnsupportedVideoHint(entry.file),
    mode,
    transport: mode,
    src,
    playUrl: src,
    finalPlayUrl: src,
    remuxUrl: `/api/playback/local/${encodeURIComponent(id)}/stream${playbackQueryFromReq(req, { mode: 'remux' })}`,
    audioTranscodeUrl: `/api/playback/local/${encodeURIComponent(id)}/stream${playbackQueryFromReq(req, { mode: 'audio' })}`,
    hlsUrl: localPlaybackHlsUrl(id, req),
    duration: 0,
    start: startSec,
  };
}

app.get('/api/playback/local/:id', (req, res) => {
  const idx = parseInt(req.params.id, 10);
  const entry = fileIndex[idx];
  if (!entry) return jsonError(res, 404, 'LOCAL_MEDIA_NOT_FOUND', 'Local media was not found');
  const filePath = entryPath(entry);
  if (!fs.existsSync(filePath)) return jsonError(res, 404, 'LOCAL_MEDIA_MISSING', 'Local media file is missing');
  return res.json(localPlaybackPlan(String(idx), req, entry, filePath));
});

app.get('/api/playback/local/:id/stream', (req, res) => {
  const idx = parseInt(req.params.id, 10);
  const entry = fileIndex[idx];
  if (!entry) return jsonError(res, 404, 'LOCAL_MEDIA_NOT_FOUND', 'Local media was not found');
  const filePath = entryPath(entry);
  if (!fs.existsSync(filePath)) return jsonError(res, 404, 'LOCAL_MEDIA_MISSING', 'Local media file is missing');

  const mode = normalizePlaybackMode(req.query.mode, 'remux');
  if (mode !== 'remux' && mode !== 'audio') {
    return jsonError(res, 400, 'INVALID_PLAYBACK_MODE', 'Local stream mode must be remux or audio');
  }

  return streamFfmpegMp4(req, res, {
    input: filePath,
    mode,
    startSec: playbackStartFromReq(req),
    audioMap: playbackAudioMapFromReq(req),
    remote: false,
    label: entry.file,
  });
});

app.get('/stream/:id', async (req, res) => {
  const idx = parseInt(req.params.id, 10);
  const entry = fileIndex[idx];
  if (!entry) return res.status(404).send('Not found');
  
  const filePath = entryPath(entry);
  if (!fs.existsSync(filePath)) return res.status(404).send('File missing');

  const userAgent = req.headers['user-agent'] || '';
  const audioIdx = parseInt(req.query.audio || '0');
  const subtitleIdx = parseInt(req.query.subtitle ?? '-1');
  const forceTranscode = audioIdx > 0 || subtitleIdx >= 0;

  try {
    const mobilePlayback = isMobilePlaybackRequest(req);
    if (!forceTranscode && !mobilePlayback) {
      console.log(`[Stream] Direct: ${entry.file}`);
      return directStream(req, res, filePath, entry);
    }
    const mediaInfo = await getCachedMediaInfo(filePath);
    if (forceTranscode || (mobilePlayback && needsTranscode(mediaInfo, userAgent))) {
      console.log(`[Stream] Transcoding: ${entry.file}`);
      return transcodeStream(req, res, filePath, mediaInfo, entry);
    }
    console.log(`[Stream] Direct: ${entry.file}`);
    return directStream(req, res, filePath, entry);
  } catch (error) {
    console.error(`[Stream] Error for ${entry.file}:`, error.message);
    // Fallback: transcode to a guaranteed compatible format (H.264 + AAC in MP4)
    return transcodeStream(req, res, filePath, { audioTracks: [], subtitleTracks: [], videoCodec: 'unknown' }, entry);
  }
});

// Seekable stream for non‑MP4 local files
app.get('/api/stream-seek/:id', async (req, res) => {
  const idx = parseInt(req.params.id, 10);
  const entry = fileIndex[idx];
  if (!entry) return res.status(404).send('Not found');
  const filePath = entryPath(entry);
  if (!fs.existsSync(filePath)) return res.status(404).send('File missing');

  const startSec = parseFloat(req.query.start) || 0;
  try {
    const mediaInfo = await getCachedMediaInfo(filePath);
    const ffmpegArgs = [];
    if (startSec > 0) ffmpegArgs.push('-ss', String(startSec));
    ffmpegArgs.push('-i', filePath, '-map', '0:v:0', '-map', '0:a:0?');
    ffmpegArgs.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
    ffmpegArgs.push('-avoid_negative_ts', 'make_zero');
    ffmpegArgs.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof');
    ffmpegArgs.push('-f', 'mp4', 'pipe:1');

    const ffmpeg = spawn(FFMPEG_BIN, ffmpegArgs);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Access-Control-Allow-Origin', '*');
    ffmpeg.stdout.pipe(res);
    req.on('close', () => ffmpeg.kill('SIGKILL'));
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

function parseSingleByteRange(header, fileSize) {
  const value = String(header || '').trim();
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!match || (!match[1] && !match[2])) return null;

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : fileSize - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    end = Math.min(end, fileSize - 1);
  }

  if (start < 0 || start >= fileSize || end < start) return null;
  return { start, end };
}

function directStream(req, res, filePath, entry) {
  const ext = path.extname(filePath).toLowerCase();
  const qualityParam = req.query.quality || 'auto';
  const bytesPerSec  = QUALITY_TIERS[qualityParam] ?? null;
  const mobilePlayback = isMobilePlaybackRequest(req);
  const readOptions = mobilePlayback ? {} : { highWaterMark: 1024 * 1024 };
  
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    console.error(`[Direct Stream] Cannot stat file: ${filePath}`, err.message);
    return res.status(404).send('File not found');
  }
  
  const fileSize = stat.size;
  const contentType = MIME[ext] || 'video/mp4';
  const range = req.headers.range;
  
  // Set CORS and cache headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', mobilePlayback ? 'no-cache, no-store, must-revalidate' : 'private, max-age=0, must-revalidate');
  
  if (range) {
    const parsedRange = parseSingleByteRange(range, fileSize);
    if (!parsedRange) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Content-Length': '0',
        'Content-Type': contentType
      });
      return res.end();
    }
    const { start, end } = parsedRange;
    const chunkSize = (end - start) + 1;
    
    // Send partial content
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': chunkSize,
      'Content-Type': contentType
    });

    if (req.method === 'HEAD') return res.end();
    
    const stream = fs.createReadStream(filePath, { ...readOptions, start, end });
    if (bytesPerSec) {
      throttleStream(stream, res, bytesPerSec);
    } else {
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    }
    
    stream.on('error', (err) => {
      console.error(`[Direct Stream] Read error:`, err.message);
      if (!res.headersSent) res.status(500).end();
    });
  } else {
    // No range - send full file
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType
    });

    if (req.method === 'HEAD') return res.end();
    
    const stream = fs.createReadStream(filePath, readOptions);
    if (bytesPerSec) {
      throttleStream(stream, res, bytesPerSec);
    } else {
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    }
    
    stream.on('error', (err) => {
      console.error(`[Direct Stream] Read error:`, err.message);
      if (!res.headersSent) res.status(500).end();
    });
  }
}

function throttleStream(readStream, res, bytesPerSec) {
  const INTERVAL_MS = 100;
  const chunkSize   = Math.max(8192, Math.floor(bytesPerSec / (1000 / INTERVAL_MS)));
  let   queue       = [];
  let   done        = false;
  let   timer       = null;
  
  readStream.on('data', chunk => { queue.push(chunk); readStream.pause(); });
  readStream.on('end', () => { done = true; });
  readStream.on('error', () => { clearInterval(timer); if (!res.writableEnded) res.end(); });
  res.on('close', () => { clearInterval(timer); readStream.destroy(); });
  
  timer = setInterval(() => {
    if (res.writableEnded) { clearInterval(timer); return; }
    if (queue.length === 0) { 
      if (done) { clearInterval(timer); if (!res.writableEnded) res.end(); } 
      else readStream.resume(); 
      return; 
    }
    
    let sent = 0;
    while (queue.length > 0 && sent < bytesPerSec / (1000 / INTERVAL_MS)) {
      const chunk = queue.shift();
      if (res.writableEnded) { clearInterval(timer); return; }
      res.write(chunk);
      sent += chunk.length;
    }
    
    if (queue.length < 3) readStream.resume();
  }, INTERVAL_MS);
}

// --- Remux function (unchanged) ---
function remuxStream(req, res, filePath, entry) {
  const startSec = parseFloat(req.query.start) || 0;
  const ffmpegArgs = [];
  
  if (startSec > 0) ffmpegArgs.push('-ss', String(startSec));
  ffmpegArgs.push('-i', filePath);
  ffmpegArgs.push(
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-c', 'copy',
    '-reset_timestamps', '1',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1'
  );

  const ffmpeg = spawn(FFMPEG_BIN, ffmpegArgs);
  
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Accept-Ranges', 'none');
  ffmpeg.stdout.pipe(res);
  
  let _stderrBuf = '';
  ffmpeg.stderr.on('data', (d) => { _stderrBuf += d.toString(); });
  ffmpeg.on('error', err => { console.error('[Remux] spawn error:', err.message); if (!res.headersSent) res.status(500).end(); });
  req.on('close', () => ffmpeg.kill('SIGKILL'));
}

// --- Transcode function (unchanged) ---
function transcodeStream(req, res, filePath, mediaInfo, entry) {
  const audioIdx = parseInt(req.query.audio) || 0;
  const subtitleIdx = parseInt(req.query.subtitle);
  const hasSubtitle = !isNaN(subtitleIdx) && subtitleIdx >= 0;
  const startSec = parseFloat(req.query.start) || 0;
  const mobilePlayback = isMobilePlaybackRequest(req);

  const validAudioTracks = mediaInfo.audioTracks || [];
  const selectedAudioIdx = audioIdx < validAudioTracks.length ? audioIdx : 0;

  const ffmpegArgs = [];
  if (startSec > 0) ffmpegArgs.push('-ss', String(startSec));
  ffmpegArgs.push('-i', filePath);
  ffmpegArgs.push('-map', '0:v:0');
  
  if (validAudioTracks.length > 0) {
    ffmpegArgs.push('-map', `0:a:${selectedAudioIdx}`);
  } else {
    ffmpegArgs.push('-map', '0:a:0?');
  }

  let subtitleFilter = '';
  if (hasSubtitle) {
    const externalSubs = findSubtitleTracks(path.dirname(filePath), entry.file);
    if (externalSubs[subtitleIdx]) {
      const subFile = externalSubs[subtitleIdx].filePath;
      subtitleFilter = `subtitles='${subFile.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    } else if (mediaInfo.subtitleTracks && mediaInfo.subtitleTracks[subtitleIdx]) {
      ffmpegArgs.push('-map', `0:s:${subtitleIdx}`);
      ffmpegArgs.push('-c:s', 'mov_text');
    }
  }

  const videoCodec = (mediaInfo.videoCodec || 'unknown').toLowerCase();
  const isH264 = videoCodec === 'h264' || videoCodec === 'avc1' || videoCodec === 'avc';
  const videoFilters = [];
  if (subtitleFilter) videoFilters.push(subtitleFilter);
  if (mobilePlayback) videoFilters.push('scale=w=min(1280\\,iw):h=-2');
  
  if (isH264 && !mobilePlayback && !subtitleFilter) {
    ffmpegArgs.push('-c:v', 'copy');
  } else {
    ffmpegArgs.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', mobilePlayback ? '29' : '23',
      '-maxrate', mobilePlayback ? '2200k' : '6M',
      '-bufsize', mobilePlayback ? '4400k' : '12M',
      '-pix_fmt', 'yuv420p'
    );
    if (mobilePlayback) {
      ffmpegArgs.push('-profile:v', 'baseline', '-level', '3.1');
    }
  }

  if (videoFilters.length) {
    ffmpegArgs.push('-vf', videoFilters.join(','));
  }

  ffmpegArgs.push(
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '48000',
    '-ac', '2',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1'
  );

  const ffmpeg = spawn(FFMPEG_BIN, ffmpegArgs);

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Accept-Ranges', 'none');

  ffmpeg.stdout.pipe(res);

  let stderrData = '';
  ffmpeg.stderr.on('data', data => {
    stderrData += data.toString();
  });

  ffmpeg.on('error', err => {
    console.error(`[Transcode] FFmpeg spawn error:`, err.message);
    if (!res.headersSent) res.status(500).send('Transcode failed');
  });

  ffmpeg.on('close', code => {
    if (code !== 0) {
      console.error(`[Transcode] FFmpeg exited with code ${code}`);
      console.error(`[Transcode] FFmpeg stderr:\n${stderrData}`);
    } else {
      console.log(`[Transcode] Completed: ${entry.file}`);
    }
  });

  req.on('close', () => {
    console.log(`[Transcode] Client disconnected: ${entry.file}`);
    ffmpeg.kill('SIGKILL');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBTITLES
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/subtitles/:id/embedded/:streamIdx.vtt', (req, res) => {
  const idx = parseInt(req.params.id, 10);
  const streamIdx = parseInt(req.params.streamIdx, 10);
  const entry = fileIndex[idx];
  if (!entry) return res.status(404).send('No entry');
  if (!Number.isFinite(streamIdx) || streamIdx < 0) return res.status(400).send('Invalid subtitle stream');
  const filePath = entryPath(entry);
  if (!fs.existsSync(filePath)) return res.status(404).send('File missing');

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const ffmpeg = spawn(FFMPEG_BIN, [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-i', filePath,
    '-map', `0:${streamIdx}?`,
    '-vn',
    '-an',
    '-f', 'webvtt',
    'pipe:1',
  ]);

  const watchdog = setTimeout(() => {
    try { ffmpeg.kill('SIGKILL'); } catch {}
    if (!res.headersSent) res.status(504).end('WEBVTT\n\n');
    else if (!res.writableEnded) res.end();
  }, 30000);

  let sentBytes = 0;
  ffmpeg.stdout.on('data', chunk => { sentBytes += chunk.length; });
  ffmpeg.stdout.pipe(res);
  ffmpeg.stderr.on('data', d => console.log('[Embedded Subtitle]', d.toString().trim()));
  ffmpeg.on('error', err => {
    clearTimeout(watchdog);
    console.error('[Embedded Subtitle] spawn error:', err.message);
    if (!res.headersSent) res.status(500).end('WEBVTT\n\n');
  });
  ffmpeg.on('close', code => {
    clearTimeout(watchdog);
    if (code !== 0) console.error(`[Embedded Subtitle] FFmpeg exited with code ${code}`);
    if (!sentBytes && !res.writableEnded) res.end('WEBVTT\n\n');
  });
  req.on('close', () => { clearTimeout(watchdog); try { ffmpeg.kill('SIGKILL'); } catch {} });
});

app.get('/subtitles/:id/:trackIdx?', (req, res) => {
  const idx   = parseInt(req.params.id, 10);
  const entry = fileIndex[idx];
  if (!entry) return res.status(404).send('No entry');
  const tracks = findSubtitleTracks(entry.dir, entry.file);
  if (!tracks.length) return res.status(404).send('No subtitles');
  const trackIdx = parseInt(req.params.trackIdx || '0', 10);
  const track    = tracks[trackIdx] || tracks[0];
  if (!fs.existsSync(track.filePath)) return res.status(404).send('File missing');
  
  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (track.ext === '.vtt') return res.sendFile(track.filePath);
  
  try {
    const raw = fs.readFileSync(track.filePath, 'utf8');
    res.send(track.ext === '.srt' ? srtToVtt(raw) : assToVtt(raw));
  } catch { res.status(500).send('Subtitle read error'); }
});

function srtToVtt(srt) {
  const lines = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out   = ['WEBVTT', ''];
  let   i     = 0;
  
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    if (/^\s*\d+\s*$/.test(lines[i])) { i++; continue; }
    if (/\d{2}:\d{2}:\d{2},\d{3}/.test(lines[i])) {
      out.push(lines[i].replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'));
      i++;
      while (i < lines.length && lines[i].trim() !== '') { out.push(lines[i]); i++; }
      out.push('');
    } else i++;
  }
  return out.join('\n');
}

function assToVtt(ass) {
  const lines = ass.replace(/\r\n/g, '\n').split('\n');
  const out   = ['WEBVTT', ''];
  let cueIdx  = 1;
  
  for (const line of lines) {
    if (!line.startsWith('Dialogue:')) continue;
    const parts = line.split(',');
    if (parts.length < 10) continue;
    const start = assTime(parts[1].trim());
    const end   = assTime(parts[2].trim());
    const text  = parts.slice(9).join(',').replace(/\{[^}]*\}/g, '').replace(/\\N/g, '\n').trim();
    if (!text) continue;
    out.push(`${cueIdx++}`, `${start} --> ${end}`, text, '');
  }
  return out.join('\n');
}

function assTime(t) {
  const [h, m, s] = t.split(':');
  const [sec, cs] = s.split('.');
  return `${h.padStart(2,'0')}:${m.padStart(2,'0')}:${sec.padStart(2,'0')}.${(cs||'0').padEnd(3,'0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WATCH PARTY
// ═══════════════════════════════════════════════════════════════════════════════
const rooms = {};
function getRoom(id) {
  if (!rooms[id]) rooms[id] = { clients: new Set(), state: { streamId: null, playing: false, time: 0, updatedAt: Date.now() }, chat: [], createdAt: Date.now() };
  return rooms[id];
}

app.get('/party/:room/join', (req, res) => {
  const roomId = req.params.room.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  if (!roomId) return res.status(400).send('Invalid room');
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  
  const room = getRoom(roomId);
  const name = String(req.query.name || 'Guest').slice(0, 32).replace(/[<>&"]/g, '');
  
  room.clients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'sync', ...room.state, chat: room.chat, count: room.clients.size })}\n\n`);
  broadcast(room, { type: 'join', name, count: room.clients.size });
  
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch { clearInterval(hb); } }, 25_000);
  
  req.on('close', () => {
    clearInterval(hb);
    room.clients.delete(res);
    broadcast(room, { type: 'leave', name, count: room.clients.size });
    if (room.clients.size === 0) setTimeout(() => { if (rooms[roomId]?.clients.size === 0) delete rooms[roomId]; }, 3_600_000);
  });
});

app.post('/party/:room/event', (req, res) => {
  const roomId = req.params.room.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const room   = getRoom(roomId);
  const { type, streamId, time, name, message } = req.body;
  
  if (!['load','play','pause','seek','chat'].includes(type)) return res.status(400).json({ error: 'invalid type' });
  
  if (type === 'load')  { room.state.streamId = Number(streamId); room.state.time = 0; room.state.playing = false; }
  if (type === 'play')  { room.state.playing = true;  room.state.time = Number(time) || room.state.time; }
  if (type === 'pause') { room.state.playing = false; room.state.time = Number(time) || room.state.time; }
  if (type === 'seek')  { room.state.time = Number(time) || 0; }
  
  if (type === 'chat') {
    const msg = { name: String(name || 'Guest').slice(0, 32), message: String(message || '').slice(0, 300), ts: Date.now() };
    room.chat.push(msg);
    if (room.chat.length > 50) room.chat.shift();
    broadcast(room, { type: 'chat', ...msg });
    return res.json({ ok: true });
  }
  
  room.state.updatedAt = Date.now();
  broadcast(room, { type, ...room.state, name: String(name || '').slice(0, 32) });
  res.json({ ok: true });
});

function broadcast(room, data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of room.clients) { try { client.write(msg); } catch { room.clients.delete(client); } }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FTP STREAM — pure HTTP/HTTPS proxy, no FFmpeg metadata extraction
// Compatibility: /api/ftp/info and /api/ftp/media-info now validate first
// Reason: ffprobe on MKV files with multiple audio/subtitle tracks caused
//         1-2s+ delays on every FTP video start and broke seek bar behaviour.
// ═══════════════════════════════════════════════════════════════════════════════

function streamRemotePlaybackProxy(req, res, media, matched, srcUrl = media.decodedUrl, redirectsLeft = 5) {
  const headers = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
    Accept: '*/*',
    'Accept-Encoding': 'identity',
  };
  if (req.headers.range) headers.Range = req.headers.range;

  const mod = srcUrl.startsWith('https://') ? https : http;
  const proxyReq = mod.request(srcUrl, {
    method: req.method === 'HEAD' ? 'HEAD' : 'GET',
    headers,
    timeout: 20000,
  }, proxyRes => {
    try { req.socket?.setNoDelay?.(true); res.socket?.setNoDelay?.(true); proxyRes.socket?.setNoDelay?.(true); } catch {}
    const status = proxyRes.statusCode || 200;
    const location = proxyRes.headers.location;

    if ([301, 302, 303, 307, 308].includes(status) && location && redirectsLeft > 0 && !res.headersSent) {
      proxyRes.resume();
      const nextUrl = new URL(location, srcUrl).href;
      return streamRemotePlaybackProxy(req, res, media, matched, nextUrl, redirectsLeft - 1);
    }

    if (status >= 400) {
      proxyRes.resume();
      return jsonError(res, status, 'REMOTE_MEDIA_REQUEST_FAILED', 'Remote media request failed', {
        requestedUrl: media.requestedUrl,
        decodedUrl: media.decodedUrl,
        matchedCatalogItem: matched,
        upstreamStatus: status,
      });
    }

    const upstreamType = String(proxyRes.headers['content-type'] || '').toLowerCase();
    const contentType = !upstreamType || upstreamType.includes('octet-stream')
      ? mimeForMediaPath(srcUrl)
      : proxyRes.headers['content-type'];
    const passHeaders = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type',
      'Cache-Control': 'no-store',
    };
    const acceptsBytes = String(proxyRes.headers['accept-ranges'] || '').toLowerCase() === 'bytes'
      || (status === 206 && !!proxyRes.headers['content-range']);
    if (acceptsBytes) passHeaders['Accept-Ranges'] = 'bytes';
    if (proxyRes.headers['content-length']) passHeaders['Content-Length'] = proxyRes.headers['content-length'];
    if (proxyRes.headers['content-range']) passHeaders['Content-Range'] = proxyRes.headers['content-range'];

    res.writeHead(status, passHeaders);
    if (req.method === 'HEAD') {
      proxyRes.resume();
      return res.end();
    }
    proxyRes.pipe(res);
  });

  proxyReq.on('error', e => {
    console.error('[FTP Playback Proxy] Error:', e.message);
    if (!res.headersSent) {
      jsonError(res, 502, 'REMOTE_PROXY_FAILED', 'Could not reach remote media source', {
        decodedUrl: media.decodedUrl,
        details: e.message,
      });
    }
  });
  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      jsonError(res, 504, 'REMOTE_PROXY_TIMEOUT', 'Remote media source timed out', {
        decodedUrl: media.decodedUrl,
      });
    }
  });
  res.on('close', () => proxyReq.destroy());
  proxyReq.end();
}

app.get('/api/playback/ftp', (req, res) => {
  const trusted = readTrustedRemotePlaybackMedia(req, res, true);
  if (!trusted) return;
  const { media, srcUrl, matched } = trusted;

  const requestedMode = req.query.forceHls === '1' ? 'hls' : normalizePlaybackMode(req.query.mode, 'direct');
  const mode = requestedMode === 'direct' ? 'redirect' : requestedMode;
  const planRequested = req.query.plan === '1' || req.query.json === '1' || req.query.format === 'json';
  const urls = remotePlaybackUrls(srcUrl);

  console.log(`[FTP Playback] requested URL: ${media.requestedUrl}`);
  console.log(`[FTP Playback] decoded URL: ${srcUrl}`);
  console.log(`[FTP Playback] matched catalog item: ${catalogLogLabel(matched)}`);
  console.log(`[FTP Playback] mode: ${planRequested ? 'plan:' : ''}${mode}`);

  if (planRequested) {
    let playUrl = urls.redirectUrl;
    if (mode === 'proxy') playUrl = urls.proxyUrl;
    else if (mode === 'remux' || mode === 'audio') {
      playUrl = remotePlaybackModeUrl(srcUrl, req, mode);
    } else if (mode === 'hls') {
      playUrl = remotePlaybackHlsUrl(srcUrl, req);
    }
    return res.json({
      ok: true,
      requestedUrl: media.requestedUrl,
      decodedUrl: srcUrl,
      matchedCatalogItem: matched,
      directPlayable: urls.directPlayable,
      unsupportedVideoHint: playbackUrlHasUnsupportedVideoHint(srcUrl),
      mode: mode === 'redirect' ? 'direct' : mode,
      transport: mode,
      src: playUrl,
      playUrl,
      finalPlayUrl: playUrl,
      redirectUrl: urls.redirectUrl,
      proxyUrl: urls.proxyUrl,
      fallbackProxyUrl: urls.proxyUrl,
      legacyProxyUrl: urls.legacyProxyUrl,
      remuxUrl: remotePlaybackModeUrl(srcUrl, req, 'remux'),
      audioTranscodeUrl: remotePlaybackModeUrl(srcUrl, req, 'audio'),
      hlsUrl: remotePlaybackHlsUrl(srcUrl, req),
      transcodeUrl: urls.transcodeUrl,
      duration: 0,
    });
  }

  if (mode === 'proxy') {
    return streamRemotePlaybackProxy(req, res, media, matched);
  }

  if (mode === 'remux' || mode === 'audio') {
    return streamFfmpegMp4(req, res, {
      input: srcUrl,
      mode,
      startSec: playbackStartFromReq(req),
      audioMap: playbackAudioMapFromReq(req),
      remote: true,
      label: remoteFilename(srcUrl),
    });
  }

  if (mode === 'hls') {
    const startSec = playbackStartFromReq(req);
    const audioMap = playbackAudioMapFromReq(req);
    const preset = mobileHlsPresetFromQuality(req.query.quality);
    const key = hlsSessionKey('ftp', srcUrl, startSec, `${audioMap}|${preset.key}`);
    const clientId = /^[a-zA-Z0-9_-]{8,80}$/.test(String(req.query.client || '')) ? String(req.query.client) : '';
    const playlistPath = startMobileHlsSession({ scope: 'ftp', key, input: srcUrl, startSec, audioMap, clientId, preset });
    return sendMobileHlsPlaylist(res, 'ftp', key, playlistPath);
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, srcUrl);
});

app.get('/api/play-url', async (req, res) => {
  let media;
  try {
    media = readRemoteUrlParam(req, ['url', 'streamUrl', 'movie', 'movieUrl', 'src']);
  } catch (e) {
    return jsonError(res, e.status || 400, e.code || 'INVALID_URL', e.message, {
      requestedUrl: e.requestedUrl,
      decodedUrl: e.decodedUrl,
    });
  }

  const matched = findCatalogItemByStreamUrl(media.decodedUrl);
  const urls = remotePlayUrls(media.decodedUrl);
  console.log(`[Play URL] requested URL: ${media.requestedUrl}`);
  console.log(`[Play URL] decoded URL: ${media.decodedUrl}`);
  console.log(`[Play URL] matched catalog item: ${catalogLogLabel(matched)}`);
  console.log(`[Play URL] final play URL: ${urls.finalPlayUrl}`);

  const availability = await checkRemoteAvailability(media.decodedUrl, req);
  if (!availability.ok) {
    return jsonError(res, 404, 'REMOTE_MEDIA_UNAVAILABLE', 'Remote media is not available', {
      requestedUrl: media.requestedUrl,
      decodedUrl: media.decodedUrl,
      matchedCatalogItem: matched,
      availability,
    });
  }

  res.json({
    ok: true,
    requestedUrl: media.requestedUrl,
    decodedUrl: media.decodedUrl,
    matchedCatalogItem: matched,
    directPlayable: urls.directPlayable,
    playUrl: urls.finalPlayUrl,
    finalPlayUrl: urls.finalPlayUrl,
    proxyUrl: urls.proxyUrl,
    transcodeUrl: urls.transcodeUrl,
    availability,
  });
});

app.get(['/api/ftp/media-info', '/api/ftp/info'], async (req, res) => {
  let media;
  try {
    media = readRemoteUrlParam(req, ['url', 'streamUrl', 'movie', 'movieUrl', 'src']);
  } catch (e) {
    return jsonError(res, e.status || 400, e.code || 'INVALID_URL', e.message, {
      requestedUrl: e.requestedUrl,
      decodedUrl: e.decodedUrl,
    });
  }

  const matched = findCatalogItemByStreamUrl(media.decodedUrl);
  const urls = remotePlayUrls(media.decodedUrl);
  console.log(`[FTP Media Info] requested URL: ${media.requestedUrl}`);
  console.log(`[FTP Media Info] decoded URL: ${media.decodedUrl}`);
  console.log(`[FTP Media Info] matched catalog item: ${catalogLogLabel(matched)}`);
  console.log(`[FTP Media Info] final play URL: ${urls.finalPlayUrl}`);

  try {
    const [info, sidecarSubtitleTracks] = await Promise.all([
      getCachedMediaInfo(media.decodedUrl),
      discoverRemoteSubtitleTracks(media.decodedUrl, req).catch(() => [])
    ]);
    res.json({
      ok: true,
      requestedUrl: media.requestedUrl,
      decodedUrl: media.decodedUrl,
      matchedCatalogItem: matched,
      playUrl: urls.finalPlayUrl,
      finalPlayUrl: urls.finalPlayUrl,
      ...info,
      sidecarSubtitleTracks,
      duration: Number(info.duration) || 0,
    });
  } catch (e) {
    console.error(`[FTP Media Info] Probe error for ${remoteFilename(media.decodedUrl)}:`, e.message);
    return jsonError(res, 502, 'REMOTE_MEDIA_PROBE_FAILED', 'Remote media is reachable but could not be probed', {
      requestedUrl: media.requestedUrl,
      decodedUrl: media.decodedUrl,
      matchedCatalogItem: matched,
      playUrl: urls.finalPlayUrl,
      duration: 0,
      details: e.message,
    });
  }
});

app.get('/api/ftp/subtitle/:track.vtt', (req, res) => {
  let media;
  try {
    media = readRemoteUrlParam(req, ['url', 'streamUrl', 'movie', 'movieUrl', 'src']);
  } catch (e) {
    return jsonError(res, e.status || 400, e.code || 'INVALID_URL', e.message, {
      requestedUrl: e.requestedUrl,
      decodedUrl: e.decodedUrl,
    });
  }

  const srcUrl = media.decodedUrl;
  const sidecarRaw = String(req.query.sidecar || '').trim();
  if (sidecarRaw) {
    let sidecarUrl;
    try { sidecarUrl = new URL(sidecarRaw, srcUrl).href; } catch {
      return jsonError(res, 400, 'INVALID_SUBTITLE_URL', 'Invalid remote subtitle URL');
    }
    return sendRemoteSidecarSubtitleAsVtt(req, res, srcUrl, sidecarUrl);
  }
  const trackIdx = Math.max(0, parseInt(req.params.track || '0', 10) || 0);
  const streamIdx = parseInt(req.query.stream ?? '', 10);
  const mapTarget = Number.isFinite(streamIdx) && streamIdx >= 0 ? `0:${streamIdx}` : `0:s:${trackIdx}`;
  const matched = findCatalogItemByStreamUrl(srcUrl);
  console.log(`[FTP Subtitle] requested URL: ${media.requestedUrl}`);
  console.log(`[FTP Subtitle] decoded URL: ${srcUrl}`);
  console.log(`[FTP Subtitle] matched catalog item: ${catalogLogLabel(matched)}`);
  console.log(`[FTP Subtitle] track: ${trackIdx}, map: ${mapTarget}`);

  const ffmpegArgs = [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-probesize', '1048576',
    '-analyzeduration', '1000000',
    '-rw_timeout', '15000000',
    '-i', srcUrl,
    '-map', `${mapTarget}?`,
    '-vn',
    '-an',
    '-f', 'webvtt',
    'pipe:1',
  ];

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const ffmpeg = spawn(FFMPEG_BIN, ffmpegArgs);
  const watchdog = setTimeout(() => {
    try { ffmpeg.kill('SIGKILL'); } catch {}
    if (!res.headersSent) res.status(504).end('WEBVTT\n\n');
    else if (!res.writableEnded) res.end();
  }, 30000);

  let sentBytes = 0;
  ffmpeg.stdout.on('data', chunk => { sentBytes += chunk.length; });
  ffmpeg.stdout.pipe(res);
  ffmpeg.stderr.on('data', d => console.log('[FTP Subtitle]', d.toString().trim()));
  ffmpeg.on('error', err => {
    clearTimeout(watchdog);
    console.error('[FTP Subtitle] spawn error:', err.message);
    if (!res.headersSent) res.status(500).end('WEBVTT\n\n');
  });
  ffmpeg.on('close', code => {
    clearTimeout(watchdog);
    if (code !== 0) console.error(`[FTP Subtitle] FFmpeg exited with code ${code}`);
    if (!sentBytes && !res.writableEnded) res.end('WEBVTT\n\n');
  });
  req.on('close', () => { clearTimeout(watchdog); try { ffmpeg.kill('SIGKILL'); } catch {} });
});

app.get('/api/ftp/stream', async (req, res) => {
  const trusted = readTrustedRemotePlaybackMedia(req, res, true);
  if (!trusted) return;
  const { media, srcUrl, matched } = trusted;
  const urls = remotePlayUrls(srcUrl);
  console.log(`[FTP Stream] requested URL: ${media.requestedUrl}`);
  console.log(`[FTP Stream] decoded URL: ${srcUrl}`);
  console.log(`[FTP Stream] matched catalog item: ${catalogLogLabel(matched)}`);
  console.log(`[FTP Stream] final play URL: ${urls.transcodeUrl}`);

  const startSec = parseFloat(req.query.start) || 0;
  const audioIdx = Math.max(0, parseInt(req.query.audio || '0', 10) || 0);
  const audioStreamIdx = parseInt(req.query.audioStream ?? '', 10);
  const mobilePlayback = isMobilePlaybackRequest(req);
  const copyVideo = !mobilePlayback && isRemoteDirectPlayable(srcUrl) && remoteVideoCanCopy(srcUrl);
  console.log(`[FTP] Transcoding: ${remoteFilename(srcUrl)} start=${startSec}`);

  const ffmpegArgs = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-nostdin',
  ];
  if (startSec > 0) ffmpegArgs.push('-ss', String(startSec));
  ffmpegArgs.push(
    '-fflags', '+genpts+nobuffer',
    '-flags', 'low_delay',
    '-probesize', '524288',
    '-analyzeduration', '500000',
    '-rw_timeout', '15000000'
  );
  ffmpegArgs.push('-i', srcUrl);
  ffmpegArgs.push('-map', '0:v:0');
  if (Number.isFinite(audioStreamIdx) && audioStreamIdx >= 0) {
    ffmpegArgs.push('-map', `0:${audioStreamIdx}?`);
  } else {
    ffmpegArgs.push('-map', `0:a:${audioIdx}?`);
  }
  ffmpegArgs.push('-sn', '-dn');

  if (copyVideo) {
    ffmpegArgs.push('-c:v', 'copy');
  } else {
    if (mobilePlayback) ffmpegArgs.push('-vf', 'scale=w=min(1280\\,iw):h=-2');
    ffmpegArgs.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', mobilePlayback ? '30' : '23',
      '-maxrate', mobilePlayback ? '2000k' : '6M',
      '-bufsize', mobilePlayback ? '4000k' : '12M',
      '-pix_fmt', 'yuv420p',
      '-g', '48',
      '-keyint_min', '48',
      '-sc_threshold', '0'
    );
    if (mobilePlayback) {
      ffmpegArgs.push('-profile:v', 'baseline', '-level', '3.1');
    }
  }

  ffmpegArgs.push(
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '48000',
    '-ac', '2',
    '-avoid_negative_ts', 'make_zero',
    '-max_interleave_delta', '0',
    '-muxdelay', '0',
    '-muxpreload', '0',
    '-flush_packets', '1',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1'
  );

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'none');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');

  const ffmpeg = spawn(FFMPEG_BIN, ffmpegArgs);
  ffmpeg.stdout.pipe(res);
  ffmpeg.stderr.on('data', d => console.log('[FTP FFmpeg]', d.toString().trim()));
  ffmpeg.on('error', err => {
    console.error('[FTP FFmpeg] spawn error:', err.message);
    if (!res.headersSent) res.status(500).send('FFmpeg error');
  });
  req.on('close', () => { try { ffmpeg.kill('SIGKILL'); } catch(_){} });
});

app.get('/api/ftp/proxy', (req, res) => {
  let media;
  try {
    media = readRemoteUrlParam(req, ['url', 'streamUrl', 'movie', 'movieUrl', 'src']);
  } catch (e) {
    return jsonError(res, e.status || 400, e.code || 'INVALID_URL', e.message, {
      requestedUrl: e.requestedUrl,
      decodedUrl: e.decodedUrl,
    });
  }

  const srcUrl = media.decodedUrl;
  const matched = findCatalogItemByStreamUrl(srcUrl);
  const urls = remotePlayUrls(srcUrl);
  console.log(`[FTP Proxy] requested URL: ${media.requestedUrl}`);
  console.log(`[FTP Proxy] decoded URL: ${srcUrl}`);
  console.log(`[FTP Proxy] matched catalog item: ${catalogLogLabel(matched)}`);
  console.log(`[FTP Proxy] final play URL: ${urls.proxyUrl}`);

  const headers = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
  };
  if (req.headers.range) headers.Range = req.headers.range;

  const mod = srcUrl.startsWith('https://') ? https : http;
  const proxyReq = mod.get(srcUrl, { headers, timeout: 20000 }, proxyRes => {
    try { req.socket?.setNoDelay?.(true); res.socket?.setNoDelay?.(true); proxyRes.socket?.setNoDelay?.(true); } catch {}
    const status = proxyRes.statusCode || 200;
    if (status >= 400) {
      proxyRes.resume();
      return jsonError(res, status, 'REMOTE_MEDIA_REQUEST_FAILED', 'Remote media request failed', {
        requestedUrl: media.requestedUrl,
        decodedUrl: srcUrl,
        matchedCatalogItem: matched,
        upstreamStatus: status,
      });
    }

    const upstreamType = String(proxyRes.headers['content-type'] || '').toLowerCase();
    const contentType = !upstreamType || upstreamType.includes('octet-stream')
      ? mimeForMediaPath(srcUrl)
      : proxyRes.headers['content-type'];
    const mobilePlayback = isMobilePlaybackRequest(req);
    const passHeaders = {
      'Content-Type': contentType,
      'Accept-Ranges': proxyRes.headers['accept-ranges'] || 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': mobilePlayback ? 'no-cache' : 'private, max-age=0, must-revalidate',
    };
    if (proxyRes.headers['content-length']) passHeaders['Content-Length'] = proxyRes.headers['content-length'];
    if (proxyRes.headers['content-range']) passHeaders['Content-Range'] = proxyRes.headers['content-range'];

    res.writeHead(status, passHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', e => {
    console.error('[FTP Proxy] Error:', e.message);
    if (!res.headersSent) {
      jsonError(res, 502, 'REMOTE_PROXY_FAILED', 'Could not reach remote media source', {
        decodedUrl: srcUrl,
        details: e.message,
      });
    }
  });
  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      jsonError(res, 504, 'REMOTE_PROXY_TIMEOUT', 'Remote media source timed out', {
        decodedUrl: srcUrl,
      });
    }
  });
  res.on('close', () => proxyReq.destroy());
});

app.get('/api/ftp/duration', async (req, res) => {
  let media;
  try {
    media = readRemoteUrlParam(req, ['url', 'streamUrl', 'movie', 'movieUrl', 'src']);
  } catch (e) {
    return jsonError(res, e.status || 400, e.code || 'INVALID_URL', e.message, {
      requestedUrl: e.requestedUrl,
      decodedUrl: e.decodedUrl,
      duration: 0,
    });
  }

  const matched = findCatalogItemByStreamUrl(media.decodedUrl);
  const urls = remotePlayUrls(media.decodedUrl);
  console.log(`[FTP Duration] requested URL: ${media.requestedUrl}`);
  console.log(`[FTP Duration] decoded URL: ${media.decodedUrl}`);
  console.log(`[FTP Duration] matched catalog item: ${catalogLogLabel(matched)}`);
  console.log(`[FTP Duration] final play URL: ${urls.finalPlayUrl}`);

  try {
    const info = await getCachedMediaInfo(media.decodedUrl);
    res.json({
      ok: true,
      requestedUrl: media.requestedUrl,
      decodedUrl: media.decodedUrl,
      matchedCatalogItem: matched,
      duration: Number(info.duration) || 0,
    });
  } catch (e) {
    console.error('[FTP Duration] Error:', e.message);
    return jsonError(res, 502, 'REMOTE_DURATION_FAILED', 'Remote media duration could not be detected', {
      requestedUrl: media.requestedUrl,
      decodedUrl: media.decodedUrl,
      matchedCatalogItem: matched,
      duration: 0,
      details: e.message,
    });
  }
});

// ── Trending Cache (also filtered) ─────────────────────────────────────────
let _trendingCache = null, _trendingCacheTime = 0;

app.get('/api/ftp/test', async (req, res) => {
  let media;
  try {
    media = readRemoteUrlParam(req, ['url', 'streamUrl', 'movie', 'movieUrl', 'src']);
  } catch (e) {
    return jsonError(res, e.status || 400, e.code || 'INVALID_URL', e.message, {
      requestedUrl: e.requestedUrl,
      decodedUrl: e.decodedUrl,
    });
  }

  const srcUrl = media.decodedUrl;

  const ffmpegArgs = [
    '-loglevel', 'error',
    '-i', srcUrl,
    '-t', '5',  // only 5 seconds
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1'
  ];

  console.log('[TEST] FFmpeg args:', ffmpegArgs.join(' '));

  const ffmpeg = spawn(FFMPEG_BIN, ffmpegArgs);
  let stderrOutput = '';
  let bytesReceived = 0;

  ffmpeg.stdout.on('data', d => { bytesReceived += d.length; });
  ffmpeg.stderr.on('data', d => { stderrOutput += d.toString(); });
  
  ffmpeg.on('close', code => {
    res.json({
      exitCode: code,
      bytesProduced: bytesReceived,
      stderr: stderrOutput,
      srcUrl: srcUrl
    });
  });

  ffmpeg.on('error', err => {
    res.json({ error: err.message });
  });

  setTimeout(() => { try { ffmpeg.kill('SIGKILL'); } catch(_){} }, 15000);
});



// ── Software / downloads API restored safely ─────────────────────────────────
// Isolated from homepage/media/search. It only powers downloads.js and /download/:id.
const SV_SOFTWARE_CATALOG_PATHS = [
  path.join(__dirname, 'software-catalog.json'),
  path.join(__dirname, 'data', 'catalogs', 'software-catalog.json'),
  path.join(__dirname, 'data', 'software-catalog.json'),
  path.join(__dirname, 'downloads-catalog.json'),
  path.join(__dirname, 'download-catalog.json')
];
let _svSoftwareCache = null;
let _svSoftwareCacheMtime = 0;
let _svSoftwareById = new Map();

function svSoftwareHash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 16);
}

function svSafeDecode(value) {
  try { return decodeURIComponent(String(value || '')); }
  catch { return String(value || ''); }
}

function svSoftwareExt(value) {
  return path.extname(String(value || '').split('?')[0]).replace('.', '').toLowerCase();
}

function svFindSoftwareCatalogFiles() {
  const out = [];
  const add = file => {
    try { if (fs.statSync(file).isFile()) out.push(file); } catch {}
  };
  SV_SOFTWARE_CATALOG_PATHS.forEach(add);
  const roots = [__dirname, path.join(__dirname, 'data'), path.join(__dirname, 'data', 'catalogs')];
  const seen = new Set(out.map(f => path.resolve(f).toLowerCase()));
  const walk = (dir, depth = 0) => {
    if (depth > 3) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (['node_modules','.git','cache','scan-output','poster-cache'].includes(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(full, depth + 1); continue; }
      if (!/\.(json)$/i.test(ent.name)) continue;
      if (!/(software|download|app|apk|games?)/i.test(ent.name)) continue;
      const key = path.resolve(full).toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push(full); }
    }
  };
  roots.forEach(r => walk(r, 0));
  return out;
}

function svSoftwareTitleFromUrl(value) {
  const raw = svSafeDecode(String(value || '').split('/').pop() || 'Untitled');
  return raw.replace(/\.[^/.]+$/, '').replace(/[._\-]+/g, ' ').replace(/\s+/g, ' ').trim() || raw || 'Untitled';
}

function svSoftwarePlatform(item, ext, url) {
  const text = [item.platform, item.category, item.type, item.name, item.title, url].filter(Boolean).join(' ').toLowerCase();
  if (['apk','xapk','apks'].includes(ext) || text.includes('android')) return 'Android';
  if (['exe','msi'].includes(ext) || text.includes('windows')) return 'Windows';
  if (['dmg','pkg'].includes(ext) || text.includes('mac')) return 'macOS';
  if (['iso','img'].includes(ext) || text.includes('operating system') || text.includes('/os/')) return 'OS';
  if (['nsp','xci','cia','3ds','gba','nds','nes','snes','wbfs'].includes(ext) || text.includes('console')) return 'Console';
  if (['zip','rar','7z'].includes(ext)) return 'Archive';
  return item.platform || 'Other';
}

function svSoftwareCategory(item, platform, url) {
  const text = [item.category, item.type, item.name, item.title, url].filter(Boolean).join(' ').toLowerCase();
  if (text.includes('game')) return platform === 'Console' ? 'Console Games' : 'Games';
  if (platform === 'Android') return 'Android';
  if (platform === 'Windows') return 'Software';
  if (platform === 'OS') return 'OS';
  if (platform === 'Archive') return 'Archives';
  return item.category || platform || 'Other';
}

function svNormalizeSoftwareItem(item, idx) {
  if (!item || typeof item !== 'object') return null;
  const url = String(
    item.source || item.url || item.href || item.link || item.downloadUrl || item.downloadURL ||
    item.download_url || item.directUrl || item.directURL || item.fileUrl || item.fileURL ||
    item.path || item.streamUrl || item.src || ''
  ).trim();
  if (!/^https?:\/\//i.test(url) && !/^ftp:\/\//i.test(url)) return null;
  const ext = String(item.extension || item.ext || svSoftwareExt(url)).replace(/^\./, '').toLowerCase();
  const filename = item.filename || item.file || svSafeDecode(url.split('/').pop() || '');
  const name = String(item.name || item.title || item.label || svSoftwareTitleFromUrl(filename || url)).trim();
  if (!name || name.length < 2) return null;
  const platform = svSoftwarePlatform(item, ext, url);
  const category = svSoftwareCategory(item, platform, url);
  const id = String(item.id || `sw_${svSoftwareHash(url || name || idx)}`);
  return {
    id,
    name,
    filename,
    extension: ext,
    category,
    platform,
    type: item.type || category,
    size: item.size || item.bytes || item.sizeBytes || item.length || null,
    icon: item.icon || item.poster || item.image || '',
    source: url,
    url
  };
}

function svReadSoftwareJsonCatalog() {
  const files = svFindSoftwareCatalogFiles();
  let newestMtime = 0;
  for (const file of files) {
    try { newestMtime = Math.max(newestMtime, fs.statSync(file).mtimeMs); } catch {}
  }
  if (_svSoftwareCache && _svSoftwareCacheMtime === newestMtime) {
    return { items: _svSoftwareCache, mtime: newestMtime, source: files.join(', ') };
  }
  const seen = new Set();
  const items = [];
  _svSoftwareById = new Map();
  for (const file of files) {
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    const raw = Array.isArray(parsed) ? parsed : (parsed.downloads || parsed.items || parsed.software || parsed.apps || parsed.files || []);
    if (!Array.isArray(raw)) continue;
    for (let i = 0; i < raw.length; i++) {
      const normalized = svNormalizeSoftwareItem(raw[i], items.length + i);
      if (!normalized) continue;
      const key = String(normalized.source || normalized.url || normalized.name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(normalized);
      _svSoftwareById.set(normalized.id, normalized);
    }
  }
  _svSoftwareCache = items;
  _svSoftwareCacheMtime = newestMtime;
  console.log(`📦 Software catalog loaded: ${items.length} downloads from ${files.length} catalog file(s)`);
  return { items, mtime: newestMtime, source: files.join(', ') };
}

function svGetSoftwareDownloads() {
  try { return svReadSoftwareJsonCatalog().items; }
  catch (e) { console.warn('⚠️ Software catalog unavailable:', e.message); return []; }
}

app.get('/api/downloads', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const limit = Math.min(50000, Math.max(1, parseInt(req.query.limit || '50000', 10) || 50000));
  const page = Math.max(0, parseInt(req.query.page || '0', 10) || 0);
  let items = svGetSoftwareDownloads();
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean);
    items = items.filter(item => {
      const text = [item.name,item.filename,item.category,item.platform,item.extension].filter(Boolean).join(' ').toLowerCase();
      return terms.every(t => text.includes(t));
    });
  }
  const total = items.length;
  const start = page * limit;
  res.setHeader('Cache-Control', 'no-store');
  res.json({ items: items.slice(start, start + limit), total, page, pages: Math.ceil(total / limit) || 1 });
});

app.get('/api/downloads/debug', (req, res) => {
  const files = svFindSoftwareCatalogFiles().map(file => {
    try { return { file, size: fs.statSync(file).size }; } catch { return { file, size:0 }; }
  });
  const items = svGetSoftwareDownloads();
  res.json({ files, total: items.length, sample: items.slice(0, 3) });
});

app.get('/download/:id', (req, res) => {
  const id = String(req.params.id || '');
  svGetSoftwareDownloads();
  const item = _svSoftwareById.get(id);
  if (!item || !item.source) return res.status(404).send('Download not found');
  res.redirect(item.source);
});

app.get('/api/trending', async (req, res) => {
  if (_trendingCache && Date.now() - _trendingCacheTime < 3600000) return res.json(_trendingCache);
  try {
    const [mov, tv] = await Promise.all([
      tmdbGet('/trending/movie/week?language=en-US'),
      tmdbGet('/trending/tv/week?language=en-US')
    ]);
    const trendingMoviesRaw = (mov?.results || []).map(r => ({
      id: `tmdb_${r.id}`, name: r.title, isTrending: true,
      poster:   r.poster_path   ? `${TMDB_IMG}/w500${r.poster_path}`    : null,
      backdrop: r.backdrop_path ? `${TMDB_IMG}/w1280${r.backdrop_path}` : null,
      overview: r.overview||'', year: (r.release_date||'').slice(0,4),
      rating:   r.vote_average  ? r.vote_average.toFixed(1) : null,
      genre:    (r.genre_ids||[]).slice(0,3).map(id=>TMDB_GENRES[id]).filter(Boolean).join(', '),
      language: r.original_language||'', type:'movie', streamUrl:null, isFtp:false,
    }));
    const trendingSeriesRaw = (tv?.results || []).map(r => ({
      id: `tmdb_tv_${r.id}`, name: r.name, isTrending: true,
      poster:   r.poster_path   ? `${TMDB_IMG}/w500${r.poster_path}`    : null,
      backdrop: r.backdrop_path ? `${TMDB_IMG}/w1280${r.backdrop_path}` : null,
      overview: r.overview||'', year: (r.first_air_date||'').slice(0,4),
      rating:   r.vote_average  ? r.vote_average.toFixed(1) : null,
      genre:    (r.genre_ids||[]).slice(0,3).map(id=>TMDB_GENRES[id]).filter(Boolean).join(', '),
      language: r.original_language||'', type:'tv', seasons:{}
    }));
    const moviesFiltered = trendingMoviesRaw.filter(m => !isCartoonOrAnime(m));
    const seriesFiltered = trendingSeriesRaw.filter(s => !isCartoonOrAnime(s));
    _trendingCache = {
      movies: moviesFiltered,
      series: seriesFiltered
    };
    _trendingCacheTime = Date.now();
    res.json(_trendingCache);
  } catch(e) { res.json({ movies:[], series:[] }); }
});

// ── Catch-all & error handler ─────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error('Unhandled error:', err.message); if (!res.headersSent) res.status(500).json({ error: 'Internal server error' }); });

// ═══════════════════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════════════════
buildFileIndex();
buildInstantLists();                                   // ⚡ instant — sync, ~10ms
filterCartoonsAndAnime();                              // 🧹 remove cartoons/anime (with logging)
if (process.env.SV_SEARCH_WARMUP === '1') {
  const searchWarmupDelay = Math.max(30000, parseInt(process.env.SV_SEARCH_WARMUP_DELAY_MS || '120000', 10) || 120000);
  setTimeout(() => {
    try { svGetFastSearchIndex(); }
    catch (e) { console.warn('⚠ Search index warmup failed:', e.message); }
  }, searchWarmupDelay);
}
setTimeout(() => runBackgroundEnrichment(), 60000);    // 🔄 fill missing posters after startup settles

const os = require('os');
function getLanIP() {
  for (const ifaces of Object.values(os.networkInterfaces()))
    for (const iface of ifaces)
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
  return 'your-laptop-ip';
}

app.listen(PORT, '0.0.0.0', () => {
  const lan = getLanIP();
  const configured = channels.filter(c => c.url).length;
  console.log(`\n🎬 StreamVault Enhanced → http://localhost:${PORT}`);
  console.log(`📱 iPhone/iPad support → http://${lan}:${PORT}`);
  console.log(`🔄 Auto-transcoding enabled for iOS devices`);
  console.log(`📁 Movies  : ${MOVIES_DIR}`);
  console.log(`📺 Series  : ${SERIES_DIR}`);
  console.log(`📡 Channels: ${channels.length} loaded, ${configured} with URLs configured`);
  if (configured === 0) console.log(`   ⚠️  Open channels.json and add .m3u8 URLs from the ISP portal (F12 → Network tab)`);
  console.log(TMDB_TOKEN ? '✅ TMDB enabled (HD posters + backdrops)' : '⚠️  TMDB token missing');
  console.log(`📡 Stream IDs: 0–${fileIndex.length - 1}`);
  console.log(`\n📲 Using DIRECT STREAMING (fastest playback, no HLS delay)`);
  console.log(`✨ Seeking, pausing, and all controls work instantly\n`);
  console.log(`🧹 Cartoon/Anime filter active — only real movies & series are shown`);
  setTimeout(() => svWarmFifaLiveCache('startup'), 750);
  setTimeout(() => {
    svGetFifaNewsPayload().catch(err => svFifaWarn('startup news warmup failed', err));
  }, 2500);
});
