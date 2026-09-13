'use strict';

const assert = require('assert');
const { createCanonicalSeriesIndex, groupEpisodeRecords, seriesSummary } = require('../lib/canonical-series');
const { mergeCatalogItems } = require('../lib/catalog-dedupe');

function remote(file, season, episode, host = 'media.example') {
  return {
    file,
    season,
    episode,
    streamUrl: `http://${host}/shows/Test%20Show/Season%20${season}/${encodeURIComponent(file)}`,
    isFtp: true,
  };
}

const index = createCanonicalSeriesIndex({
  cards: [{ name: 'Test Show', year: '2024', seasons: {}, cardSource: 'searchSummary' }],
  metadata: [{
    id: 'metadata-card', name: 'Test Show', year: '2024', tmdbId: 123,
    poster: 'https://image.example/poster.jpg', overview: 'Metadata survives.', seasons: {},
  }],
  ftpCatalog: [{
    id: 'ftp_series_9', title: 'Test.Show (2024)', year: '2024',
    seasons: {
      1: [
        remote('Test.Show.S01E01.720p.mkv', 1, 1, 'source-a.example'),
        remote('Test.Show.S01E01.1080p.mkv', 1, 1, 'source-b.example'),
        remote('Test.Show.S01E02.mkv', 1, 2),
      ],
    },
  }],
});

assert.strictEqual(index.shows.length, 1, 'metadata and episode records should form one canonical show');
const show = index.find({ id: 'ftp_series_9' });
assert(show, 'legacy IDs must resolve');
assert.strictEqual(show.id.startsWith('series_'), true);
assert.strictEqual(show.poster, 'https://image.example/poster.jpg');
assert.strictEqual(show.overview, 'Metadata survives.');
assert.strictEqual(show.seasonCount, 1);
assert.strictEqual(show.episodeCount, 2);
assert.match(show.seasons['1'][0].id, /^episode_[a-f0-9]{24}$/);
assert.strictEqual(show.seasons['1'][0].mediaId, show.seasons['1'][0].id);
assert.match(show.seasons['1'][0].streamUrl, /1080p/);
assert.strictEqual(show.seasons['1'][0].sources.length, 2, 'alternate source must be preserved');
assert.strictEqual(index.diagnostics.emptyCardsWithRecoverableEpisodes, 1, 'recoverable empty-card mismatch must be detected');

const summary = seriesSummary(show);
assert.strictEqual(summary.id, show.id);
assert.deepStrictEqual(summary.seasons, {});
assert.strictEqual(summary.episodeCount, 2);
assert.strictEqual(summary.detailResolvable, true);

const remakes = createCanonicalSeriesIndex({
  ftpCatalog: [
    { name: 'Same Name', year: '1995', seasons: { 1: [remote('Same.Name.S01E01.mkv', 1, 1)] } },
    { name: 'Same Name', year: '2020', seasons: { 1: [remote('Same.Name.S01E01.mkv', 1, 1, 'other.example')] } },
  ],
});
assert.strictEqual(remakes.shows.length, 2, 'same-name remakes with different years must remain separate');
assert.notStrictEqual(remakes.shows[0].seasons['1'][0].id, remakes.shows[1].seasons['1'][0].id, 'remakes need distinct stable episode IDs');

const translatedTitle = createCanonicalSeriesIndex({
  ftpCatalog: [
    { name: 'Money Heist (La Casa de Papel)', year: '2017', seasons: { 1: [remote('Money.Heist.S01E01.mkv', 1, 1)] } },
    { name: 'Money Heist', year: '2017', seasons: { 2: [remote('Money.Heist.S02E01.mkv', 2, 1, 'other.example')] } },
  ],
});
assert.strictEqual(translatedTitle.shows.length, 1, 'same-year parenthetical translated title should resolve as a conservative alias');
assert.strictEqual(translatedTitle.shows[0].episodeCount, 2);

const genericFolders = createCanonicalSeriesIndex({
  ftpCatalog: [
    { name: 'Season 3 (Korean Language)', seasons: { 3: [{ episode: 1, file: 'Alpha.Show.S03E01.mkv', streamUrl: 'http://ftp.example/Alpha%20Show/Season%203/Alpha.Show.S03E01.mkv' }] } },
    { name: 'Season 3 (Korean Language)', seasons: { 3: [{ episode: 1, file: 'Beta.Show.S03E01.mkv', streamUrl: 'http://ftp.example/Beta%20Show/Season%203/Beta.Show.S03E01.mkv' }] } },
  ],
});
assert.deepStrictEqual(genericFolders.shows.map(item => item.name).sort(), ['Alpha Show', 'Beta Show']);

const massive = groupEpisodeRecords([
  { title: 'Death Note - Episode - 01 - Rebirth.mkv', url: 'http://ftp.example/Death%20Note/Season%201/Death%20Note%20-%20Episode%20-%2001%20-%20Rebirth.mkv' },
  { title: 'Anime Show Season 2 - 01.mkv', url: 'http://ftp.example/Anime%20Show/Season%202/Anime%20Show%20Season%202%20-%2001.mkv' },
], { isSeriesRecord: () => true });
assert.strictEqual(massive.diagnostics.parsed, 2);
assert.strictEqual(massive.diagnostics.unparsed, 0);

const cleanedMerge = mergeCatalogItems(
  { name: 'Cleaner Show', poster: 'poster.jpg', seasons: {} },
  { name: 'Cleaner Show', seasons: { 1: [remote('Cleaner.Show.S01E01.mkv', 1, 1)] } },
);
assert.strictEqual(cleanedMerge.poster, 'poster.jpg');
assert.strictEqual(cleanedMerge.seasons.length, 1);
assert.strictEqual(cleanedMerge.seasons[0].episodes.length, 1);

console.log('Canonical series tests passed: stable detail IDs, metadata/episode merging, duplicate source selection, remake isolation, generic-folder recovery, massive parsing, and cleaner season preservation.');
