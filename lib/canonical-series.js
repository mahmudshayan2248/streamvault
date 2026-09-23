'use strict';

const crypto = require('crypto');
const path = require('path');
const {
  normalizeDisplayTitle,
  normalizeSeriesKey,
  parseSeriesEntry,
} = require('./series-library');
const { extractReleaseYear, parseMediaIdentity } = require('./media-identity');

function hash(value, length = 16) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, length);
}

function yearFrom(value) {
  return extractReleaseYear(value);
}

function isGenericShowName(value) {
  const text = normalizeDisplayTitle(value);
  return /^(?:season|series|specials?|episodes?|complete|english|hindi|korean|dual audio|multi audio)\b/i.test(text) || /^\(?\d{4}\)?\s+(?:ppv|raw|smackdown|nxt)$/i.test(text);
}

function inferredEpisodeShowName(raw = {}) {
  for (const season of seasonEntries(raw.seasons)) {
    for (const episode of season.episodes.slice(0, 3)) {
      const url = sourceUrl(episode);
      const file = episode?.file || episode?.filename || decodeFilename(url);
      let relativePath = file;
      try {
        const parts = new URL(url).pathname.split('/').filter(Boolean).map(value => {
          try { return decodeURIComponent(value); } catch { return value; }
        });
        relativePath = parts.slice(-4).join('/') || file;
      } catch {}
      const parsed = parseSeriesEntry({ file, relativePath, type: 'episode', streamUrl: url });
      if (parsed?.showName && !isGenericShowName(parsed.showName)) return parsed.showName;
    }
  }
  return '';
}

function cleanName(raw = {}) {
  const original = raw.name || raw.title || raw.displayTitle || raw.file || raw.filename || '';
  const inferred = isGenericShowName(original) ? inferredEpisodeShowName(raw) : '';
  return normalizeDisplayTitle(inferred || original);
}

function parentheticalAliasKey(name, year) {
  if (!year) return '';
  const match = String(name || '').match(/^(.+?)\s+\(([^)]+)\)\s*$/);
  if (!match || match[1].trim().length < 3 || match[2].trim().length < 3) return '';
  return `${normalizeSeriesKey(match[1])}|${year}`;
}

