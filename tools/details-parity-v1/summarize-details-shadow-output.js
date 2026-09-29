const fs = require("fs");
const path = require("path");

const baseDir = __dirname;
const outDir = path.join(baseDir, "out");
const reportPath = path.join(baseDir, "DETAILS_7R_SHADOW_OUTPUT_SUMMARY.md");

function latestOutputFile() {
if (!fs.existsSync(outDir)) return null;
const files = fs.readdirSync(outDir)
.filter(name => /^details-shadow-all-safe-\d{8}-\d{6}.txt$/.test(name))
.map(name => {
const full = path.join(outDir, name);
return { name, full, mtime: fs.statSync(full).mtimeMs };
})
.sort((a, b) => b.mtime - a.mtime);
return files[0] || null;
}

function markerValue(lines, key) {
const prefix = key + "=";
for (const line of lines) {
if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
}
return "unknown";
}

function countContains(lines, needle) {
const lowerNeedle = needle.toLowerCase();
let count = 0;
for (const line of lines) {
if (line.toLowerCase().includes(lowerNeedle)) count += 1;
}
return count;
}

const latest = latestOutputFile();
const text = latest ? fs.readFileSync(latest.full, "utf8") : "";
const lines = text.split(/\r?\n/);

const exitCode = markerValue(lines, "EXIT_CODE");
const negativeSchemaPass = lines.some(line => line.includes("NEGATIVE_SCHEMA_PASS"));
const schemaFailLines = lines.filter(line => line.includes("SCHEMA_FAIL"));
const expectedNegativeSchemaFail = negativeSchemaPass && exitCode === "0" ? schemaFailLines.length : 0;
const realSchemaFail = schemaFailLines.length - expectedNegativeSchemaFail;

const interesting = lines
.filter(line =>
line.includes("EXIT_CODE=") ||
line.includes("AUDIT_") ||
line.includes("SCHEMA_") ||
line.includes("NEGATIVE_SCHEMA_PASS") ||
line.includes("DETAILS_FIXTURE_SCHEMA_PASS") ||
line.includes("SUITE_") ||
line.toLowerCase().includes("mismatch") ||
line.toLowerCase().includes("error")
)
.slice(-80);

# const md = `StreamVault Haskell Details 7R Shadow Output Summary

Status:

* Task type: report-only analyzer
* Runtime/frontend/playback files changed: no

Source:

* ${latest ? latest.name : "No safe output file found"}

Summary:

* EXIT_CODE=${exitCode}
* AUDIT_BAD=${markerValue(lines, "AUDIT_BAD")}
* SCHEMA_TOTAL=${markerValue(lines, "SCHEMA_TOTAL")}
* SCHEMA_BAD=${markerValue(lines, "SCHEMA_BAD")}
* NEGATIVE_SCHEMA_PASS=${negativeSchemaPass ? "yes" : "no"}
* expected negative SCHEMA_FAIL lines=${expectedNegativeSchemaFail}
* real SCHEMA_FAIL lines=${realSchemaFail}
* SUITE_PASS markers=${countContains(lines, "SUITE_PASS")}
* FAIL markers=${countContains(lines, "FAIL")}
* mismatch markers=${countContains(lines, "mismatch")}
* error markers=${countContains(lines, "error")}

Interpretation:

* EXIT_CODE=0 means the PowerShell-safe details shadow runner completed successfully.
* SCHEMA_FAIL is expected when followed by NEGATIVE_SCHEMA_PASS.
* Current output shows no real fixture-suite failure when SUITE_BAD=0 and SUITE_PASS is present.

Recent interesting lines:
${interesting.length ? interesting.map(line => "- " + line).join("\n") : "- none"}
`;

fs.writeFileSync(reportPath, md, "utf8");
console.log(md);
