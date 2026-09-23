'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMediaCacheDb } = require('../lib/media-cache-db');

function fakeDb() {
  return createMediaCacheDb({ env: {}, logger: { log() {}, warn() {} } });
}

test('DB local movie artwork wins over remote catalog artwork', () => {
  const db = fakeDb();
  const maps = db.emptyMaps();
  db.indexMovieRow(maps, {
    media_key: 'movie_the_matrix_1999',
    stream_id: 'http://source.example/movies/The.Matrix.1999.mkv',
    title: 'The Matrix',
    year: '1999',
    tmdb_id: 603,
    poster_url: 'https://streamvault.fit/cache/posters/movies/the-matrix.jpg',
    remote_poster_url: 'https://image.tmdb.org/t/p/w500/a.jpg',
    overview: 'A hacker learns the truth.',
  });
  db.maps = maps;

  const hydrated = db.hydrateMovie({
    name: 'The Matrix',
    year: '1999',
    poster: 'https://image.tmdb.org/t/p/w500/old.jpg',
  });

  assert.equal(hydrated.poster, 'https://streamvault.fit/cache/posters/movies/the-matrix.jpg');
  assert.equal(hydrated.tmdbId, 603);
  assert.equal(hydrated.overview, 'A hacker learns the truth.');
});

test('existing local movie artwork is preserved over DB remote fallback', () => {
  const db = fakeDb();
  const maps = db.emptyMaps();
  db.indexMovieRow(maps, {
    title: 'Local First',
    year: '2020',
    poster_url: 'https://image.tmdb.org/t/p/w500/remote.jpg',
  });
  db.maps = maps;

  const hydrated = db.hydrateMovie({
    name: 'Local First',
    year: '2020',
    poster: 'https://streamvault.fit/cache/posters/movies/local-first.jpg',
  });

  assert.equal(hydrated.poster, 'https://streamvault.fit/cache/posters/movies/local-first.jpg');
});

test('episode stills hydrate series seasons without changing playback fields', () => {
  const db = fakeDb();
  const maps = db.emptyMaps();
  db.indexSeriesRow(maps, {
    series_key: 'the fall guy',
    series_name: 'The Fall Guy',
    year: '1981',
    poster_url: 'https://streamvault.fit/cache/posters/series/the-fall-guy.jpg',
  });
  db.indexEpisodeRow(maps, {
    episode_key: 'the-fall-guy-s1e5',
    stream_id: 'http://source.example/TV/The%20Fall%20Guy/S01/1x05%20Colts%20Angels.avi',
    series_key: 'the fall guy',
    series_name: 'The Fall Guy',
    season_num: 1,
    episode_num: 5,
    episode_title: "Colt's Angels",
    poster_url: 'https://streamvault.fit/cache/posters/episodes/the-fall-guy-s01e05.jpg',
  });
  db.maps = maps;

  const hydrated = db.hydrateSeriesDeep({
    name: 'The Fall Guy',
    year: '1981',
    seasons: {
      1: [{ episode: 5, season: 1, epTitle: 'Episode 5', streamUrl: 'http://source.example/TV/The%20Fall%20Guy/S01/1x05%20Colts%20Angels.avi', isFtp: true }],
    },
  });

  const ep = hydrated.seasons[1][0];
  assert.equal(hydrated.poster, 'https://streamvault.fit/cache/posters/series/the-fall-guy.jpg');
  assert.equal(ep.epTitle, "Colt's Angels");
  assert.equal(ep.thumb, 'https://streamvault.fit/cache/posters/episodes/the-fall-guy-s01e05.jpg');
  assert.equal(ep.streamUrl, 'http://source.example/TV/The%20Fall%20Guy/S01/1x05%20Colts%20Angels.avi');
  assert.equal(ep.isFtp, true);
});