function seasonNumber(value, fallback = 1) {
  if (value === 0 || value === '0') return 0;
  if (/specials?/i.test(String(value || ''))) return 0;
  const number = Number(String(value ?? '').match(/\d{1,3}/)?.[0]);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function seasonEntries(seasons) {
  if (Array.isArray(seasons)) {
    return seasons.map((season, index) => ({
      season: seasonNumber(season?.season ?? season?.seasonNumber ?? season?.number, index + 1),
      episodes: Array.isArray(season?.episodes) ? season.episodes : (Array.isArray(season?.items) ? season.items : []),
    }));
  }
  if (!seasons || typeof seasons !== 'object') return [];
  return Object.entries(seasons).map(([key, value], index) => ({
    season: seasonNumber(key, seasonNumber(value?.season ?? value?.seasonNumber, index + 1)),
    episodes: Array.isArray(value) ? value : (Array.isArray(value?.episodes) ? value.episodes : (Array.isArray(value?.items) ? value.items : [])),
  }));
}

function sourceUrl(raw = {}) {
  return String(raw.streamUrl || raw.url || raw.src || raw.link || '').trim();
}

function sourceHost(url = '') {
  try { return new URL(url).hostname.toLowerCase(); }
  catch { return ''; }
}

function episodeQuality(raw = {}) {
  const text = [raw.file, raw.filename, raw.title, raw.name, sourceUrl(raw)].filter(Boolean).join(' ');
  if (/\b2160p\b|\b4k\b|\buhd\b/i.test(text)) return 5;
  if (/\b1080p\b/i.test(text)) return 4;
  if (/\b720p\b/i.test(text)) return 3;
  if (/\b(?:576p|540p)\b/i.test(text)) return 2;
  if (/\b480p\b/i.test(text)) return 1;
  return 0;
}

function episodeSource(raw = {}, source = '') {
  const url = sourceUrl(raw);
  return {
    streamUrl: url,
    streamId: raw.streamId ?? null,
    file: raw.file || raw.filename || (url ? decodeFilename(url) : ''),
    source: raw.source || raw.server || source || '',
    sourceHost: raw.sourceHost || sourceHost(url),
    isFtp: raw.isFtp !== false && !!url,
    isMassiveCatalog: !!raw.isMassiveCatalog,
    quality: episodeQuality(raw),
  };
}

function decodeFilename(url) {
  try { return decodeURIComponent(path.posix.basename(new URL(url).pathname)); }
  catch { return String(url || '').split('/').pop() || ''; }
}

function normalizeEpisode(raw, showName, defaultSeason, index, source) {
  const episode = raw && typeof raw === 'object' ? raw : { streamUrl: String(raw || '') };
  const url = sourceUrl(episode);
  const file = episode.file || episode.filename || decodeFilename(url);
  let parsed = null;
  if (file) {
    let relativePath = file;
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean).map(value => {
        try { return decodeURIComponent(value); } catch { return value; }
      });
      relativePath = parts.slice(-4).join('/') || file;
    } catch {}
    parsed = parseSeriesEntry({ file, relativePath, type: 'episode', streamUrl: url });
  }
  const explicitNumber = Number(episode.episode ?? episode.number ?? episode.episodeNumber);
  const number = Number.isInteger(explicitNumber) && explicitNumber >= 0
    ? explicitNumber
    : (parsed?.episode ?? index + 1);
  const explicitSeason = episode.season ?? episode.seasonNumber;
  const season = explicitSeason === 0 || explicitSeason === '0'
    ? 0
    : seasonNumber(explicitSeason, parsed?.season ?? defaultSeason);
  const playback = episodeSource({ ...episode, file }, source);
  if (!playback.streamUrl && playback.streamId == null) return null;
  const epTitle = String(episode.epTitle || episode.title || episode.name || parsed?.epTitle || `Episode ${number}`).trim();
  return {
    season,
    episode: number,
    epTitle: epTitle || `Episode ${number}`,
    file,
    streamUrl: playback.streamUrl,
    streamId: playback.streamId,
    isFtp: playback.isFtp,
    isMassiveCatalog: playback.isMassiveCatalog,
    source: playback.source,
    sourceHost: playback.sourceHost,
    sources: [playback],
  };
}

function mergeEpisode(existing, incoming, diagnostics) {
  const byIdentity = new Map();
  for (const source of [...(existing.sources || []), ...(incoming.sources || [])]) {
    const key = source.streamUrl || `local:${source.streamId}`;
    if (!key) continue;
    const current = byIdentity.get(key);
    if (!current || source.quality > current.quality) byIdentity.set(key, source);
  }
  const sources = [...byIdentity.values()].sort((a, b) =>
    b.quality - a.quality || String(a.streamUrl || a.streamId).localeCompare(String(b.streamUrl || b.streamId))
  );
  const best = sources[0] || episodeSource(incoming);
  diagnostics.duplicatesSuppressed++;
  if (diagnostics.sampleDuplicateGroups.length < 25) {
    diagnostics.sampleDuplicateGroups.push({
      show: incoming._showName,
      season: incoming.season,
      episode: incoming.episode,
      sources: sources.map(item => item.streamUrl || `stream:${item.streamId}`),
    });
  }
  return {
    ...existing,
    ...incoming,
    epTitle: incoming.epTitle && !/^Episode \d+$/i.test(incoming.epTitle) ? incoming.epTitle : existing.epTitle,
    file: best.file || incoming.file || existing.file,
    streamUrl: best.streamUrl || '',
    streamId: best.streamId ?? null,
    isFtp: best.isFtp,
    isMassiveCatalog: best.isMassiveCatalog,
    source: best.source,
    sourceHost: best.sourceHost,
    sources,
  };
}

