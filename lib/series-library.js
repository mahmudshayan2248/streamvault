'use strict';

const fs = require('fs');
const path = require('path');
const {
  cleanEpisodeTitle: canonicalCleanEpisodeTitle,
  normalizeSeriesName: canonicalNormalizeSeriesName,
  normalizedKey: canonicalSeriesKey,
  parseMediaIdentity,
  parseSeasonFolder: canonicalParseSeasonFolder,
} = require('./media-identity');

const DEFAULT_VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.mpg', '.mpeg', '.3gp'];
const RELEASE_WORDS = /\b(?:2160p|1080p|720p|576p|540p|480p|4k|uhd|hdr10?|dv|dolby|web[ ._-]?(?:dl|rip)|bluray|blu[ ._-]?ray|brrip|hdtv|dvdrip|x26[45]|h26[45]|hevc|av1|aac|ac3|eac3|ddp?|dts|truehd|atmos|10bit|8bit|nf|amzn|hmax|dsnp|proper|repack|remux|complete|multi(?:[ ._-]?(?:audio|subs?))?|dual[ ._-]?audio|english|hindi|bengali|bangla|tamil|telugu|esubs?|msubs?)\b/i;
const GENERIC_FOLDERS = /^(?:series|tv(?: series)?|shows?|episodes?|video|videos|media|downloads?|complete|english|hindi|multi(?: audio)?|web[ ._-]?dl|webrip|bluray|1080p|720p|2160p|4k)$/i;

function slash(value) {
  return String(value || '').replace(/\\/g, '/');
}

