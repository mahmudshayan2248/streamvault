'use strict';

const path = require('path');
const { selectBestSource } = require('./catalog-dedupe');

const ORIGINAL_MEDIA_EXTS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.mpg',
  '.mpeg', '.3gp', '.ogv', '.ogg', '.m2ts'
]);

class MediaDownloadError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'MediaDownloadError';
    this.status = status;
    this.code = code;
  }
}

function safeDecode(value) {
  try { return decodeURIComponent(String(value || '')); }
  catch { return String(value || ''); }
}

function sourceUrl(source = {}) {
  return String(source.url || source.streamUrl || source.href || '').trim();
}

function sourceFilename(source = {}) {
  const explicit = String(source.file || source.filename || '').trim();
  if (explicit) return path.basename(explicit.replace(/\\/g, '/'));
  const url = sourceUrl(source);
  if (!url) return '';
  try { return safeDecode(path.posix.basename(new URL(url).pathname)); }
  catch { return safeDecode(url.split(/[?#]/)[0].split('/').pop() || ''); }
}

function sourceExtension(source = {}) {
  const url = sourceUrl(source);
  let fromUrl = '';
  try { fromUrl = path.posix.extname(new URL(url).pathname).toLowerCase(); }
  catch { fromUrl = path.extname(url.split(/[?#]/)[0]).toLowerCase(); }
  if (fromUrl) return fromUrl;
  return path.extname(sourceFilename(source)).toLowerCase();
}

function isOriginalMediaSource(source = {}) {
  return ORIGINAL_MEDIA_EXTS.has(sourceExtension(source));
}

function normalizeRemoteSource(source = {}, fallback = {}) {
  const url = sourceUrl(source) || sourceUrl(fallback);
  if (!url) return null;
  let parsed;
  try { parsed = new URL(url); }
  catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
  const normalized = {
    ...fallback,
    ...source,
    url: parsed.href,
    streamUrl: parsed.href,
    file: source.file || source.filename || fallback.file || fallback.filename || sourceFilename({ url: parsed.href })
  };
  return isOriginalMediaSource(normalized) ? normalized : null;
}

function remoteSourcesForItem(item = {}) {
  const raw = [
    ...(Array.isArray(item.sources) ? item.sources : []),
    item
  ];
  const seen = new Set();
  const sources = [];
  for (const source of raw) {
    const normalized = normalizeRemoteSource(source, item);
    if (!normalized || seen.has(normalized.url)) continue;
    seen.add(normalized.url);
    sources.push(normalized);
  }
  return sources;
}

function selectBestOriginalMovieSource(items = []) {
  const sources = items.flatMap(remoteSourcesForItem);
  const selected = selectBestSource(sources);
  return selected ? sources.find(source => source.url === selected.url) || selected : null;
}

function normalizeIdentity(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function yearOf(value) {
  return String(value || '').match(/(?:19|20)\d{2}/)?.[0] || '';
}

function sameMovieIdentity(item, target) {
  if (!item || !target) return false;
  if (normalizeIdentity(item.name || item.title || item.file) !== normalizeIdentity(target.name || target.title || target.file)) return false;
  const itemYear = yearOf(item.year || item.name || item.title || item.file);
  const targetYear = yearOf(target.year || target.name || target.title || target.file);
  return !(itemYear && targetYear && itemYear !== targetYear);
}

function sanitizeFilenamePart(value, fallback = '') {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim() || fallback;
}

function safeDownloadFilename(stem, extension, fallbackStem = 'download') {
  const ext = ORIGINAL_MEDIA_EXTS.has(String(extension || '').toLowerCase())
    ? String(extension).toLowerCase()
    : '';
  if (!ext) throw new MediaDownloadError(400, 'DOWNLOAD_EXTENSION_UNAVAILABLE', 'Original media extension is unavailable');
  const cleanStem = sanitizeFilenamePart(stem, sanitizeFilenamePart(fallbackStem, 'download'));
  const maxStemLength = Math.max(1, 180 - ext.length);
  return `${cleanStem.slice(0, maxStemLength).replace(/[. ]+$/g, '') || 'download'}${ext}`;
}

function movieDownloadFilename(movie, source) {
  const original = sourceFilename(source);
  const ext = sourceExtension(source);
  const rawTitle = String(movie?.name || movie?.title || '');
  const title = sanitizeFilenamePart(
    ext && rawTitle.toLowerCase().endsWith(ext) ? rawTitle.slice(0, -ext.length) : rawTitle,
    ''
  );
  const year = yearOf(movie?.year || movie?.name || movie?.title || '');
  const stem = title ? `${title}${year && !title.includes(year) ? ` (${year})` : ''}` : path.basename(original, path.extname(original));
  return safeDownloadFilename(stem, ext, path.basename(original, path.extname(original)));
}

function episodeDownloadFilename(show, episode, source, seasonNumber, episodeNumber) {
  const original = sourceFilename(source);
  const showTitle = sanitizeFilenamePart(show?.name || show?.title || '', 'Series');
  const episodeTitle = sanitizeFilenamePart(episode?.epTitle || episode?.title || episode?.name || '', '');
  const marker = `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
  const stem = [showTitle, marker, episodeTitle && !/^Episode\s+\d+$/i.test(episodeTitle) ? episodeTitle : ''].filter(Boolean).join(' - ');
  return safeDownloadFilename(stem, sourceExtension(source), path.basename(original, path.extname(original)));
}

function contentDisposition(filename) {
  const clean = safeDownloadFilename(
    path.basename(String(filename || ''), path.extname(String(filename || ''))),
    path.extname(String(filename || '')),
    'download'
  );
  const ascii = clean.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(clean).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function localSourceForIndex(getFileIndex, streamId, expectedType) {
  if (!/^\d+$/.test(String(streamId ?? ''))) return null;
  const index = Number(streamId);
  const entry = getFileIndex()[index];
  if (!entry || (expectedType && entry.type !== expectedType)) return null;
  const base = path.resolve(entry.dir);
  const filePath = path.resolve(entry.dir, entry.file);
  if (filePath !== base && !filePath.startsWith(`${base}${path.sep}`)) {
    throw new MediaDownloadError(403, 'DOWNLOAD_PATH_REJECTED', 'Media path is outside its indexed directory');
  }
  return { kind: 'local', streamId: index, entry, filePath, source: entry };
}

function createMediaDownloadResolver(options = {}) {
  const getFileIndex = options.getFileIndex || (() => []);
  const getMovieItems = options.getMovieItems || (() => []);
  const getSeriesState = options.getSeriesState || (() => null);

  function resolveIndexed(query = {}) {
    const local = localSourceForIndex(getFileIndex, query.id);
    if (!local || !['movie', 'episode'].includes(String(local.entry.type || '').toLowerCase())) {
      throw new MediaDownloadError(404, 'MEDIA_DOWNLOAD_NOT_FOUND', 'Downloadable media was not found');
    }
    const original = sourceFilename(local.entry);
    const filename = safeDownloadFilename(
      path.basename(original, path.extname(original)),
      sourceExtension(local.entry),
      local.entry.type === 'episode' ? 'episode' : 'movie'
    );
    return {
      ...local,
      mediaType: local.entry.type,
      filename,
    };
  }

  function resolveMovie(query = {}) {
    const local = localSourceForIndex(getFileIndex, query.id, 'movie');
    if (local) {
      const catalogMovie = (getMovieItems() || []).find(item => String(item?.id) === String(query.id));
      const movie = catalogMovie ? {
        ...catalogMovie,
        name: catalogMovie.name || catalogMovie.title || query.title,
        year: catalogMovie.year || query.year || '',
      } : {
        id: query.id,
        name: query.title || path.basename(local.entry.file, path.extname(local.entry.file)),
        year: query.year || ''
      };
      return { ...local, mediaType: 'movie', movie, filename: movieDownloadFilename(movie, local.entry) };
    }

    const items = (getMovieItems() || []).filter(Boolean);
    const id = String(query.id || '').trim();
    let target = items.find(item => String(item.id ?? '') === id || String(item.tmdbId ?? '') === id) || null;
    if (!target && /^(?:ftp_(?:home|kw)_\d+|tmdb_\d+)$/i.test(id) && query.title) {
      const wantedTitle = normalizeIdentity(query.title);
      const wantedYear = yearOf(query.year || query.title);
      target = items.find(item => normalizeIdentity(item.name || item.title || item.file) === wantedTitle &&
        (!wantedYear || !yearOf(item.year || item.name || item.title) || yearOf(item.year || item.name || item.title) === wantedYear)) || null;
    }
    if (!target) throw new MediaDownloadError(404, 'MOVIE_DOWNLOAD_NOT_FOUND', 'Downloadable movie was not found');

    const matches = items.filter(item => sameMovieIdentity(item, target));
    const source = selectBestOriginalMovieSource(matches.length ? matches : [target]);
    if (!source) throw new MediaDownloadError(404, 'MOVIE_ORIGINAL_SOURCE_NOT_FOUND', 'Original movie source was not found');
    return {
      kind: 'remote',
      mediaType: 'movie',
      movie: target,
      source,
      url: source.url,
      filename: movieDownloadFilename(target, source)
    };
  }

  function resolveEpisode(query = {}) {
    const state = getSeriesState();
    const show = state?.find?.({
      id: query.seriesId,
      tmdbId: query.tmdbId,
      name: query.name || query.title,
      year: query.year,
    }) || null;
    if (!show) throw new MediaDownloadError(404, 'SERIES_DOWNLOAD_NOT_FOUND', 'Canonical series was not found');
    const seasonNumber = Number(query.season);
    const episodeNumber = Number(query.episode);
    if (!Number.isInteger(seasonNumber) || seasonNumber < 0 || !Array.isArray(show.seasons?.[String(seasonNumber)])) {
      throw new MediaDownloadError(404, 'SERIES_SEASON_NOT_FOUND', 'Series season was not found');
    }
    const episode = show.seasons[String(seasonNumber)].find(item => Number(item?.episode) === episodeNumber);
    if (!episode) throw new MediaDownloadError(404, 'SERIES_EPISODE_NOT_FOUND', 'Series episode was not found');

    const candidates = [
      ...(query.streamId !== null && query.streamId !== undefined ? [{ streamId: query.streamId }] : []),
      episode,
      ...(Array.isArray(episode.sources) ? episode.sources : [])
    ];
    const seen = new Set();
    for (const candidate of candidates) {
      if (candidate?.streamId !== null && candidate?.streamId !== undefined) {
        const local = localSourceForIndex(getFileIndex, candidate.streamId, 'episode');
        if (local) {
          return {
            ...local,
            mediaType: 'episode',
            show,
            episode,
            seasonNumber,
            episodeNumber,
            filename: episodeDownloadFilename(show, episode, local.entry, seasonNumber, episodeNumber)
          };
        }
      }
      const source = normalizeRemoteSource(candidate, episode);
      if (!source || seen.has(source.url)) continue;
      seen.add(source.url);
      return {
        kind: 'remote',
        mediaType: 'episode',
        show,
        episode,
        seasonNumber,
        episodeNumber,
        source,
        url: source.url,
        filename: episodeDownloadFilename(show, episode, source, seasonNumber, episodeNumber)
      };
    }
    throw new MediaDownloadError(404, 'EPISODE_ORIGINAL_SOURCE_NOT_FOUND', 'Original episode source was not found');
  }

  function resolveEpisodeById(query = {}) {
    const id = String(query.id ?? '').trim();
    if (!id) throw new MediaDownloadError(404, 'EPISODE_DOWNLOAD_NOT_FOUND', 'Downloadable episode was not found');

    const local = localSourceForIndex(getFileIndex, id, 'episode');
    if (local) {
      const original = sourceFilename(local.entry);
      return {
        ...local,
        mediaType: 'episode',
        episode: local.entry,
        filename: safeDownloadFilename(
          path.basename(original, path.extname(original)),
          sourceExtension(local.entry),
          'episode'
        )
      };
    }

    const state = getSeriesState();
    for (const show of (state?.shows || [])) {
      for (const [seasonKey, episodes] of Object.entries(show.seasons || {})) {
        if (!Array.isArray(episodes)) continue;
        for (const episode of episodes) {
          const identities = [episode?.id, episode?.mediaId, episode?.streamId]
            .filter(value => value !== null && value !== undefined)
            .map(String);
          if (!identities.includes(id)) continue;
          return resolveEpisode({
            seriesId: show.id,
            season: Number(episode.season || episode.seasonNumber || seasonKey),
            episode: Number(episode.episode || episode.number || episode.episodeNumber),
            streamId: episode.streamId,
            name: show.name || show.title,
            year: show.year,
            tmdbId: show.tmdbId,
          });
        }
      }
    }
    throw new MediaDownloadError(404, 'EPISODE_DOWNLOAD_NOT_FOUND', 'Downloadable episode was not found');
  }

  return { resolveIndexed, resolveMovie, resolveEpisode, resolveEpisodeById };
}

module.exports = {
  MediaDownloadError,
  ORIGINAL_MEDIA_EXTS,
  contentDisposition,
  createMediaDownloadResolver,
  episodeDownloadFilename,
  isOriginalMediaSource,
  movieDownloadFilename,
  safeDownloadFilename,
  selectBestOriginalMovieSource,
  sourceExtension
};
