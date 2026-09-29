const fs = require("fs");
const path = require("path");

function clean(v){ return String(v ?? "").trim(); }

function buildDetailsResponse(r){
  return {
    ok: r.status === "hit",
    status: clean(r.status),
    type: clean(r.type),
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
}

function loadFixture(file){
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function buildSnapshot(fixtureFile){
  const rows = loadFixture(fixtureFile);
  return rows.map(row => ({
    key: row.key,
    response: buildDetailsResponse(row)
  }));
}

module.exports = { buildDetailsResponse, buildSnapshot };

if (require.main === module) {
  const fixture = process.argv[2] || path.join("tools", "details-parity-v1", "expanded-details-fixture.json");
  const outDir = path.join("tools", "details-parity-v1", "out");
  const outFile = path.join(outDir, "details-response-snapshot.json");

  const snapshot = buildSnapshot(fixture);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2) + "\n");

  console.log("DETAILS_RESPONSE_SNAPSHOT_ROWS=" + snapshot.length);
  console.log("DETAILS_RESPONSE_SNAPSHOT_FILE=" + outFile);
}