function metadataScore(item = {}) {
  return Number(!!item.tmdbId) * 50 + Number(!!item.poster) * 20 + Number(!!item.backdrop) * 10 +
    Number(!!item.overview) * 8 + Number(!!item.genre) * 3 + Number(!!item.rating) * 2;
}

function mergeMetadata(show, raw) {
  const incoming = {
    name: cleanName(raw),
    title: cleanName(raw),
    year: String(raw.year || yearFrom(raw.name || raw.title) || ''),
    tmdbId: raw.tmdbId || raw.tmdb_id || null,
    poster: raw.poster || null,
    backdrop: raw.backdrop || raw.poster || null,
    overview: raw.overview || '',
    rating: raw.rating || raw.voteAverage || raw.vote_average || null,
    genre: raw.genre || '',
    language: raw.language || raw.originalLanguage || '',
    category: raw.category || '',
    productionCompanies: raw.productionCompanies || [],
  };
  const preferred = metadataScore(incoming) > metadataScore(show) ? incoming : show;
  const other = preferred === incoming ? show : incoming;
  for (const field of ['name','title','year','tmdbId','poster','backdrop','overview','rating','genre','language','category','productionCompanies']) {
    const value = preferred[field];
    show[field] = value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length)
      ? value
      : other[field];
  }
}

