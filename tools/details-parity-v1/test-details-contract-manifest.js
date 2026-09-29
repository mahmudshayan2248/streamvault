const path = require("path");
const { buildManifest } = require("./build-details-contract-manifest");
const { validateResponseContract } = require("./details-response-contract");

const fixture = path.join("tools", "details-parity-v1", "expanded-details-fixture.json");

const first = JSON.stringify(buildManifest(fixture), null, 2) + "\n";
const second = JSON.stringify(buildManifest(fixture), null, 2) + "\n";

let bad = 0;
const manifest = JSON.parse(first);
const seen = new Set();

if (first !== second) {
  console.error("MANIFEST_FAIL: manifest is not deterministic");
  bad++;
}

for (const item of manifest) {
  if (!item.key || !item.route || !item.response) {
    console.error("MANIFEST_FAIL missing key/route/response");
    bad++;
    continue;
  }

  if (item.key !== item.route.key) {
    console.error("MANIFEST_FAIL route key mismatch:", item.key);
    bad++;
  }

  if (seen.has(item.key)) {
    console.error("MANIFEST_FAIL duplicate key:", item.key);
    bad++;
  }

  seen.add(item.key);

  const problems = validateResponseContract(item.response, item.key);
  for (const p of problems) {
    console.error("MANIFEST_RESPONSE_CONTRACT_FAIL " + p);
    bad++;
  }

  if (!item.route.fullPath || String(item.route.fullPath).includes(" ")) {
    console.error("MANIFEST_ROUTE_FAIL invalid fullPath:", item.key);
    bad++;
  }
}

const movieCount = manifest.filter(x => x.route.kind === "movie").length;
const seriesCount = manifest.filter(x => x.route.kind === "series").length;

console.log("MANIFEST_ROWS=" + manifest.length);
console.log("MANIFEST_MOVIES=" + movieCount);
console.log("MANIFEST_SERIES=" + seriesCount);
console.log("MANIFEST_BAD=" + bad);

if (manifest.length < 100 || movieCount < 50 || seriesCount < 20 || bad > 0) {
  console.error("DETAILS_CONTRACT_MANIFEST_FAIL");
  process.exit(1);
}

console.log("DETAILS_CONTRACT_MANIFEST_PASS");
