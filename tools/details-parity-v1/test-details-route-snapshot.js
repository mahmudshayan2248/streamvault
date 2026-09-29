const path = require("path");
const { buildRouteSnapshot } = require("./build-details-route-snapshot");

const fixture = path.join("tools", "details-parity-v1", "expanded-details-fixture.json");

const first = JSON.stringify(buildRouteSnapshot(fixture), null, 2) + "\n";
const second = JSON.stringify(buildRouteSnapshot(fixture), null, 2) + "\n";

let bad = 0;
const seen = new Set();

if (first !== second) {
  console.error("ROUTE_SNAPSHOT_FAIL: route snapshot is not deterministic");
  bad++;
}

const snapshot = JSON.parse(first);

for (const r of snapshot) {
  if (!r.key || !r.kind || !r.title || !r.path || !r.query || !r.fullPath) {
    console.error("ROUTE_SNAPSHOT_FAIL missing field:", JSON.stringify(r));
    bad++;
  }

  if (!["movie", "series"].includes(r.kind)) {
    console.error("ROUTE_SNAPSHOT_FAIL invalid kind:", r.kind);
    bad++;
  }

  if (String(r.fullPath).includes(" ")) {
    console.error("ROUTE_SNAPSHOT_FAIL raw space:", r.fullPath);
    bad++;
  }

  if (seen.has(r.fullPath)) {
    console.error("ROUTE_SNAPSHOT_FAIL duplicate:", r.fullPath);
    bad++;
  }

  seen.add(r.fullPath);
}

console.log("ROUTE_SNAPSHOT_ROWS=" + snapshot.length);
console.log("ROUTE_SNAPSHOT_BAD=" + bad);

if (snapshot.length < 100 || bad > 0) {
  console.error("DETAILS_ROUTE_SNAPSHOT_FAIL");
  process.exit(1);
}

console.log("DETAILS_ROUTE_SNAPSHOT_PASS");
