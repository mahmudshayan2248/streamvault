"use strict";

const fs = require("fs");

const fixture = JSON.parse(fs.readFileSync("tools/series-parity-v1/series-contract-fixture.json", "utf8"));

let bad = 0;

if (!fixture || typeof fixture !== "object") bad++;
if (!Array.isArray(fixture.items)) bad++;
if (!fixture.items || fixture.items.length <= 0) bad++;
if (fixture.type) bad++;

for (const item of fixture.items || []) {
if (!item.id) bad++;
if (item.type !== "series") bad++;
if (!item.title) bad++;
if (!("filename" in item)) bad++;
if (!("streamUrl" in item)) bad++;
if (!("sourceIndex" in item)) bad++;
}

console.log("SERIES_SCHEMA_ROWS=" + ((fixture.items || []).length));
console.log("SERIES_SCHEMA_BAD=" + bad);

if (bad) {
console.log("SERIES_SCHEMA_FAIL");
process.exit(1);
}

console.log("SERIES_SCHEMA_PASS");
