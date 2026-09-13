'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  createMediaDownloadResolver,
  movieDownloadFilename,
  safeDownloadFilename,
} = require('../lib/media-download');

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'streamvault-download-'));
  const movieFile = 'Local Movie (2026).mkv';
  const episodeFile = 'Local Show S01E01 Pilot.mp4';
  fs.writeFileSync(path.join(root, movieFile), 'movie');
  fs.writeFileSync(path.join(root, episodeFile), 'episode');

  const fileIndex = [
    { dir: root, file: movieFile, type: 'movie' },
    { dir: root, file: episodeFile, type: 'episode' },
  ];
  const movies = options.movies || [
    { id: 0, name: 'Local Movie', year: '2026', type: 'movie' },
    { id: 'ftp_0', name: 'Remote Movie', year: '2025', streamUrl: 'https://media.example.test/Remote.Movie.2025.mkv', source: 'bloggerbd' },
    {
      id: 'multi_1', name: 'Multi Source', year: '2024', streamUrl: 'https://backup.example.test/Multi.Source.720p.mp4',
      sources: [
        { source: 'bloggerbd', url: 'https://backup.example.test/Multi.Source.720p.mp4' },
        { source: 'main', url: 'https://main.example.test/Multi.Source.1080p.mkv' },
      ]
    },
  ];
  const shows = options.shows || [
    {
      id: 'series_breakingbad', name: 'Breaking Bad', seasons: {
        '1': [{ id: 'episode_breakingbad_s01e01', season: 1, episode: 1, epTitle: 'Pilot', streamUrl: 'https://tv.example.test/Breaking.Bad.S01E01.1080p.mkv', sources: [
          { streamUrl: 'https://tv.example.test/Breaking.Bad.S01E01.1080p.mkv', quality: 4 },
          { streamUrl: 'https://tv.example.test/Breaking.Bad.S01E01.720p.mp4', quality: 3 },
        ] }]
      }
    },
    {
      id: 'series_got', name: 'Game of Thrones', seasons: {
        '1': [{ season: 1, episode: 1, epTitle: 'Winter Is Coming', streamId: 1, sources: [{ streamId: 1, quality: 4 }] }]
      }
    },
  ];
  const aliases = new Map([['legacy_breaking_bad', shows[0]]]);
  const state = {
    shows,
    find({ id, name, year }) {
      const direct = shows.find(show => show.id === id) || aliases.get(String(id));
      if (direct) return direct;
      return shows.find(show => show.name === name && (!year || !show.year || String(show.year) === String(year))) || null;
    }
  };
  const resolver = createMediaDownloadResolver({
    getFileIndex: () => fileIndex,
    getMovieItems: () => movies,
    getSeriesState: () => state,
  });
  return { root, resolver };
}

test('local movie resolves streamId through fileIndex', t => {
  const { root, resolver } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = resolver.resolveMovie({ id: 0 });
  assert.equal(result.kind, 'local');
  assert.equal(result.filePath, path.join(root, 'Local Movie (2026).mkv'));
  assert.equal(result.filename, 'Local Movie (2026).mkv');
});

test('source-agnostic indexed downloads resolve both movies and episodes', t => {
  const { root, resolver } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const movie = resolver.resolveIndexed({ id: 0 });
  const episode = resolver.resolveIndexed({ id: 1 });
  assert.equal(movie.mediaType, 'movie');
  assert.equal(movie.filename, 'Local Movie (2026).mkv');
  assert.equal(episode.mediaType, 'episode');
  assert.equal(episode.filename, 'Local Show S01E01 Pilot.mp4');
  assert.throws(() => resolver.resolveIndexed({ id: 'undefined' }), error => error.code === 'MEDIA_DOWNLOAD_NOT_FOUND');
});

test('remote movie resolves a trusted catalog source URL', t => {
  const { root, resolver } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = resolver.resolveMovie({ id: 'ftp_0' });
  assert.equal(result.kind, 'remote');
  assert.equal(result.url, 'https://media.example.test/Remote.Movie.2025.mkv');
  assert.equal(result.filename, 'Remote Movie (2025).mkv');
});

