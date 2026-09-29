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

function normalizeSeries(item, index) {
const title = text(item.title || item.name || item.seriesTitle || item.filename || item.path || "Untitled Series");
const filename = text(item.filename || item.file || item.path || "");
const streamUrl = text(item.streamUrl || item.url || item.href || item.link || "");

return {
id: sha1(["series", title, filename, streamUrl, index].join("|")),
type: "series",
title,
filename,
streamUrl,
year: item.year ? String(item.year) : null,
category: item.category ? String(item.category) : null,
server: item.server ? String(item.server) : null,
season: item.season ? String(item.season) : null,
episode: item.episode ? String(item.episode) : null,
sourceIndex: index
};
}

function keepVisible(item) {
return item.title && item.title !== "Untitled Series";
}

const catalog = JSON.parse(fs.readFileSync("catalog.json", "utf8"));
const rawSeries = asArray(catalog.series);
const series = rawSeries.map(normalizeSeries).filter(keepVisible);
const fixtureRows = series.slice(0, 120);

const fixture = {
generatedAt: new Date().toISOString(),
catalogSeriesTotal: rawSeries.length,
fixtureSeriesTotal: fixtureRows.length,
page: 0,
limit: 120,
items: fixtureRows
};

fs.writeFileSync(
"tools/series-parity-v1/series-contract-fixture.json",
JSON.stringify(fixture, null, 2)
);

console.log("SERIES_CATALOG_TOTAL=" + rawSeries.length);
console.log("SERIES_FIXTURE_ROWS=" + fixtureRows.length);
console.log("SERIES_FIRST_TITLE=" + (fixtureRows[0] ? fixtureRows[0].title : ""));

if (rawSeries.length <= 0 || fixtureRows.length <= 0) {
console.log("SERIES_FIXTURE_FAIL");
process.exit(1);
}

console.log("SERIES_FIXTURE_BUILD_PASS");
