const fs = require("fs");
const path = require("path");

const root = process.cwd();
const catalogPath = path.join(root, "catalog.json");
const outDir = path.join(root, "tools", "details-parity-v1");
const outFile = path.join(outDir, "expanded-details-fixture.json");

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const movies = Array.isArray(catalog.movies) ? catalog.movies : [];
const series = Array.isArray(catalog.series) ? catalog.series : [];

function clean(v){ return String(v || "").trim(); }

function row(item, type){
  const title = clean(item.title || item.name);
  const year = clean(item.year);
  return {
    key: `${type}:${title}:${year}`,
    status: "hit",
    type,
    title,
    name: title,
    year,
    rating: clean(item.rating),
    genre: clean(item.genre),
    runtime: clean(item.runtime),
    language: clean(item.language),
    poster: clean(item.poster),
    backdrop: clean(item.backdrop),
    overview: clean(item.overview),
    streamUrl: clean(item.streamUrl)
  };
}

function takeRows(items, type, limit){
  const rows = [];
  const seen = new Set();
  for (const item of items) {
    const r = row(item, type);
    if (!r.title || r.title.length < 2) continue;
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    rows.push(r);
    if (rows.length >= limit) break;
  }
  return rows;
}

const rows = [
  ...takeRows(movies, "movie", 80),
  ...takeRows(series, "tv", 40)
];

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(rows, null, 2) + "\n");
console.log("WROTE", outFile, rows.length);
