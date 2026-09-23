'use strict';

const path = require('path');
const crypto = require('crypto');

const MEDIA_EXT_RE = /\.(?:mkv|mp4|m4v|avi|mov|webm|flv|wmv|mpg|mpeg|3gp|ts|m2ts)$/i;
const RELEASE_WORDS_RE = /\b(?:2160p|1080p|720p|576p|540p|480p|4k|uhd|hdr10?|hdr|dv|dolby\s*vision|web[ ._-]?(?:dl|rip)|webrip|bluray|blu[ ._-]?ray|brrip|bdrip|hdrip|hdtv|dvdrip|remux|x26[45]|h26[45]|hevc|avc|av1|aac(?:2\.0|5\.1)?|ac3|eac3|ddp(?:5\.1)?|dts(?:-hd)?|truehd|atmos|10bit|8bit|proper|repack|extended|uncut|unrated|multi(?:[ ._-]?(?:audio|subs?|subtitles?))?|dual[ ._-]?audio|hindi|english|bengali|bangla|tamil|telugu|malayalam|korean|esubs?|msubs?|subs?|nf|netflix|amzn|amazon|hmax|dsnp|itunes|pahe|psa|rarbg|yify|yts|galaxyrg|tgx|eztv)\b/i;
const SERIES_CONTEXT_RE = /\b(?:tv\s*(?:mini\s*)?series|web\s*series|mini\s*series|season|seasons|episode|episodes)\b/i;
const GENERIC_SEGMENT_RE = /^(?:file|files|media|video|videos|downloads?|movies?|movie|series|tv(?:[ ._-]*series)?|web[ ._-]*series|shows?|episodes?|season|seasons|complete|english|foreign|hindi|dual(?:[ ._-]*audio)?|multi(?:[ ._-]*audio)?|bluray|webrip|web[ ._-]?dl|1080p|720p|2160p|480p|4k|uhd|hdr|hd|sd)$/i;
const CATEGORY_NOISE_RE = /^(?:english\s*&\s*foreign\s*tv\s*series|tv\s*series\s*[\W_]*\s*[a-z](?:\s*[—-]\s*[a-z])?|korean\s*tv\s*&\s*web\s*series|anime\s*&\s*cartoon\s*tv\s*series|awards\s*&\s*tv\s*shows|tv-web-series)$/i;

function hash(value, length = 20) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, length);
}

function deepDecode(value) {
  let text = String(value ?? '').trim();
  for (let i = 0; i < 5 && /%[0-9a-f]{2}/i.test(text); i++) {
    try {
      const next = decodeURIComponent(text);
      if (next === text) break;
      text = next;
    } catch (_) {
      break;
    }
  }
  return text.replace(/\+/g, ' ');
}

function sourceString(input) {
  if (!input || typeof input !== 'object') return String(input || '');
  return String(
    input.source_path || input.sourcePath || input.fullPath || input.relativePath || input.path ||
    input.streamUrl || input.url || input.src || input.link || input.file || input.filename ||
    input.title || input.name || ''
  );
}

