const fs = require("fs");
const path = require("path");
const { buildRouteSnapshot } = require("./build-details-route-snapshot");
const { buildSnapshot } = require("./build-details-response-snapshot");

function buildManifest(fixtureFile) {
  const routes = buildRouteSnapshot(fixtureFile);
  const responses = buildSnapshot(fixtureFile);
  const responseByKey = new Map(responses.map(r => [r.key, r.response]));

  return routes.map(route => ({
    key: route.key,
    route,
    response: responseByKey.get(route.key) || null
  }));
}

module.exports = { buildManifest };

if (require.main === module) {
  const fixture = process.argv[2] || path.join("tools", "details-parity-v1", "expanded-details-fixture.json");
  const outDir = path.join("tools", "details-parity-v1", "out");
  const outFile = path.join(outDir, "details-contract-manifest.json");

  const manifest = buildManifest(fixture);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + "\n");

  console.log("DETAILS_CONTRACT_MANIFEST_ROWS=" + manifest.length);
  console.log("DETAILS_CONTRACT_MANIFEST_FILE=" + outFile);
}
