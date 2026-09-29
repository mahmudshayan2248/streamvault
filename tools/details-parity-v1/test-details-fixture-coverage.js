const fs = require("fs");
const path = require("path");

const fixture = process.argv[2] || path.join("tools", "details-parity-v1", "expanded-details-fixture.json");
const rows = JSON.parse(fs.readFileSync(fixture, "utf8"));

const requiredFields = ["key","status","type","title","name","year","rating","genre","runtime","language","poster","backdrop","overview","streamUrl"];

let bad = 0;

for (const field of requiredFields) {
  const missing = rows.filter(r => !(field in r)).length;
  if (missing) {
    bad++;
    console.error(`COVERAGE_FAIL: ${missing} rows missing field ${field}`);
  }
}

const movieCount = rows.filter(r => r.type === "movie").length;
const tvCount = rows.filter(r => r.type === "tv" || r.type === "series").length;
const posterCount = rows.filter(r => String(r.poster || "").trim()).length;
const overviewCount = rows.filter(r => String(r.overview || "").trim()).length;

console.log("COVERAGE_ROWS=" + rows.length);
console.log("COVERAGE_MOVIES=" + movieCount);
console.log("COVERAGE_TV=" + tvCount);
console.log("COVERAGE_POSTERS=" + posterCount);
console.log("COVERAGE_OVERVIEWS=" + overviewCount);

if (rows.length < 100) bad++;
if (movieCount < 50) bad++;
if (tvCount < 20) bad++;
if (posterCount < 20) bad++;
if (overviewCount < 20) bad++;

if (bad) {
  console.error("DETAILS_FIXTURE_COVERAGE_FAIL");
  process.exit(1);
}

console.log("DETAILS_FIXTURE_COVERAGE_PASS");
