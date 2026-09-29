const fs = require("fs");

const fixturePath = "tools/details-parity-v1/expanded-details-fixture.json";
const cachePath = "poster-cache.json";
const reportPath = "tools/details-parity-v1/DETAILS_7Y_FIXTURE_METADATA_ENRICHER.md";

function readJson(file, fallbackValue) {
if (!fs.existsSync(file)) return fallbackValue;
return JSON.parse(fs.readFileSync(file, "utf8"));
}

function hasValue(value) {
if (Array.isArray(value)) return value.length > 0;
if (typeof value === "number") return true;
if (typeof value === "string") return value.trim().length > 0;
return value !== null && value !== undefined;
}

const rawFixture = readJson(fixturePath, []);
const cache = readJson(cachePath, {});
const rows = Array.isArray(rawFixture) ? rawFixture : [];
const fields = ["genre", "runtime", "language", "director", "productionCompanies"];

const countsBefore = {};
for (const field of fields) {
countsBefore[field] = rows.filter(row => hasValue(row[field])).length;
}

const lines = [];
lines.push("StreamVault Haskell Details 7Y Fixture Metadata Enricher");
lines.push("============================================================");
lines.push("");
lines.push("Status:");
lines.push("- Task type: controlled fixture enrichment tool scaffold");
lines.push("- Runtime/frontend/playback files changed: no");
lines.push("");
lines.push("Fixture rows:");
lines.push("- " + rows.length);
lines.push("");
lines.push("Poster cache entries:");
lines.push("- " + Object.keys(cache).length);
lines.push("");
lines.push("Current missing-field coverage:");
for (const field of fields) {
lines.push("- " + field + ": " + countsBefore[field] + "/" + rows.length);
}
lines.push("");
lines.push("Next step:");
lines.push("- Improve matching strategy before mutating expanded-details-fixture.json.");

fs.writeFileSync(reportPath, lines.join("\n") + "\n", "utf8");
console.log(lines.join("\n"));
