const fs = require("fs");
const path = require("path");

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

function buildRouteSnapshot(fixtureFile){
  const rows = JSON.parse(fs.readFileSync(fixtureFile, "utf8"));
  return rows.map(buildRoute);
}

module.exports = { buildRoute, buildRouteSnapshot };

if (require.main === module) {
  const fixture = process.argv[2] || path.join("tools", "details-parity-v1", "expanded-details-fixture.json");
  const outDir = path.join("tools", "details-parity-v1", "out");
  const outFile = path.join(outDir, "details-route-snapshot.json");
  const snapshot = buildRouteSnapshot(fixture);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2) + "\n");

  console.log("DETAILS_ROUTE_SNAPSHOT_ROWS=" + snapshot.length);
  console.log("DETAILS_ROUTE_SNAPSHOT_FILE=" + outFile);
}