function createCanonicalSeriesIndex(inputs = {}) {
  const byId = new Map();
  const byKey = new Map();
  const aliases = new Map();
  const titleAliases = new Map();
  const loose = new Map();
  const diagnostics = {
    sources: {}, canonical: {}, unparsedEpisodeRecords: 0, duplicatesSuppressed: 0,
    emptyCardsWithRecoverableEpisodes: 0, sampleRecoverableEmptyCards: [],
    sampleUnparsedEpisodeRecords: [], sampleDuplicateGroups: [],
  };

  function resolve(raw) {
    const name = cleanName(raw);
    const normalizedKey = normalizeSeriesKey(name);
    if (!normalizedKey) return null;
    const year = String(raw.year || yearFrom(raw.name || raw.title) || '');
    const tmdb = String(raw.tmdbId || raw.tmdb_id || '').trim();
    if (tmdb && aliases.has(`tmdb:${tmdb}`)) return aliases.get(`tmdb:${tmdb}`);
    const exact = `${normalizedKey}|${year}`;
    if (byKey.has(exact)) return byKey.get(exact);
    const parentheticalAlias = parentheticalAliasKey(name, year);
    if (titleAliases.has(exact)) return titleAliases.get(exact);
    if (parentheticalAlias && titleAliases.has(parentheticalAlias)) return titleAliases.get(parentheticalAlias);
    const candidates = loose.get(normalizedKey) || [];
    if (candidates.length === 1) {
      const candidate = candidates[0];
      if (!year || !candidate.year || String(candidate.year) === year) return candidate;
    }
    const id = `series_${hash(exact)}`;
    const show = {
      id, name, title: name, normalizedKey, year, tmdbId: raw.tmdbId || raw.tmdb_id || null,
      poster: null, backdrop: null, overview: '', rating: null, genre: '', language: '',
      category: '', productionCompanies: [], type: 'series', _isSeries: true,
      isCanonicalSeries: true, seasons: {}, sourceKinds: [], _episodes: new Map(),
    };
    byId.set(id, show);
    byKey.set(exact, show);
    for (const aliasKey of [exact, parentheticalAlias].filter(Boolean)) {
      if (!titleAliases.has(aliasKey)) titleAliases.set(aliasKey, show);
      else if (titleAliases.get(aliasKey) !== show) titleAliases.delete(aliasKey);
    }
    const list = loose.get(normalizedKey) || [];
    list.push(show);
    loose.set(normalizedKey, list);
    return show;
  }

  function ingest(raw, source, sourceIndex) {
    if (!raw) return;
    const show = resolve(raw);
    if (!show) return;
    mergeMetadata(show, raw);
    if (!show.sourceKinds.includes(source)) show.sourceKinds.push(source);
    if (raw.id != null) aliases.set(String(raw.id), show);
    if (raw.tmdbId || raw.tmdb_id) aliases.set(`tmdb:${raw.tmdbId || raw.tmdb_id}`, show);
    aliases.set(`${source}:${sourceIndex}`, show);
    let sourceEpisodes = 0;
    for (const season of seasonEntries(raw.seasons)) {
      season.episodes.forEach((episode, episodeIndex) => {
        const normalized = normalizeEpisode(episode, show.name, season.season, episodeIndex, source);
        if (!normalized) {
          diagnostics.unparsedEpisodeRecords++;
          if (diagnostics.sampleUnparsedEpisodeRecords.length < 25) {
            diagnostics.sampleUnparsedEpisodeRecords.push({ source, show: show.name, file: episode?.file || episode?.filename || '', streamUrl: sourceUrl(episode) });
          }
          return;
        }
        sourceEpisodes++;
        normalized._showName = show.name;
        const key = `${normalized.season}:${normalized.episode}`;
        const current = show._episodes.get(key);
        show._episodes.set(key, current ? mergeEpisode(current, normalized, diagnostics) : normalized);
      });
    }
    const stat = diagnostics.sources[source] || (diagnostics.sources[source] = { shows: 0, episodes: 0 });
    stat.shows++;
    stat.episodes += sourceEpisodes;
  }

  for (const [source, list] of Object.entries(inputs)) {
    if (source === 'cards' || !Array.isArray(list)) continue;
    list.forEach((item, index) => ingest(item, source, index));
  }

  const shows = [...byId.values()];
  for (const show of shows) {
    const seasons = {};
    for (const episode of show._episodes.values()) {
      delete episode._showName;
      const key = String(episode.season);
      if (!seasons[key]) seasons[key] = [];
      seasons[key].push(episode);
    }
    delete show._episodes;
    const ordered = {};
    Object.keys(seasons).map(Number).sort((a, b) => a - b).forEach(season => {
      ordered[String(season)] = seasons[String(season)].sort((a, b) => a.episode - b.episode || String(a.file).localeCompare(String(b.file)));
    });
    show.seasons = ordered;
    show.seasonCount = Object.keys(ordered).length;
    show.episodeCount = Object.values(ordered).reduce((count, episodes) => count + episodes.length, 0);
    show.hasEpisodes = show.episodeCount > 0;
    show.isFtp = Object.values(ordered).some(episodes => episodes.some(episode => episode.isFtp));
    show.isMassiveCatalog = show.sourceKinds.includes('massiveCatalog');
    show.sourceKinds.sort();
  }
  shows.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  for (const card of Array.isArray(inputs.cards) ? inputs.cards : []) {
    const hasEpisodes = seasonEntries(card.seasons).some(season => season.episodes.length);
    if (hasEpisodes) continue;
    const resolved = (card.id != null && aliases.get(String(card.id))) || resolve(card);
    if (resolved?.episodeCount > 0) {
      diagnostics.emptyCardsWithRecoverableEpisodes++;
      if (diagnostics.sampleRecoverableEmptyCards.length < 25) {
        diagnostics.sampleRecoverableEmptyCards.push({ title: card.name || card.title, cardSource: card.cardSource || 'unknown', matchingEpisodes: resolved.episodeCount, canonicalId: resolved.id });
      }
    }
  }

  diagnostics.canonical = {
    shows: shows.length,
    showsWithEpisodes: shows.filter(show => show.episodeCount > 0).length,
    showsWithoutEpisodes: shows.filter(show => show.episodeCount === 0).length,
    seasons: shows.reduce((count, show) => count + show.seasonCount, 0),
    episodes: shows.reduce((count, show) => count + show.episodeCount, 0),
  };

  function find(query = {}) {
    if (query.id != null) {
      const id = String(query.id);
      if (byId.has(id)) return byId.get(id);
      if (aliases.has(id)) return aliases.get(id);
    }
    if (query.tmdbId && aliases.has(`tmdb:${query.tmdbId}`)) return aliases.get(`tmdb:${query.tmdbId}`);
    const key = normalizeSeriesKey(query.name || query.title || '');
    if (!key) return null;
    const year = String(query.year || yearFrom(query.name || query.title) || '');
    if (byKey.has(`${key}|${year}`)) return byKey.get(`${key}|${year}`);
    const candidates = loose.get(key) || [];
    if (candidates.length === 1) return candidates[0];
    if (year) return candidates.find(show => String(show.year) === year) || null;
    return candidates.sort((a, b) => b.episodeCount - a.episodeCount)[0] || null;
  }

  return { shows, byId, byKey, aliases, diagnostics, find };
}

