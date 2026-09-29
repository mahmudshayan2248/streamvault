const fs = require("fs");
const path = require("path");

const fixturePath = path.join(__dirname, "expanded-details-fixture.json");
const outDir = path.join(__dirname, "out");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(outDir, `details-7l-fixture-gap-audit-${stamp}.tsv`);

if (!fs.existsSync(fixturePath)) {
  console.error(`Missing fixture: ${fixturePath}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const rows = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const fields = [
  "poster",
  "backdrop",
  "overview",
  "rating",
  "genre",
  "runtime",
  "language",
  "director",
  "productionCompanies"
];

const stats = Object.fromEntries(fields.map(f => [f, 0]));
const gaps = [];

function hasValue(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && String(v).trim() !== "";
}

for (const row of rows) {
  const missing = fields.filter(f => !hasValue(row[f]));
  for (const f of missing) stats[f]++;
  if (missing.length) {
    gaps.push({
      key: row.key || "",
      type: row.type || "",
      title: row.title || row.name || "",
      year: row.year || "",
      missing: missing.join(",")
    });
  }
}

const lines = [
  ["key", "type", "title", "year", "missing"].join("\t"),
  ...gaps.map(g => [g.key, g.type, g.title, g.year, g.missing].map(v => String(v).replace(/\t/g, " ")).join("\t"))
];

fs.writeFileSync(reportPath, lines.join("\n"), "utf8");

console.log(`GAP_ROWS=${rows.length}`);
for (const f of fields) console.log(`GAP_MISSING_${f.toUpperCase()}=${stats[f]}`);
console.log(`GAP_ITEMS_WITH_ANY_MISSING=${gaps.length}`);
console.log(`GAP_REPORT=${reportPath}`);
console.log("DETAILS_FIXTURE_GAP_AUDIT_PASS");
