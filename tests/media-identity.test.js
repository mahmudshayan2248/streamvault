'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  extractReleaseYear,
  normalizeMediaTitle,
  parseMediaIdentity,
} = require('../lib/media-identity');
const { scanCatalog } = require('../lib/catalog/scanner');

function episode(input) {
  const parsed = parseMediaIdentity(input);
  assert.equal(parsed.kind, 'episode', JSON.stringify(parsed));
  return parsed;
}

test('does not infer years from episode identifiers', () => {
  assert.equal(extractReleaseYear('“Imam Ahmed Bin Hanbal” Ep 10.mp4'), '');
  assert.equal(extractReleaseYear('INVASION - Ep 01 - Pilot.mkv'), '');
  assert.equal(extractReleaseYear('Show S2014E01.mkv'), '');
  assert.equal(extractReleaseYear('1x05 Colt\'s Angels.avi'), '');
  assert.equal(extractReleaseYear('Full Metal Jacket (1987).mkv'), '1987');
  assert.equal(extractReleaseYear('Groundhog.Day.1993.1080p.BluRay.mkv'), '1993');
  assert.equal(extractReleaseYear('The Great Dictator 1940 1080p.mkv'), '1940');
});

test('parses high-confidence path-based TV episodes', () => {
  const fallGuy = episode({
    source_path: "http://ftp.example/English%20TV%20Series/The%20Fall%20Guy%20(TV%20Series%201981-1986)/S01/1x05%20Colt's%20Angels.avi",
    title: "1x05 Colt's Angels",
  });
  assert.equal(fallGuy.seriesName, 'The Fall Guy');
  assert.equal(fallGuy.season, 1);
  assert.equal(fallGuy.episode, 5);
  assert.equal(fallGuy.confidence, 'high');

  const imam = episode({
    source_path: 'http://ftp6.circleftp.net/FILE/English%20&%20Foreign%20TV%20Series/Imam%20(TV%20Series%202017)/Season%201/%e2%80%9cImam%20Ahmed%20Bin%20Hanbal%e2%80%9d%20Ep%2010.mp4',
    title: '“Imam Ahmed Bin Hanbal” Ep 10',
  });
  assert.equal(imam.seriesName, 'Imam');
  assert.equal(imam.season, 1);
  assert.equal(imam.episode, 10);
  assert.equal(imam.year, '2017');
  assert.equal(imam.confidence, 'high');
});

test('parses representative episode filename patterns', () => {
  const cases = [
    [{ title: 'Miss Sherlock EP01.mkv', source_path: '/TV/Miss Sherlock/Season 1/Miss Sherlock EP01.mkv' }, 'Miss Sherlock', 1, 1],
    [{ title: 'INVASION - Ep 01 - Pilot.mkv', source_path: '/TV/INVASION/Season 1/INVASION - Ep 01 - Pilot.mkv' }, 'INVASION', 1, 1],
    [{ title: 'Yudh - Episode 03.mkv', source_path: '/TV/Yudh/Season 1/Yudh - Episode 03.mkv' }, 'Yudh', 1, 3],
    [{ title: '1883 S01E00 1883 The Road West.mkv', source_path: '/TV/1883 (TV Series 2021)/Season 1/1883 S01E00 1883 The Road West.mkv' }, '1883', 1, 0],
    [{ title: 'S01E19-Yokohama Disturbance Part I.mkv', source_path: '/TV/The Irregular at Magic High School/Season 1/S01E19-Yokohama Disturbance Part I.mkv' }, 'The Irregular at Magic High School', 1, 19],
    [{ title: '3 Nen A Kumi ... EP01.mkv', source_path: '/TV/3 Nen A Kumi/Season 1/3 Nen A Kumi ... EP01.mkv' }, '3 Nen A Kumi', 1, 1],
  ];
  for (const [input, seriesName, season, ep] of cases) {
    const parsed = episode(input);
    assert.equal(parsed.seriesName, seriesName, input.title);
    assert.equal(parsed.season, season, input.title);
    assert.equal(parsed.episode, ep, input.title);
    assert.notEqual(parsed.year, String(2000 + ep).padStart(4, '0'), input.title);
  }
});

test('keeps real movie titles as movies with trustworthy years', () => {
  for (const title of ['Full Metal Jacket (1987).mkv', 'Groundhog Day (1993).mp4', 'The Great Dictator 1940 1080p.mkv']) {
    const parsed = parseMediaIdentity({ title, source_path: `/Movies/${title}` });
    assert.equal(parsed.kind, 'movie', title);
    assert.ok(parsed.title.length >= 3, title);
    assert.equal(normalizeMediaTitle(title).includes('Ep 10'), false);
  }
});

test('scanner reclassifies high-confidence movie-root episode files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-catalog-'));
  const movies = path.join(root, 'movies');
  const series = path.join(root, 'series');
  fs.mkdirSync(path.join(movies, 'Imam (TV Series 2017)', 'Season 1'), { recursive: true });
  fs.mkdirSync(series, { recursive: true });
  fs.writeFileSync(path.join(movies, 'Imam (TV Series 2017)', 'Season 1', '“Imam Ahmed Bin Hanbal” Ep 10.mp4'), 'x');
  fs.writeFileSync(path.join(movies, 'Groundhog Day (1993).mp4'), 'x');

  const catalog = scanCatalog({ moviesDir: movies, seriesDir: series, videoExts: ['.mp4'], posterCache: {}, logger: { warn() {}, log() {} }, useWorker: false });
  assert.equal(catalog.stats.movies, 1);
  assert.equal(catalog.stats.episodes, 1);
  assert.equal(catalog.diagnostics.reclassifiedMovieEpisodes, 1);
  const show = catalog.series.find(item => item.name === 'Imam');
  assert.ok(show);
  assert.equal(show.seasons['1'][0].episode, 10);
});
