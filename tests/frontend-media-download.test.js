'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function frontendFixture(fetchImpl = async () => { throw new Error('unexpected fetch'); }) {
  const clicked = [];
  const document = {
    body: { appendChild() {} },
    createElement(tag) {
      assert.equal(tag, 'a', 'downloads must use a top-level anchor, not an iframe');
      return { style: {}, click() { clicked.push(this.href); }, remove() {} };
    },
  };
  const window = {
    document,
    fetch: fetchImpl,
    URLSearchParams,
    svBackendUrl: value => `https://backend.streamvault.fit${value}`,
  };
  window.window = window;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'hostinger', 'media-download-launch-v2.js'), 'utf8'),
    window
  );
  return { window, clicked };
}

test('episode Download generates a stable-ID URL without a movie lookup', async () => {
  const { window, clicked } = frontendFixture();
  const show = { seasons: { '1': [{
    id: 'episode_ab4c4361022f21593e42268a',
    mediaId: 'episode_ab4c4361022f21593e42268a',
    episode: 1,
  }] } };
  await window.downloadSeriesEpisode(null, 1, 0, show);
  assert.deepEqual(clicked, [
    'https://backend.streamvault.fit/api/download/episode/episode_ab4c4361022f21593e42268a'
  ]);
});

test('legacy cached episode is refreshed to its canonical stable ID before download', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ seasons: { '1': [{
    id: 'episode_705463ef9ef62c59c179ff56',
    mediaId: 'episode_705463ef9ef62c59c179ff56',
    episode: 1,
  }] } }) });
  const { window, clicked } = frontendFixture(fetchImpl);
  const staleShow = { name: 'Professor T', seasons: { '1': [{ id: 'ftp_ep_793_1_0', episode: 1 }] } };
  await window.downloadSeriesEpisode(null, 1, 0, staleShow);
  assert.deepEqual(clicked, [
    'https://backend.streamvault.fit/api/download/episode/episode_705463ef9ef62c59c179ff56'
  ]);
});
