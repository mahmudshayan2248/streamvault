const fs = require("fs");
const path = require("path");

const fixture = path.join("tools", "details-parity-v1", "expanded-details-fixture.json");
const rows = JSON.parse(fs.readFileSync(fixture, "utf8"));

let bad = 0;
let checked = 0;

function clean(v){ return String(v ?? "").trim(); }

for (const r of rows) {
  checked++;

  const response = {
    ok: true,
    status: r.status,
    type: r.type,
    title: clean(r.title || r.name),
    name: clean(r.name || r.title),
    year: clean(r.year),
    rating: clean(r.rating),
    genre: clean(r.genre),
    runtime: clean(r.runtime),
    language: clean(r.language),
    poster: clean(r.poster),
    backdrop: clean(r.backdrop),
    overview: clean(r.overview),
    streamUrl: clean(r.streamUrl)
  };

  const required = ["ok","status","type","title","name","year","poster","overview","streamUrl"];

  for (const k of required) {
    if (!(k in response)) {
      console.error("RESPONSE_PARITY_FAIL missing field:", k, r.key);
      bad++;
    }
  }

  if (response.status === "hit" && !response.title) {
    console.error("RESPONSE_PARITY_FAIL empty title:", r.key);
    bad++;
  }

  if (response.status === "hit" && !response.year) {
    console.error("RESPONSE_PARITY_FAIL empty year:", r.key);
    bad++;
  }
}

console.log("RESPONSE_PARITY_ROWS=" + checked);
console.log("RESPONSE_PARITY_BAD=" + bad);

if (checked < 100 || bad > 0) {
  console.error("DETAILS_RESPONSE_PARITY_FAIL");
  process.exit(1);
}

console.log("DETAILS_RESPONSE_PARITY_PASS");
