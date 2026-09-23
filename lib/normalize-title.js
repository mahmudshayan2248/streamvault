const path = require('path');
const { extractReleaseYear } = require('./media-identity');

const YEAR_RE = /\b(19\d{2}|20\d{2})\b/;

const JUNK_WORDS = [
  '240p', '360p', '480p', '576p', '720p', '1080p', '2160p', '4320p',
  '4k', '8k', 'uhd', 'hdr', 'hdr10', 'hdr10+', 'dv', 'dolby vision',
  'bluray', 'blu ray', 'brrip', 'bdrip', 'br rip', 'webrip', 'web rip',
  'webdl', 'web dl', 'web-dl', 'web', 'hdrip', 'hdtv', 'dvdrip', 'dvdscr',
  'remux', 'proper', 'repack', 'rerip', 'extended', 'unrated', 'theatrical',
  'internal', 'limited', 'readnfo', 'uncut', 'directors cut', 'director cut',
  'x264', 'x265', 'h264', 'h265', 'hevc', 'avc', 'xvid', 'divx',
  '10bit', '10-bit', '8bit', '8-bit', '12bit', '12-bit', 'hi10p',
  'aac', 'aac2.0', 'aac5.1', 'ac3', 'eac3', 'e-ac-3', 'dts', 'dts-hd',
  'truehd', 'atmos', 'ddp', 'ddp5.1', 'ddp5 1', 'ddp 5 1',
  'dd5.1', 'dd5 1', 'dd 5 1', '5.1', '7.1', '2.0',
  'dual audio', 'multi audio', 'multi', 'msubs', 'esub', 'subs',
  'subbed', 'dubbed', 'hindi', 'english', 'bangla', 'bengali',
  'reencoded', 're encode', 'encoded',
  'yts', 'yify', 'rarbg', 'eztv', 'ettv', 'tgx', 'galaxyrg', 'pahe', 'psa',
  'hdhub', 'hdhub4u', 'mlwbd', 'mkvcinemas', 'fitgirl', 'dodi', 'codex',
  'cpy', 'skidrow', 'reloaded', 'rune', 'msmod', 'kmhd', 'mkvcage',
  'mkvking', 'hon3y', 'silence', 'ntg', 'ion10', 'tigole', 'qxr', 'joy',
  'ddr'
];

const JUNK_PATTERNS = JUNK_WORDS.map(word => {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[ ._-]*');
  return new RegExp(`\\b${escaped}\\b`, 'ig');
});

function safeDecode(value) {
  const text = String(value || '');
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function rawName(value) {
  const text = String(value || '');
  try {
    const parsed = new URL(text);
    return parsed.pathname.split('/').pop() || text;
  } catch {
    return text.split(/[\\/]/).pop() || text;
  }
}

function extractYear(value) {
  return extractReleaseYear(value);
}

function stripExtension(value) {
  const text = String(value || '');
  const ext = path.extname(text.split('?')[0].split('#')[0]);
  return /^\.(mkv|mp4|avi|mov|wmv|webm|flv|m4v|mpg|mpeg|3gp|ts|txt|nfo|jpg|jpeg|png|webp)$/i.test(ext)
    ? text.slice(0, -ext.length)
    : text;
}

function stripBracketedReleaseTags(value) {
  return String(value || '')
    .replace(/\[[^\]]*(?:Hindi|English|Bangla|Bengali|Dual|Multi|Audio|ESub|MSubs|WEB|BluRay|x264|x265|HEVC|AAC|DTS|AMZN|NF|DSNP|HMAX)[^\]]*\]/ig, ' ')
    .replace(/\([^\)]*(?:Hindi|English|Bangla|Bengali|Dual|Multi|Audio|ESub|MSubs|WEB|BluRay|x264|x265|HEVC|AAC|DTS|AMZN|NF|DSNP|HMAX)[^\)]*\)/ig, ' ');
}

