"use strict";

const fs = require("fs");
const crypto = require("crypto");

function sha1(value) {
return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 16);
}

function asArray(value) {
return Array.isArray(value) ? value : [];
}

function text(value) {
return value == null ? "" : String(value);
}

function normalizeMedia(item, type, index) {
const title = text(item.title || item.name || item.filename || item.path || "Untitled");
const filename = text(item.filename || item.file || item.path || "");
const streamUrl = text(item.streamUrl || item.url || item.href || item.link || "");

return {
id: sha1([type, title, filename, streamUrl, index].join("|")),
type,
title,
filename,
streamUrl,
year: item.year ? String(item.year) : null,
category: item.category ? String(item.category) : null,
server: item.server ? String(item.server) : null,
sourceIndex: index
};
}

function keepVisible(item) {
return item.title && item.title !== "Untitled";
}

function takeRows(items, limit) {
return items.filter(keepVisible).slice(0, limit);
}

function fallbackRows(primary, fallback, limit) {
const rows = takeRows(primary, limit);
return rows.length ? rows : takeRows(fallback, limit);
}

const catalog = JSON.parse(fs.readFileSync("catalog.json", "utf8"));

const movies = asArray(catalog.movies).map((item, index) => normalizeMedia(item, "movie", index));
const series = asArray(catalog.series).map((item, index) => normalizeMedia(item, "series", index));

const movieRows = takeRows(movies, 24);
const seriesRows = fallbackRows(series, movies, 24);

const netflixRows = fallbackRows(
movies.filter(item => /netflix/i.test([item.category, item.title, item.filename].join(" "))),
movies,
24
);

const trendingRows = fallbackRows(movies, movies, 24);
const newRows = fallbackRows(movies.slice().reverse(), movies, 24);

const sections = [
{ id: "netflix-originals", title: "Netflix Originals", type: "movie", items: netflixRows },
{ id: "trending-now", title: "🔥 Trending Now", type: "movie", items: trendingRows },
{ id: "series", title: "Series", type: "series", items: seriesRows },
{ id: "new-to-streamvault", title: "New to StreamVault", type: "movie", items: newRows },
{ id: "all-movies", title: "All Movies", type: "movie", items: movieRows }
];

const fixture = {
generatedAt: new Date().toISOString(),
catalogMovieTotal: movies.length,
catalogSeriesTotal: series.length,
sectionCount: sections.length,
sections
};

fs.writeFileSync(
"tools/home-feed-parity-v1/home-feed-contract-fixture.json",
JSON.stringify(fixture, null, 2)
);

console.log("HOME_FEED_MOVIE_TOTAL=" + movies.length);
console.log("HOME_FEED_SERIES_TOTAL=" + series.length);
console.log("HOME_FEED_SECTION_COUNT=" + sections.length);

for (const section of sections) {
console.log("HOME_FEED_SECTION=" + section.id + " ROWS=" + section.items.length);
}

if (sections.length <= 0 || sections.some(section => !section.items.length)) {
console.log("HOME_FEED_FIXTURE_FAIL");
process.exit(1);
}

console.log("HOME_FEED_FIXTURE_BUILD_PASS");
