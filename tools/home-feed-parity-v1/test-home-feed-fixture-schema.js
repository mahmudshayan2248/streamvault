"use strict";

const fs = require("fs");

const fixture = JSON.parse(fs.readFileSync("tools/home-feed-parity-v1/home-feed-contract-fixture.json", "utf8"));

let bad = 0;

if (!fixture || typeof fixture !== "object") bad++;
if (!Array.isArray(fixture.sections)) bad++;
if (!fixture.sections || fixture.sections.length <= 0) bad++;

for (const section of fixture.sections || []) {
if (!section.id) bad++;
if (!section.title) bad++;
if (!section.type) bad++;
if (!Array.isArray(section.items)) bad++;
if (!section.items || section.items.length <= 0) bad++;

for (const item of section.items || []) {
if (!item.id) bad++;
if (!item.type) bad++;
if (!item.title) bad++;
if (!("filename" in item)) bad++;
if (!("streamUrl" in item)) bad++;
}
}

console.log("HOME_FEED_SCHEMA_SECTIONS=" + ((fixture.sections || []).length));
console.log("HOME_FEED_SCHEMA_BAD=" + bad);

if (bad) {
console.log("HOME_FEED_SCHEMA_FAIL");
process.exit(1);
}

console.log("HOME_FEED_SCHEMA_PASS");