function normalizeTitle(value) {
  let text = safeDecode(stripExtension(rawName(value)))
    .replace(/\+/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\bS\d{1,2}E\d{1,3}\b/ig, ' ')
    .replace(/\bSeason\s*\d{1,2}\b/ig, ' ')
    .replace(/\bEpisode\s*\d{1,3}\b/ig, ' ');

  text = stripBracketedReleaseTags(text);
  for (const pattern of JUNK_PATTERNS) text = text.replace(pattern, ' ');

  text = text
    .replace(/\b(?:mkv|mp4|avi|mov|wmv|webm|flv|m4v|ts)\b$/ig, ' ')
    .replace(/\s*-\s*(?:www\..*|@\w+|by\s+\w+).*$/ig, ' ')
    .replace(/\s*-\s*[A-Za-z0-9][A-Za-z0-9._-]{1,24}$/g, ' ')
    .replace(/\b(?:www\.)?[a-z0-9-]+\.(?:com|net|org|in|bd)\b/ig, ' ')
    .replace(/[^A-Za-z0-9'&:,-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const year = extractYear(text);
  if (year) {
    const idx = text.lastIndexOf(year);
    const withoutYear = idx >= 0
      ? `${text.slice(0, idx)} ${text.slice(idx + year.length)}`.replace(/\s+/g, ' ').trim()
      : text;
    if (withoutYear.length >= 3) text = withoutYear;
  }

  return text;
}

function normalizeTitleParts(value) {
  const source = String(value || '');
  return { title: normalizeTitle(source), year: extractYear(source) };
}

const DISPLAY_TITLE_FIXES = new Map([
  ['avengers endgame', 'Avengers: Endgame'],
  ['avengers infinity war', 'Avengers: Infinity War'],
  ['avengers age of ultron', 'Avengers: Age of Ultron'],
  ['captain america the first avenger', 'Captain America: The First Avenger'],
  ['captain america the winter soldier', 'Captain America: The Winter Soldier'],
  ['captain america civil war', 'Captain America: Civil War'],
  ['doctor strange in the multiverse of madness', 'Doctor Strange in the Multiverse of Madness'],
  ['guardians of the galaxy vol 2', 'Guardians of the Galaxy Vol. 2'],
  ['spider man homecoming', 'Spider-Man: Homecoming'],
  ['spider man far from home', 'Spider-Man: Far From Home'],
  ['spider man no way home', 'Spider-Man: No Way Home'],
  ['batman v superman dawn of justice', 'Batman v Superman: Dawn of Justice'],
  ['suicide squad', 'Suicide Squad'],
  ['the suicide squad', 'The Suicide Squad'],
  ['fast and furious', 'Fast & Furious'],
  ['pirates of the caribbean the curse of the black pearl', 'Pirates of the Caribbean: The Curse of the Black Pearl']
]);

function cleanDisplayTitle(value) {
  let text = normalizeTitle(value)
    .replace(/\b(?:ddp|dd|aac|ac3|eac3|dts)\s*\d\s*[.\s]\s*\d\b/ig, ' ')
    .replace(/\b(?:esub|subs?|dubbed|hindi|english|dual)\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const year = extractYear(text);
  if (year) {
    const withoutYear = text.replace(new RegExp(`\\b${year}\\b`, 'g'), ' ').replace(/\s+/g, ' ').trim();
    if (withoutYear.length >= 3) text = withoutYear;
  }
  const fixed = DISPLAY_TITLE_FIXES.get(text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  return fixed || text;
}

function normalizedKey(value) {
  return normalizeTitle(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isReleaseJunk(value) {
  const key = normalizedKey(value);
  if (!key || key.length < 3 || /^\d+$/.test(key)) return true;
  const tokens = key.split(/\s+/).filter(Boolean);
  const junk = new Set(JUNK_WORDS.map(w => w.replace(/[^a-z0-9]+/g, ' ').trim()).filter(Boolean));
  return tokens.length > 0 && tokens.every(token => junk.has(token));
}

module.exports = {
  extractYear,
  normalizeTitle,
  normalizeTitleParts,
  cleanDisplayTitle,
  normalizeDisplayTitle: cleanDisplayTitle,
  normalizedKey,
  isReleaseJunk,
  JUNK_WORDS
};