test('movie source selection reuses catalog ranking and excludes HLS', t => {
  const { root, resolver } = fixture({
    movies: [{
      id: 'multi_1', name: 'Multi Source', year: '2024',
      sources: [
        { source: 'main', url: 'https://main.example.test/mobile/index.m3u8' },
        { source: 'bloggerbd', url: 'https://backup.example.test/Multi.Source.720p.mp4' },
        { source: 'main', url: 'https://main.example.test/Multi.Source.1080p.mkv' },
      ]
    }]
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(resolver.resolveMovie({ id: 'multi_1' }).url, 'https://main.example.test/Multi.Source.1080p.mkv');
});

test('unknown movie is rejected', t => {
  const { root, resolver } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(() => resolver.resolveMovie({ id: 'unknown_movie' }), error => error.status === 404 && error.code === 'MOVIE_DOWNLOAD_NOT_FOUND');
});

test('Breaking Bad S01E01 resolves the exact canonical episode and ranked original source', t => {
  const { root, resolver } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = resolver.resolveEpisode({ seriesId: 'series_breakingbad', season: 1, episode: 1 });
  assert.equal(result.show.name, 'Breaking Bad');
  assert.equal(result.episode.epTitle, 'Pilot');
  assert.equal(result.url, 'https://tv.example.test/Breaking.Bad.S01E01.1080p.mkv');
  assert.equal(result.filename, 'Breaking Bad - S01E01 - Pilot.mkv');
});

test('canonical episode ID reuses the same episode resolver used by downloads', t => {
  const { root, resolver } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = resolver.resolveEpisodeById({ id: 'episode_breakingbad_s01e01' });
  assert.equal(result.show.id, 'series_breakingbad');
  assert.equal(result.episode.epTitle, 'Pilot');
  assert.equal(result.url, 'https://tv.example.test/Breaking.Bad.S01E01.1080p.mkv');
});

test('Game of Thrones S01E01 resolves the exact local episode', t => {
  const { root, resolver } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = resolver.resolveEpisode({ seriesId: 'series_got', season: 1, episode: 1 });
  assert.equal(result.kind, 'local');
  assert.equal(result.streamId, 1);
  assert.equal(result.filePath, path.join(root, 'Local Show S01E01 Pilot.mp4'));
  assert.equal(result.filename, 'Game of Thrones - S01E01 - Winter Is Coming.mp4');
});

test('episode streamId supplied by the UI resolves through the central file index', t => {
  const { root, resolver } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = resolver.resolveEpisode({ seriesId: 'series_got', season: 1, episode: 1, streamId: 1 });
  assert.equal(result.kind, 'local');
  assert.equal(result.streamId, 1);
  assert.equal(result.filePath, path.join(root, 'Local Show S01E01 Pilot.mp4'));
});

test('series aliases/stable identities resolve while invalid season and episode are rejected', t => {
  const { root, resolver } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(resolver.resolveEpisode({ seriesId: 'legacy_breaking_bad', season: 1, episode: 1 }).show.id, 'series_breakingbad');
  assert.throws(() => resolver.resolveEpisode({ seriesId: 'series_breakingbad', season: 2, episode: 1 }), error => error.code === 'SERIES_SEASON_NOT_FOUND');
  assert.throws(() => resolver.resolveEpisode({ seriesId: 'series_breakingbad', season: 1, episode: 99 }), error => error.code === 'SERIES_EPISODE_NOT_FOUND');
});

test('legacy series IDs fall back to canonical title and year identity', t => {
  const { root, resolver } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = resolver.resolveEpisode({
    seriesId: 'ftp_series_home_1805',
    name: 'Breaking Bad',
    year: '2008',
    season: 1,
    episode: 1,
  });
  assert.equal(result.show.id, 'series_breakingbad');
  assert.equal(result.episode.epTitle, 'Pilot');
});

test('filename sanitization preserves the original extension', () => {
  assert.equal(safeDownloadFilename('Movie: Test / Name? (2026)', '.mkv'), 'Movie Test Name (2026).mkv');
});

test('movie titles that already contain the source extension do not duplicate it', () => {
  assert.equal(
    movieDownloadFilename({ name: 'Aavesham (2024).mkv', year: '2024' }, { filename: 'source.mkv' }),
    'Aavesham (2024).mkv'
  );
});

test('arbitrary URL input cannot turn the resolver into an open proxy', t => {
  const { root, resolver } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(
    () => resolver.resolveMovie({ id: 'not-in-catalog', url: 'http://127.0.0.1/private.mkv' }),
    error => error.status === 404 && error.code === 'MOVIE_DOWNLOAD_NOT_FOUND'
  );
});
