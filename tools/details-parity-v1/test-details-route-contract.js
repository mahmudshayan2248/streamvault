const fs = require("fs");
const path = require("path");

const fixture = path.join("tools", "details-parity-v1", "expanded-details-fixture.json");
const rows = JSON.parse(fs.readFileSync(fixture, "utf8"));

let bad = 0;
const seen = new Set();

function clean(v){ return String(v ?? "").trim(); }

function routeKind(type){
  const t = clean(type).toLowerCase();
  if (t === "movie") return "movie";
  if (t === "tv" || t === "series") return "series";
  return "";
}

function buildRoute(row){
  const title = clean(row.title || row.name);
  const kind = routeKind(row.type);
  const encodedTitle = encodeURIComponent(title);
  return {
    key: clean(row.key),
    kind,
    title,
    path: `/api/details/${kind}/${encodedTitle}`,
    query: `title=${encodedTitle}`,
    fullPath: `/api/details/${kind}/${encodedTitle}?title=${encodedTitle}`
  };
}

for (const row of rows) {
  const r = buildRoute(row);

  if (!r.key || !r.kind || !r.title) {
    console.error("ROUTE_CONTRACT_FAIL missing key/kind/title:", row.key);
    bad++;
    continue;
  }

  if (r.fullPath.includes(" ")) {
    console.error("ROUTE_CONTRACT_FAIL raw space in route:", r.fullPath);
    bad++;
  }

  if (!r.fullPath.startsWith(`/api/details/${r.kind}/`)) {
    console.error("ROUTE_CONTRACT_FAIL invalid prefix:", r.fullPath);
    bad++;
  }

  if (seen.has(r.fullPath)) {
    console.error("ROUTE_CONTRACT_FAIL duplicate route:", r.fullPath);
    bad++;
  }

  seen.add(r.fullPath);
}

const movieRoutes = rows.filter(r => routeKind(r.type) === "movie").length;
const seriesRoutes = rows.filter(r => routeKind(r.type) === "series").length;

console.log("ROUTE_CONTRACT_ROWS=" + rows.length);
console.log("ROUTE_CONTRACT_MOVIES=" + movieRoutes);
console.log("ROUTE_CONTRACT_SERIES=" + seriesRoutes);
console.log("ROUTE_CONTRACT_BAD=" + bad);

if (rows.length < 100 || movieRoutes < 50 || seriesRoutes < 20 || bad > 0) {
  console.error("DETAILS_ROUTE_CONTRACT_FAIL");
  process.exit(1);
}

console.log("DETAILS_ROUTE_CONTRACT_PASS");
