const fs = require("fs");
const path = require("path");

const FIXTURES = [
  path.join(__dirname, "out", "haskell-details-fixtures.json"),
  path.join(__dirname, "expanded-details-fixture.json"),
];

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function rowsOf(json) {
  if (!json) return [];
  if (Array.isArray(json.rows)) return json.rows;
  if (Array.isArray(json.results)) return json.results;
  if (Array.isArray(json)) return json;
  return [];
}

function normType(type) {
  const t = String(type || "").toLowerCase();
  if (t === "tv" || t === "series" || t === "show") return "tv";
  return "movie";
}

function titleOf(row) {
  const req = row.request || {};
  const data = row.response || row.data || {};
  return (
    req.title ||
    req.name ||
    row.title ||
    row.name ||
    data.title ||
    data.name ||
    ""
  ).trim();
}

function yearOf(row) {
  const req = row.request || {};
  const data = row.response || row.data || {};
  return String(req.year || row.year || data.year || "").trim();
}

function responseOf(row) {
  return row.response || row.data || {};
}

function keyOf(row) {
  const req = row.request || {};
  return `${normType(req.type || row.type)}:${titleOf(row).toLowerCase()}:${yearOf(row)}`;
}

let total = 0;
let bad = 0;
let duplicate = 0;
const seen = new Map();

for (const file of FIXTURES) {
  const json = readJson(file);
  const rows = rowsOf(json);

  console.log(`\nFixture: ${path.relative(process.cwd(), file)}`);
  console.log(`Rows: ${rows.length}`);

  rows.forEach((row, i) => {
    total++;

    const title = titleOf(row);
    const resp = responseOf(row);
    const key = keyOf(row);

    if (!title) {
      console.error(`BAD missing title row=${i}`);
      bad++;
    }

    if (!resp || typeof resp !== "object") {
      console.error(`BAD missing response row=${i} title=${title}`);
      bad++;
    }

    if (resp && resp.ok === false) {
      console.error(`BAD response ok=false row=${i} title=${title}`);
      bad++;
    }

    if (seen.has(key)) {
      console.warn(`DUP ${key}`);
      duplicate++;
    } else {
      seen.set(key, file);
    }
  });
}

console.log(`\nAUDIT_TOTAL=${total}`);
console.log(`AUDIT_BAD=${bad}`);
console.log(`AUDIT_DUPLICATE=${duplicate}`);

if (total < 100) {
  console.error("AUDIT_FAIL: expected at least 100 fixture rows");
  process.exit(1);
}

if (bad > 0) {
  console.error("AUDIT_FAIL: bad fixture rows found");
  process.exit(1);
}

console.log("DETAILS_FIXTURE_AUDIT_PASS");