function filenameFromSource(value) {
  let text = deepDecode(value).replace(/\\/g, '/');
  try {
    const parsed = new URL(text);
    text = parsed.pathname || text;
  } catch (_) {}
  text = text.split(/[?#]/)[0];
  return text.split('/').filter(Boolean).pop() || text;
}

function pathSegments(value) {
  let text = deepDecode(value).replace(/\\/g, '/');
  try {
    const parsed = new URL(text);
    text = parsed.pathname || text;
  } catch (_) {}
  return text.split(/[?#]/)[0]
    .split('/')
    .map(segment => cleanSegment(segment))
    .filter(Boolean);
}

function stripExtension(value) {
  return String(value || '').replace(MEDIA_EXT_RE, '');
}

function cleanSegment(value) {
  return stripExtension(deepDecode(value))
    .replace(/[._]+/g, ' ')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripBracketNoise(value) {
  return String(value || '')
    .replace(/\[[^\]]*(?:2160|1080|720|480|web|bluray|x26|hevc|aac|ddp|hindi|english|subs?|dual|multi|nf|amzn|dsnp|hmax)[^\]]*\]/gi, ' ')
    .replace(/\{[^}]*(?:2160|1080|720|480|web|bluray|x26|hevc|aac|ddp|hindi|english|subs?|dual|multi|nf|amzn|dsnp|hmax)[^}]*\}/gi, ' ');
}

function stripSeriesDescriptor(value) {
  return cleanSegment(value)
    .replace(/\([^)]*\b(?:tv\s*(?:mini\s*)?series|web\s*series|mini\s*series)\b[^)]*\)/ig, ' ')
    .replace(/\b(?:tv\s*(?:mini\s*)?series|web\s*series|mini\s*series)\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripReleaseTail(value) {
  let clean = stripBracketNoise(cleanSegment(value));
  const idx = clean.search(RELEASE_WORDS_RE);
  if (idx > 0) clean = clean.slice(0, idx);
  return clean.replace(/[\s,._-]+$/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeSeriesName(value) {
  let title = stripSeriesDescriptor(stripReleaseTail(value));
  if (!/^(?:19|20)\d{2}$/.test(title.trim())) {
    title = title.replace(/[\s._-]+\(?(?:19|20)\d{2}(?:\s*[–-]\s*(?:19|20)\d{2})?\)?\s*$/i, '');
  }
  return title.replace(/\s+/g, ' ').trim();
}

function normalizedKey(value) {
  return normalizeSeriesName(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMediaTitle(value) {
  let text = stripReleaseTail(filenameFromSource(value))
    .replace(/\bS\s*\d{1,4}\s*E\s*\d{1,3}\b/ig, ' ')
    .replace(/\b\d{1,3}\s*x\s*\d{1,3}\b/ig, ' ')
    .replace(/\bSeason\s*\d{1,4}\b/ig, ' ')
    .replace(/\b(?:Episode|Ep|E)\s*[- ]?\s*\d{1,3}\b/ig, ' ')
    .replace(/\bPart\s*[- ]?\s*\d{1,3}\b/ig, ' ')
    .replace(/\([^)]*\b(?:19|20)\d{2}\b[^)]*\)/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/[^A-Za-z0-9'&:,-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function stripEpisodeTokensForYear(value) {
  return cleanSegment(value)
    .replace(/\bS\s*\d{1,4}\s*E\s*\d{1,3}\b/ig, ' ')
    .replace(/\b\d{1,3}\s*x\s*\d{1,3}\b/ig, ' ')
    .replace(/\b(?:Episode|Ep|E)\s*[- ]?\s*\d{1,4}\b/ig, ' ')
    .replace(/\bSeason\s*\d{1,4}\b/ig, ' ')
    .replace(/\bPart\s*[- ]?\s*\d{1,4}\b/ig, ' ');
}

function extractReleaseYear(value, options = {}) {
  const maxYear = Number(options.maxYear) || new Date().getFullYear() + 2;
  const raw = deepDecode(value);
  const tvSeries = raw.match(/\b(?:TV|Web|Mini)\s+(?:Mini\s+)?Series\s+((?:19|20)\d{2})(?:\s*[–-]\s*(?:19|20)\d{2})?/i);
  if (tvSeries && Number(tvSeries[1]) <= maxYear) return tvSeries[1];

  const text = stripEpisodeTokensForYear(raw);
  const candidates = [];
  const re = /(?:^|[\s._([\-])((?:19|20)\d{2})(?=$|[\s._)\]\-])/g;
  let match;
  while ((match = re.exec(text))) {
    const year = match[1];
    if (Number(year) <= maxYear) candidates.push(year);
  }
  return candidates.length ? candidates[candidates.length - 1] : '';
}

function parseSeasonFolder(value) {
  const clean = cleanSegment(value);
  if (/^specials?(?:$|[\s._-])/i.test(clean)) return 0;
  let match = clean.match(/^(?:season|series)\s*[- ]?\s*0*(\d{1,4})\b/i);
  if (!match) match = clean.match(/^s\s*0*(\d{1,4})\b/i);
  return match ? Number(match[1]) : null;
}

function isGenericSegment(value) {
  const clean = cleanSegment(value);
  const key = clean.toLowerCase().replace(/[^a-z0-9&]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!key) return true;
  if (/^\d{1,4}$/.test(key)) return true;
  if (GENERIC_SEGMENT_RE.test(key) || CATEGORY_NOISE_RE.test(key)) return true;
  if (/^[a-z]\s*(?:-|—|to)\s*[a-z]$/i.test(key)) return true;
  return false;
}

function plausibleShowFolder(value) {
  const clean = cleanSegment(value);
  if (!clean || parseSeasonFolder(clean) !== null || isGenericSegment(clean)) return false;
  if (/^(?:extras?|featurettes?|samples?|trailers?|subtitles?)$/i.test(clean)) return false;
  return true;
}

function parseEpisodeMarker(text) {
  const normalized = cleanSegment(text);
  const patterns = [
    { source: 'season-episode', regex: /(?:^|[^a-z0-9])Season\s*0*(\d{1,4})\s+Episode\s*0*(\d{1,3})(?=$|[^0-9])/i },
    { source: 'sxe', regex: /(?:^|[^a-z0-9])S\s*0*(\d{1,4})\s*E\s*0*(\d{1,3})(?=$|[^0-9])/i },
    { source: 'x', regex: /(?:^|[^a-z0-9])(\d{1,3})\s*x\s*0*(\d{1,3})(?=$|[^0-9])/i },
    { source: 'season-dash-episode', regex: /(?:^|[^a-z0-9])Season\s*0*(\d{1,4})\s*\)?\s*[-–—]\s*0*(\d{1,3})(?=$|[^0-9])/i },
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex);
    if (!match) continue;
    const index = match.index || 0;
    return {
      source: pattern.source,
      season: Number(match[1]),
      episode: Number(match[2]),
      markerIndex: index,
      showName: normalizeSeriesName(normalized.slice(0, index)),
      epTitle: cleanEpisodeTitle(normalized.slice(index + match[0].length)),
      explicitSeason: true,
    };
  }

  let match = normalized.match(/(?:^|[^a-z0-9])Special\s*[- ]?\s*0*(\d{1,3})(?=$|[^0-9])(.*)$/i);
  if (match) return {
    source: 'special', season: 0, episode: Number(match[1]), markerIndex: match.index || 0,
    showName: normalizeSeriesName(normalized.slice(0, match.index || 0)), epTitle: cleanEpisodeTitle(match[2]), explicitSeason: true,
  };

  match = normalized.match(/(?:^|[^a-z0-9])(?:Episode|EP|E)\s*[- ]?\s*0*(\d{1,3})(?=$|[^0-9])(.*)$/i);
  if (match) return {
    source: 'episode-only', season: null, episode: Number(match[1]), markerIndex: match.index || 0,
    showName: normalizeSeriesName(normalized.slice(0, match.index || 0)), epTitle: cleanEpisodeTitle(match[2]), explicitSeason: false,
  };

  match = normalized.match(/(?:^|[^a-z0-9])Part\s*[- ]?\s*0*(\d{1,3})(?=$|[^0-9])(.*)$/i);
  if (match) return {
    source: 'part', season: null, episode: Number(match[1]), markerIndex: match.index || 0,
    showName: normalizeSeriesName(normalized.slice(0, match.index || 0)), epTitle: cleanEpisodeTitle(match[2]), explicitSeason: false,
  };

  match = normalized.match(/^0*(\d{1,3})(?:\s*[-–—]\s*(.*))?$/);
  if (match) return {
    source: 'numeric', season: null, episode: Number(match[1]), markerIndex: 0,
    showName: '', epTitle: cleanEpisodeTitle(match[2]), explicitSeason: false,
  };
  return null;
}

function cleanEpisodeTitle(value) {
  let title = stripReleaseTail(value)
    .replace(/^[-–—: ]+/, '')
    .replace(/\([^)]*(?:2160|1080|720|480|web|bluray|x26|hevc|aac|ddp|subs?)[^)]*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return title;
}

function pathContext(value) {
  const segments = pathSegments(value);
  const dirs = segments.slice(0, -1);
  let season = null;
  let seasonIndex = -1;
  for (let i = dirs.length - 1; i >= 0; i--) {
    const parsed = parseSeasonFolder(dirs[i]);
    if (parsed !== null) {
      season = parsed;
      seasonIndex = i;
      break;
    }
  }
  const candidates = dirs
    .map((raw, index) => ({ raw, index, clean: normalizeSeriesName(raw), explicitTv: /\b(?:tv\s*(?:mini\s*)?series|web\s*series|mini\s*series)\b/i.test(raw) }))
    .filter(candidate => candidate.clean && plausibleShowFolder(candidate.raw));

  let selected = null;
  if (seasonIndex >= 0) {
    const beforeSeason = candidates.filter(candidate => candidate.index < seasonIndex);
    selected = beforeSeason[beforeSeason.length - 1] || null;
  }
  if (!selected) selected = [...candidates].reverse().find(candidate => candidate.explicitTv) || null;
  if (!selected && candidates.length) selected = candidates[candidates.length - 1];

  return {
    segments,
    dirs,
    season,
    seasonIndex,
    showName: selected?.clean || '',
    hasExplicitSeriesFolder: !!selected?.explicitTv,
    seriesYear: selected ? extractReleaseYear(selected.raw) : '',
    seriesFolder: selected?.raw || '',
  };
}

function confidenceFor({ marker, context, seriesName, season }) {
  if (!marker) return 'none';
  if (!seriesName) return 'low';
  if (season === null || season === undefined || !Number.isFinite(Number(season))) return 'low';
  if (context.hasExplicitSeriesFolder && context.season !== null) return 'high';
  if (context.showName && context.season !== null) return 'high';
  if (marker.explicitSeason && seriesName) return 'high';
  if (marker.showName && marker.source === 'episode-only') return 'medium';
  if (marker.showName && marker.source === 'part') return 'medium';
  return 'medium';
}

function parseMediaIdentity(input = {}, options = {}) {
  const obj = input && typeof input === 'object' ? input : { source_path: String(input || '') };
  const source = sourceString(obj);
  const filename = obj.filename || obj.file || filenameFromSource(source || obj.title || obj.name || '');
  const titleLike = obj.title || obj.name || filename || source;
  const relativePath = obj.relativePath || obj.source_path || obj.sourcePath || obj.path || obj.streamUrl || obj.url || source || filename;
  const context = pathContext(relativePath);
  const marker = parseEpisodeMarker(titleLike) || parseEpisodeMarker(filename) || parseEpisodeMarker(relativePath);

  if (marker && Number.isInteger(marker.episode) && marker.episode >= 0) {
    let season = marker.season;
    if (season === null || season === undefined) season = context.season;
    if ((season === null || season === undefined) && marker.showName && ['episode-only', 'part'].includes(marker.source)) season = 1;

    let seriesName = '';
    if (context.showName && (context.hasExplicitSeriesFolder || context.season !== null)) seriesName = context.showName;
    if (!seriesName && marker.showName) seriesName = marker.showName;
    if (!seriesName && context.showName) seriesName = context.showName;
    seriesName = normalizeSeriesName(seriesName);

    const confidence = confidenceFor({ marker, context, seriesName, season });
    return {
      kind: 'episode',
      classification: confidence === 'high' ? 'episode' : (confidence === 'medium' ? 'episode-candidate' : 'episode-unresolved'),
      confidence,
      reason: `${marker.source}${context.showName ? '+path-series' : ''}${context.season !== null ? '+season-folder' : ''}`,
      seriesName,
      seriesKey: normalizedKey(seriesName),
      season: Number.isFinite(Number(season)) ? Number(season) : null,
      episode: marker.episode,
      episodeTitle: marker.epTitle || `Episode ${marker.episode}`,
      source: marker.source,
      year: context.seriesYear || extractReleaseYear(relativePath) || extractReleaseYear(titleLike),
      sourcePath: relativePath,
      filename,
      sourceFingerprint: sourceFingerprint(obj),
      pathContext: context,
    };
  }

  const year = extractReleaseYear(titleLike) || extractReleaseYear(relativePath);
  const title = normalizeMediaTitle(titleLike || filename || relativePath);
  return {
    kind: 'movie',
    classification: 'movie',
    confidence: 'none',
    reason: 'no-episode-pattern',
    title,
    titleKey: normalizedKey(title),
    year,
    sourcePath: relativePath,
    filename,
    sourceFingerprint: sourceFingerprint(obj),
    pathContext: context,
  };
}

function isEpisodeLike(input, options = {}) {
  const parsed = parseMediaIdentity(input, options);
  return parsed.kind === 'episode';
}

function sourceFingerprint(input = {}) {
  const obj = input && typeof input === 'object' ? input : { source_path: String(input || '') };
  const identity = obj.source_path || obj.sourcePath || obj.streamUrl || obj.url || obj.path || obj.relativePath || obj.filename || obj.file || obj.title || obj.name || '';
  return hash(deepDecode(identity).replace(/\\/g, '/').toLowerCase(), 20);
}

function stableSeriesKey(seriesName) {
  return normalizedKey(seriesName);
}

function stableEpisodeKey(identity = {}) {
  const parsed = identity.kind === 'episode' ? identity : parseMediaIdentity(identity);
  const key = [parsed.seriesKey, parsed.season, parsed.episode, parsed.sourceFingerprint].join('|');
  return `episode_${hash(key, 24)}`;
}

module.exports = {
  cleanEpisodeTitle,
  cleanSegment,
  deepDecode,
  extractReleaseYear,
  filenameFromSource,
  isEpisodeLike,
  normalizeMediaTitle,
  normalizeSeriesName,
  normalizedKey,
  parseEpisodeMarker,
  parseMediaIdentity,
  parseSeasonFolder,
  pathContext,
  sourceFingerprint,
  stableEpisodeKey,
  stableSeriesKey,
  stripEpisodeTokensForYear,
};
