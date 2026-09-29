const fs = require("fs");
const path = require("path");

const defaultFixtureFiles = [
  path.join("tools", "details-parity-v1", "out", "haskell-details-fixtures.json"),
  path.join("tools", "details-parity-v1", "expanded-details-fixture.json")
];

const fixtureFiles = process.argv.slice(2).length ? process.argv.slice(2) : defaultFixtureFiles;

const allowedTypes = new Set(["movie", "tv", "series"]);
const allowedStatus = new Set(["hit", "miss"]);

let total = 0;
let bad = 0;
const problems = [];

function isString(v){ return typeof v === "string"; }
function hasText(v){ return isString(v) && v.trim().length > 0; }

for (const file of fixtureFiles) {
  if (!fs.existsSync(file)) continue;

  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(rows)) {
    bad++;
    problems.push(file + ": fixture root must be an array");
    continue;
  }

  rows.forEach((r, i) => {
    total++;
    const prefix = file + "[" + i + "]";

    if (!r || typeof r !== "object" || Array.isArray(r)) {
      bad++; problems.push(prefix + ": row must be object"); return;
    }

    const title = r.title || r.name;

    const checks = [
      ["key", hasText(r.key)],
      ["status", hasText(r.status) && allowedStatus.has(r.status)],
      ["type", hasText(r.type) && allowedTypes.has(r.type)],
      ["title/name", hasText(title)]
    ];

    for (const [field, ok] of checks) {
      if (!ok) {
        bad++;
        problems.push(prefix + ": invalid " + field);
      }
    }

    if (r.status === "hit") {
      if (!hasText(r.year)) {
        bad++;
        problems.push(prefix + ": hit row missing year");
      }
      if ("poster" in r && !isString(r.poster)) {
        bad++;
        problems.push(prefix + ": poster must be string");
      }
      if ("backdrop" in r && !isString(r.backdrop)) {
        bad++;
        problems.push(prefix + ": backdrop must be string");
      }
      if ("overview" in r && !isString(r.overview)) {
        bad++;
        problems.push(prefix + ": overview must be string");
      }
    }
  });
}

console.log("SCHEMA_TOTAL=" + total);
console.log("SCHEMA_BAD=" + bad);

if (problems.length) console.error(problems.slice(0, 25).join("\n"));

if (total < 100 && fixtureFiles.length === defaultFixtureFiles.length) {
  console.error("SCHEMA_FAIL: expected at least 100 rows");
  process.exit(1);
}

if (bad > 0) {
  console.error("SCHEMA_FAIL: invalid fixture schema");
  process.exit(1);
}

console.log("DETAILS_FIXTURE_SCHEMA_PASS");
