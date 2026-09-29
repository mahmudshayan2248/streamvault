const fs = require("fs");
const path = require("path");

const fixtureFiles = [
  path.join("tools", "details-parity-v1", "out", "haskell-details-fixtures.json"),
  path.join("tools", "details-parity-v1", "expanded-details-fixture.json")
];

let rows = [];
for (const file of fixtureFiles) {
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Array.isArray(data)) rows.push(...data);
}

const bad = rows.filter(r => !r || !(r.title || r.name) || !r.type);
const dupes = new Set();
let duplicateCount = 0;

for (const r of rows) {
  const key = r.key || `${r.type}:${r.title || r.name}:${r.year || ""}`;
  if (dupes.has(key)) duplicateCount++;
  dupes.add(key);
}

console.log("SUITE_ROWS=" + rows.length);
console.log("SUITE_BAD=" + bad.length);
console.log("SUITE_DUPLICATE=" + duplicateCount);

if (rows.length < 100) {
  console.error("SUITE_FAIL: expected at least 100 fixture rows");
  process.exit(1);
}
if (bad.length) {
  console.error("SUITE_FAIL: bad fixture rows found");
  process.exit(1);
}

console.log("SUITE_PASS");
