"use strict";

const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "tools/movies-parity-v1/movies-contract-fixture.json");
const fixture = JSON.parse(fs.readFileSync(file, "utf8"));

let bad = 0;

if (!fixture || typeof fixture !== "object") bad++;
if (!Array.isArray(fixture.items)) bad++;
if (!fixture.items.length) bad++;

for (const item of fixture.items || []) {
if (!item.id) bad++;
if (item.type !== "movie") bad++;
if (!item.title) bad++;
if (!item.filename) bad++;
if (!item.streamUrl) bad++;
if (!("year" in item)) bad++;
if (!("category" in item)) bad++;
if (!("server" in item)) bad++;
}

console.log(`MOVIES_SCHEMA_ROWS=${fixture.items ? fixture.items.length : 0}`);
console.log(`MOVIES_SCHEMA_BAD=${bad}`);

if (bad) {
console.log("MOVIES_SCHEMA_FAIL");
process.exit(1);
}

console.log("MOVIES_SCHEMA_PASS");
