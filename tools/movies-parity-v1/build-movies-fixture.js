"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = process.cwd();
const catalogPath = path.join(root, "catalog.json");
const outPath = path.join(root, "tools/movies-parity-v1/movies-contract-fixture.json");

function sha1(value) {
return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 16);
}

function normalizeMovie(movie, index) {
const title = movie.title ? String(movie.title) : "";
const filename = movie.filename ? String(movie.filename) : "";
const streamUrl = movie.streamUrl ? String(movie.streamUrl) : "";

const id = sha1(`${title}|${filename}|${streamUrl}|${index}`);

return {
id,
type: "movie",
title,
filename,
year: movie.year ? String(movie.year) : null,
category: movie.category ? String(movie.category) : null,
server: movie.server ? String(movie.server) : null,
streamUrl,
sourceIndex: index
};
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const movies = Array.isArray(catalog.movies) ? catalog.movies : [];

const items = movies
.map(normalizeMovie)
.filter(item => item.title && item.filename && item.streamUrl)
.slice(0, 120);

const fixture = {
generatedAt: new Date().toISOString(),
catalogMovieTotal: movies.length,
rows: items.length,
items
};

fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));

console.log(`MOVIES_CATALOG_TOTAL=${movies.length}`);
console.log(`MOVIES_FIXTURE_ROWS=${items.length}`);

if (items.length === 0) {
console.log("MOVIES_FIXTURE_EMPTY");
process.exit(1);
}

console.log("MOVIES_FIXTURE_BUILD_PASS");