function cleanSeriesText(value) {
  return String(value || '')
    .replace(/\.(?:mp4|mkv|avi|mov|webm|flv|wmv|m4v|mpg|mpeg|3gp)$/i, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripReleaseTail(value) {
  let clean = cleanSeriesText(value)
    .replace(/\[(?:[^\]]*)\]|\{(?:[^}]*)\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const releaseAt = clean.search(RELEASE_WORDS);
  if (releaseAt > 0) clean = clean.slice(0, releaseAt).trim();
  return clean.replace(/[\s,._-]+$/g, '').trim();
}

function normalizeDisplayTitle(value) {
  let title = canonicalNormalizeSeriesName(value)
    .replace(/[\[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return title || cleanSeriesText(value);
}

function normalizeSeriesKey(value) {
  return canonicalSeriesKey(value);
}

function parseSeasonFolder(value) {
  return canonicalParseSeasonFolder(value);
}

function isPlausibleShowFolder(value) {
  const clean = cleanSeriesText(value);
  if (!clean || parseSeasonFolder(clean) !== null || GENERIC_FOLDERS.test(clean)) return false;
  if (/^(?:specials?|extras?|trailers?|featurettes?|samples?)$/i.test(clean)) return false;
  if (/^\d{1,4}$/.test(clean)) return false;
  return true;
}

function inferDirectoryContext(relativePath) {
  const parts = slash(relativePath).split('/').filter(Boolean);
  const dirs = parts.slice(0, -1);
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
    .map((raw, index) => ({ raw, index, clean: normalizeDisplayTitle(raw) }))
    .filter(candidate => isPlausibleShowFolder(candidate.raw));
  let showCandidate = null;
  if (seasonIndex >= 0) {
    const beforeSeason = candidates.filter(candidate => candidate.index < seasonIndex);
    showCandidate = beforeSeason[beforeSeason.length - 1] || null;
  }
  if (!showCandidate && candidates.length) {
    showCandidate = candidates.reduce((best, candidate) => {
      const releasePenalty = RELEASE_WORDS.test(candidate.raw) ? 8 : 0;
      const depthPenalty = candidate.index * 0.05;
      const score = Math.min(candidate.clean.length, 50) / 10 - releasePenalty - depthPenalty;
      return !best || score > best.score ? { ...candidate, score } : best;
    }, null);
  }
  return { dirs, season, seasonIndex, showName: showCandidate?.clean || '' };
}

function cleanEpisodeTitle(value) {
  return canonicalCleanEpisodeTitle(value);
}

function parseFilenameMetadata(filename) {
  const base = path.basename(filename, path.extname(filename));
  const normalized = base.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  const patterns = [
    { kind: 'sxe', regex: /(?:^|[^a-z0-9])(?:S(?:eason)?\s*0*(\d{1,3})\s*E(?:pisode)?\s*0*(\d{1,3}))(?=$|[^0-9])/i },
    { kind: 'x', regex: /(?:^|[^a-z0-9])(\d{1,3})\s*x\s*0*(\d{1,3})(?=$|[^0-9])/i },
    { kind: 'season-episode', regex: /(?:^|[^a-z0-9])Season\s*0*(\d{1,3})\s+Episode\s*0*(\d{1,3})(?=$|[^0-9])/i },
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex);
    if (!match) continue;
    const index = match.index || 0;
    return {
      source: pattern.kind,
      season: Number(match[1]),
      episode: Number(match[2]),
      showName: normalizeDisplayTitle(normalized.slice(0, index)),
      epTitle: cleanEpisodeTitle(normalized.slice(index + match[0].length)),
    };
  }

  let match = normalized.match(/(?:^|[^a-z0-9])0*(\d{1,3})(?:st|nd|rd|th)\s+Season\s*[-–—]\s*0*(\d{1,3})(?=$|[^0-9])(.*)$/i);
  if (match) return {
    source: 'ordinal-season', season: Number(match[1]), episode: Number(match[2]),
    showName: normalizeDisplayTitle(normalized.slice(0, match.index || 0)), epTitle: cleanEpisodeTitle(match[3]),
  };

  match = normalized.match(/(?:^|[^a-z0-9])Season\s*0*(\d{1,3})\s*\)?\s*[-–—]\s*0*(\d{1,3})(?=$|[^0-9])(.*)$/i);
  if (match) return {
    source: 'season-dash-episode', season: Number(match[1]), episode: Number(match[2]),
    showName: normalizeDisplayTitle(normalized.slice(0, match.index || 0)), epTitle: cleanEpisodeTitle(match[3]),
  };

  match = normalized.match(/(?:^|[^a-z0-9])Special\s*[- ]?\s*0*(\d{1,3})(?=$|[^0-9])(.*)$/i);
  if (match) return {
    source: 'special', season: 0, episode: Number(match[1]),
    showName: normalizeDisplayTitle(normalized.slice(0, match.index || 0)), epTitle: cleanEpisodeTitle(match[2]),
  };

  match = normalized.match(/(?:^|[^a-z0-9])(?:Episode|EP|E)\s*[- ]?\s*0*(\d{1,3})(?=$|[^0-9])(.*)$/i);
  if (match) return {
    source: 'episode-only', season: null, episode: Number(match[1]),
    showName: normalizeDisplayTitle(normalized.slice(0, match.index || 0)), epTitle: cleanEpisodeTitle(match[2]),
  };

  match = normalized.match(/(?:^|[^a-z0-9])Part\s*[- ]?\s*0*(\d{1,3})(?=$|[^0-9])(.*)$/i);
  if (match) return {
    source: 'part', season: null, episode: Number(match[1]),
    showName: normalizeDisplayTitle(normalized.slice(0, match.index || 0)), epTitle: cleanEpisodeTitle(match[2]),
  };

  match = normalized.match(/^0*(\d{1,3})(?:\s*[-–—]\s*(.*))?$/);
  if (match) return {
    source: 'numeric', season: null, episode: Number(match[1]), showName: '', epTitle: cleanEpisodeTitle(match[2]),
  };
  return null;
}

function parseSeriesEntry(entry) {
  if (!entry || !entry.file) return null;
  const relativePath = slash(entry.relativePath || entry.file);
  const canonical = parseMediaIdentity({
    filename: entry.file,
    relativePath,
    source_path: entry.source_path || entry.sourcePath || entry.streamUrl || entry.url || relativePath,
    title: entry.title || entry.name || entry.file,
  });
  if (canonical.kind === 'episode' && canonical.seriesName && canonical.season !== null) {
    const directorySeason = canonical.pathContext?.season;
    const seasonConflict = directorySeason !== null && directorySeason !== undefined && canonical.season !== directorySeason;
    return {
      showName: canonical.seriesName,
      seriesKey: canonical.seriesKey,
      season: canonical.season,
      episode: canonical.episode,
      epTitle: canonical.episodeTitle || `Episode ${canonical.episode}`,
      source: canonical.source,
      confidence: canonical.confidence,
      seasonConflict: seasonConflict ? { filename: canonical.season, directory: directorySeason } : null,
    };
  }

  const directory = inferDirectoryContext(relativePath);
  const fileMeta = parseFilenameMetadata(entry.file);
  if (!fileMeta || !Number.isInteger(fileMeta.episode) || fileMeta.episode < 0) return null;

  const seasonConflict = fileMeta.season !== null && directory.season !== null && fileMeta.season !== directory.season;
  let season = fileMeta.season;
  if (season === null) season = directory.season;
  if (season === null) {
    // A named show directory plus an explicit E/EP/Episode token is strong enough for Season 1.
    if ((directory.showName || fileMeta.showName) && fileMeta.source === 'episode-only') season = 1;
    else return null;
  }

  let showName = normalizeDisplayTitle(fileMeta.showName || directory.showName);
  if (!normalizeSeriesKey(showName) && directory.showName) showName = normalizeDisplayTitle(directory.showName);
  if (!showName || !normalizeSeriesKey(showName)) return null;
  return {
    showName,
    seriesKey: normalizeSeriesKey(showName),
    season,
    episode: fileMeta.episode,
    epTitle: fileMeta.epTitle || `Episode ${fileMeta.episode}`,
    source: fileMeta.source,
    seasonConflict: seasonConflict ? { filename: fileMeta.season, directory: directory.season } : null,
  };
}

function walkVideoFiles(root, videoExts = DEFAULT_VIDEO_EXTS) {
  const extensions = new Set(videoExts.map(ext => ext.toLowerCase()));
  const files = [];
  const errors = [];
  const visited = new Set();

  function walk(dir) {
    let real;
    try { real = fs.realpathSync(dir); }
    catch (error) { errors.push({ path: slash(path.relative(root, dir)), error: error.message }); return; }
    const realKey = process.platform === 'win32' ? real.toLowerCase() : real;
    if (visited.has(realKey)) return;
    visited.add(realKey);

    let children;
    try { children = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (error) { errors.push({ path: slash(path.relative(root, dir)), error: error.message }); return; }
    children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    for (const child of children) {
      const fullPath = path.join(dir, child.name);
      try {
        if (child.isDirectory()) walk(fullPath);
        else if (child.isSymbolicLink()) {
          let stat;
          try { stat = fs.statSync(fullPath); }
          catch (error) { errors.push({ path: slash(path.relative(root, fullPath)), error: error.message }); continue; }
          if (stat.isDirectory()) walk(fullPath);
          else if (stat.isFile() && extensions.has(path.extname(child.name).toLowerCase())) addFile(fullPath, child.name);
        } else if (child.isFile() && extensions.has(path.extname(child.name).toLowerCase())) addFile(fullPath, child.name);
      } catch (error) {
        errors.push({ path: slash(path.relative(root, fullPath)), error: error.message });
      }
    }
  }

  function addFile(fullPath, file) {
    files.push({
      dir: path.dirname(fullPath), file, relativePath: slash(path.relative(root, fullPath)),
      fullPath, type: 'episode',
    });
  }

  try { walk(root); }
  catch (error) { errors.push({ path: '', error: error.message }); }
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' }));
  return { files, errors };
}

function qualityScore(entry) {
  const value = `${entry.relativePath || ''} ${entry.file || ''}`;
  if (/\b2160p\b|\b4k\b/i.test(value)) return 5;
  if (/\b1080p\b/i.test(value)) return 4;
  if (/\b720p\b/i.test(value)) return 3;
  if (/\b(?:576p|540p)\b/i.test(value)) return 2;
  if (/\b480p\b/i.test(value)) return 1;
  return 0;
}

function chooseDuplicate(current, candidate) {
  const scoreDiff = qualityScore(candidate.entry) - qualityScore(current.entry);
  if (scoreDiff) return scoreDiff > 0 ? candidate : current;
  return candidate.entry.relativePath.localeCompare(current.entry.relativePath, undefined, { numeric: true, sensitivity: 'base' }) < 0
    ? candidate : current;
}

function buildSeriesCatalog(fileIndex, posterCache = {}) {
  const showMap = new Map();
  const unparsed = [];
  const parsedSamples = [];
  const conflicts = [];
  const duplicates = [];
  let episodesParsed = 0;

  fileIndex.forEach((entry, streamId) => {
    if (entry.type !== 'episode') return;
    const parsed = parseSeriesEntry(entry);
    if (!parsed) { unparsed.push(entry.relativePath || entry.file); return; }
    episodesParsed++;
    if (parsedSamples.length < 25) parsedSamples.push({ path: entry.relativePath || entry.file, ...parsed });
    if (parsed.seasonConflict) conflicts.push({ path: entry.relativePath || entry.file, ...parsed.seasonConflict });

    let show = showMap.get(parsed.seriesKey);
    if (!show) {
      show = { name: parsed.showName, seasons: {}, _episodes: new Map() };
      showMap.set(parsed.seriesKey, show);
    } else if (parsed.showName.length < show.name.length && !/\b(?:19|20)\d{2}\b/.test(parsed.showName)) {
      show.name = parsed.showName;
    }
    const duplicateKey = `${parsed.season}:${parsed.episode}`;
    const candidate = { entry, parsed, episode: {
      streamId, episode: parsed.episode, epTitle: parsed.epTitle, file: entry.file,
    } };
    const current = show._episodes.get(duplicateKey);
    if (current) {
      const chosen = chooseDuplicate(current, candidate);
      const rejected = chosen === current ? candidate : current;
      show._episodes.set(duplicateKey, chosen);
      duplicates.push({ show: show.name, season: parsed.season, episode: parsed.episode,
        kept: chosen.entry.relativePath || chosen.entry.file, rejected: rejected.entry.relativePath || rejected.entry.file });
    } else show._episodes.set(duplicateKey, candidate);
  });

  const shows = [...showMap.values()].map(show => {
    for (const candidate of show._episodes.values()) {
      const seasonKey = String(candidate.parsed.season);
      if (!show.seasons[seasonKey]) show.seasons[seasonKey] = [];
      show.seasons[seasonKey].push(candidate.episode);
    }
    delete show._episodes;
    const ordered = {};
    Object.keys(show.seasons).map(Number).sort((a, b) => a - b).forEach(season => {
      ordered[String(season)] = show.seasons[String(season)].sort((a, b) => a.episode - b.episode || a.streamId - b.streamId);
    });
    show.seasons = ordered;
    const info = posterCache[`__series__${show.name}`] || null;
    if (info) Object.assign(show, {
      poster: info.poster || null, backdrop: info.backdrop || info.poster || null,
      tmdbId: info.tmdbId || null, overview: info.overview || '', year: info.year || '',
      rating: info.rating || null, genre: info.genre || '', language: info.language || '',
      productionCompanies: info.productionCompanies || [],
    });
    return show;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const seasonCount = shows.reduce((count, show) => count + Object.keys(show.seasons).length, 0);
  const folderDepthDistribution = {};
  for (const entry of fileIndex.filter(item => item.type === 'episode')) {
    const depth = Math.max(0, slash(entry.relativePath || entry.file).split('/').filter(Boolean).length - 1);
    folderDepthDistribution[depth] = (folderDepthDistribution[depth] || 0) + 1;
  }
  return { shows, diagnostics: {
    videoFilesDiscovered: fileIndex.filter(entry => entry.type === 'episode').length,
    episodesParsed, unparsed: unparsed.length, shows: shows.length, seasons: seasonCount,
    duplicates: duplicates.length, conflicts: conflicts.length, folderDepthDistribution,
    sampleUnparsed: unparsed.slice(0, 25), sampleParsed: parsedSamples,
    sampleDuplicates: duplicates.slice(0, 25), sampleConflicts: conflicts.slice(0, 25),
  } };
}

module.exports = {
  DEFAULT_VIDEO_EXTS, buildSeriesCatalog, cleanSeriesText, inferDirectoryContext,
  normalizeDisplayTitle, normalizeSeriesKey, parseFilenameMetadata, parseSeasonFolder,
  parseSeriesEntry, qualityScore, walkVideoFiles,
};
