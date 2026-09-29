const { spawnSync } = require("child_process");

const run = spawnSync(process.execPath, ["tools/details-parity-v1/audit-details-fixture-gaps.js"], {
  encoding: "utf8"
});

const text = `${run.stdout || ""}\n${run.stderr || ""}`;

if (run.status !== 0) {
  console.error(text);
  process.exit(run.status || 1);
}

const wanted = [
  "GAP_ROWS",
  "GAP_MISSING_POSTER",
  "GAP_MISSING_BACKDROP",
  "GAP_MISSING_OVERVIEW",
  "GAP_MISSING_RATING",
  "GAP_MISSING_GENRE",
  "GAP_MISSING_RUNTIME",
  "GAP_MISSING_LANGUAGE",
  "GAP_MISSING_DIRECTOR",
  "GAP_MISSING_PRODUCTIONCOMPANIES",
  "GAP_ITEMS_WITH_ANY_MISSING"
];

const values = {};
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && wanted.includes(m[1])) values[m[1]] = m[2];
}

const partial = [
  ["poster", Number(values.GAP_MISSING_POSTER || 0)],
  ["overview", Number(values.GAP_MISSING_OVERVIEW || 0)],
  ["backdrop", Number(values.GAP_MISSING_BACKDROP || 0)],
  ["rating", Number(values.GAP_MISSING_RATING || 0)]
].sort((a, b) => a[1] - b[1]);

const full = [
  "genre",
  "runtime",
  "language",
  "director",
  "productionCompanies"
];

console.log(`PRIORITY_ROWS=${values.GAP_ROWS || "0"}`);
for (const [name, count] of partial) {
  console.log(`PRIORITY_PARTIAL_${name.toUpperCase()}=${count}`);
}
console.log(`PRIORITY_NEXT_FIELD=${partial[0][0]}`);
console.log(`PRIORITY_FULL_MISSING_FIELDS=${full.join(",")}`);
console.log("DETAILS_GAP_PRIORITY_REPORT_PASS");
