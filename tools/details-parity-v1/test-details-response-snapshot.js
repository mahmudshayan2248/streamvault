const path = require("path");
const { buildSnapshot } = require("./build-details-response-snapshot");
const { validateResponseContract } = require("./details-response-contract");

const fixture = path.join("tools", "details-parity-v1", "expanded-details-fixture.json");

const first = JSON.stringify(buildSnapshot(fixture), null, 2) + "\n";
const second = JSON.stringify(buildSnapshot(fixture), null, 2) + "\n";

let bad = 0;

if (first !== second) {
  console.error("RESPONSE_SNAPSHOT_FAIL: snapshot output is not deterministic");
  bad++;
}

const snapshot = JSON.parse(first);

for (const item of snapshot) {
  if (!item.key || !item.response) {
    console.error("RESPONSE_SNAPSHOT_FAIL: invalid snapshot item");
    bad++;
    continue;
  }

  const problems = validateResponseContract(item.response, item.key);
  for (const p of problems) {
    console.error("RESPONSE_SNAPSHOT_CONTRACT_FAIL " + p);
    bad++;
  }
}

console.log("RESPONSE_SNAPSHOT_ROWS=" + snapshot.length);
console.log("RESPONSE_SNAPSHOT_BAD=" + bad);

if (snapshot.length < 100 || bad > 0) {
  console.error("DETAILS_RESPONSE_SNAPSHOT_FAIL");
  process.exit(1);
}

console.log("DETAILS_RESPONSE_SNAPSHOT_PASS");