function seriesSummary(show) {
  if (!show) return null;
  const { seasons, ...summary } = show;
  return {
    ...summary,
    seasons: {},
    seasonCount: show.seasonCount || 0,
    episodeCount: show.episodeCount || 0,
    hasEpisodes: show.episodeCount > 0,
    hasStream: show.episodeCount > 0,
    streamAvailable: show.episodeCount > 0,
    isSummary: true,
    detailResolvable: true,
  };
}

function groupEpisodeRecords(records = [], options = {}) {
  const groups = new Map();
  const episodeUrls = new Set();
  const unparsed = [];
  let candidates = 0;
  for (const raw of Array.isArray(records) ? records : []) {
    const url = sourceUrl(raw);
    const file = raw.file || raw.filename || decodeFilename(url);
    const identity = raw.title || file || url;
    candidates++;
    let relativePath = file;
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean).map(value => {
        try { return decodeURIComponent(value); } catch { return value; }
      });
      relativePath = parts.slice(-4).join('/') || file;
    } catch {}
    const parsedIdentity = parseMediaIdentity({
      title: raw.title || raw.name || file,
      filename: file,
      relativePath,
      streamUrl: url,
      source_path: raw.source_path || raw.sourcePath || url || relativePath,
    });
    if (typeof options.isSeriesRecord === 'function' && !options.isSeriesRecord(identity, raw) && parsedIdentity.confidence !== 'high') continue;
    const parsed = parseSeriesEntry({ file, relativePath, type: 'episode', streamUrl: url, title: raw.title || raw.name || file });
    if (!parsed) {
      unparsed.push({ title: raw.title || '', relativePath, streamUrl: url });
      continue;
    }
    const key = parsed.seriesKey;
    let show = groups.get(key);
    if (!show) {
      show = {
        id: `massive_${hash(key)}`,
        name: parsed.showName,
        title: parsed.showName,
        year: yearFrom(relativePath),
        type: 'series',
        isFtp: true,
        isMassiveCatalog: true,
        seasons: {},
      };
      groups.set(key, show);
    }
    const season = String(parsed.season);
    if (!show.seasons[season]) show.seasons[season] = [];
    show.seasons[season].push({
      streamId: null,
      episode: parsed.episode,
      epTitle: parsed.epTitle || `Episode ${parsed.episode}`,
      file,
      streamUrl: url,
      isFtp: true,
      isMassiveCatalog: true,
      source: raw.source || raw.server || 'massiveCatalog',
      sourceHost: sourceHost(url),
    });
    if (url) episodeUrls.add(url);
  }
  const shows = [...groups.values()];
  for (const show of shows) {
    for (const episodes of Object.values(show.seasons)) {
      episodes.sort((a, b) => a.episode - b.episode || String(a.file).localeCompare(String(b.file)));
    }
  }
  return {
    shows,
    episodeUrls,
    diagnostics: {
      candidates,
      parsed: episodeUrls.size,
      unparsed: unparsed.length,
      sampleUnparsed: unparsed.slice(0, 25),
    },
  };
}

module.exports = {
  createCanonicalSeriesIndex,
  groupEpisodeRecords,
  seasonEntries,
  seriesSummary,
  yearFrom,
};
