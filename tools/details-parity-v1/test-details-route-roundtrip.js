const path = require("path");
const { buildRouteSnapshot } = require("./build-details-route-snapshot");

const fixture = path.join("tools", "details-parity-v1", "expanded-details-fixture.json");
const routes = buildRouteSnapshot(fixture);

let bad = 0;

function titleFromPath(route) {
  const prefix = `/api/details/${route.kind}/`;
  if (!route.path.startsWith(prefix)) return "";
  return decodeURIComponent(route.path.slice(prefix.length));
}

function titleFromQuery(route) {
  const q = String(route.query || "");
  const params = new URLSearchParams(q);
  return params.get("title") || "";
}

for (const route of routes) {
  const pathTitle = titleFromPath(route);
  const queryTitle = titleFromQuery(route);

  if (pathTitle !== route.title) {
    console.error("ROUTE_ROUNDTRIP_FAIL path title mismatch:", route.key);
    bad++;
  }

  if (queryTitle !== route.title) {
    console.error("ROUTE_ROUNDTRIP_FAIL query title mismatch:", route.key);
    bad++;
  }

  if (route.fullPath !== `${route.path}?${route.query}`) {
    console.error("ROUTE_ROUNDTRIP_FAIL fullPath mismatch:", route.key);
    bad++;
  }
}

console.log("ROUTE_ROUNDTRIP_ROWS=" + routes.length);
console.log("ROUTE_ROUNDTRIP_BAD=" + bad);

if (routes.length < 100 || bad > 0) {
  console.error("DETAILS_ROUTE_ROUNDTRIP_FAIL");
  process.exit(1);
}

console.log("DETAILS_ROUTE_ROUNDTRIP_PASS");
