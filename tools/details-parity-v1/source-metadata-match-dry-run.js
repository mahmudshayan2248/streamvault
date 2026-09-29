const fs = require("fs");
const path = require("path");

console.log("RUNNING_SOURCE_METADATA_MATCHER");

const dir = __dirname;
const root = path.resolve(dir, "..", "..");
const fixturePath = path.join(dir, "expanded-details-fixture.json");
const reportPath = path.join(dir, "source-metadata-match-report.json");
const summaryPath = path.join(dir, "source-metadata-match-summary.txt");

function readJson(p) {
try {
if (!fs.existsSync(p)) return null;
return JSON.parse(fs.readFileSync(p, "utf8"));
} catch {
return null;
}
}

function rowsOf(data) {
if (Array.isArray(data)) return data;
if (data && Array.isArray(data.rows)) return data.rows;
if (data && Array.isArray(data.fixtures)) return data.fixtures;
if (data && Array.isArray(data.movies)) return data.movies;
if (data && Array.isArray(data.series)) return data.series;
if (data && typeof data === "object") return Object.values(data).filter(x => x && typeof x === "object");
return [];
}

function norm(v) {
return String(v || "")
.toLowerCase()
.replace(/https?://\S+/g, " ")
.replace(/[._/\()[]{}+-]/g, " ")
.replace(/\b(480p|720p|1080p|2160p|4k|bluray|webrip|webdl|web-dl|x264|x265|h264|h265|hevc|aac|ac3|rarbg|yts|galaxyrg|msmod|hdhub|nf|amzn|dual|audio|esub|msubs)\b/g, " ")
.replace(/\b(19\d\d|20[0-3]\d)\b/g, " ")
.replace(/\s+/g, " ")
.trim();
}

function collect(v, out) {
if (!v) return out;
if (typeof v === "string") {
out.push(v);
return out;
}
if (Array.isArray(v)) {
for (let i = 0; i < Math.min(v.length, 30); i++) collect(v[i], out);
return out;
}
if (typeof v === "object") {
const keys = Object.keys(v);
for (const k of keys) {
if (/title|name|file|path|url|poster|backdrop|overview|year|genre/i.test(k)) collect(v[k], out);
}
}
return out;
}

function useful(item) {
if (!item || typeof item !== "object") return 0;
let score = 0;
if (item.poster) score += 3;
if (item.backdrop) score += 2;
if (item.overview) score += 2;
if (item.rating || item.vote_average) score += 1;
if (item.genre || item.genres) score += 1;
return score;
}

const fixtureRows = rowsOf(readJson(fixturePath));
const sourceFiles = ["catalog.json", "poster-cache.json", "popular-titles-cache.json", "episode-title-cache.json"];
const candidates = [];

for (const file of sourceFiles) {
const data = readJson(path.join(root, file));
const rows = rowsOf(data);
for (const item of rows) {
candidates.push({
file,
item,
useful: useful(item),
keys: collect(item, []).map(norm).filter(x => x.length >= 3)
});
}
}

const matches = [];

for (let i = 0; i < fixtureRows.length; i++) {
const rowKeys = collect(fixtureRows[i], []).map(norm).filter(x => x.length >= 3);
let hit = null;

for (const c of candidates) {
if (c.useful <= 0) continue;
for (const k of rowKeys) {
if (c.keys.includes(k)) {
hit = c;
break;
}
}
if (hit) break;
}

if (hit) {
matches.push({
fixtureIndex: i,
source: hit.file,
usefulMetadataScore: hit.useful,
title: hit.item.title || hit.item.name || hit.item.filename || "",
hasPoster: !!hit.item.poster,
hasBackdrop: !!hit.item.backdrop,
hasOverview: !!hit.item.overview
});
}
}

const report = {
status: "source metadata matcher dry-run only",
runtimeFrontendPlaybackFilesChanged: false,
expandedDetailsFixtureMutated: false,
fixtureRows: fixtureRows.length,
sourceCandidates: candidates.length,
matches: matches.length,
matchesWithUsefulMetadata: matches.filter(x => x.usefulMetadataScore > 0).length,
sampleMatches: matches.slice(0, 20)
};

const summary = [
"Status: source metadata matcher dry-run only",
"Runtime/frontend/playback files changed: no",
"expanded-details-fixture.json mutated: no",
"",
"fixture rows: " + report.fixtureRows,
"source candidates: " + report.sourceCandidates,
"matches: " + report.matches,
"matches with useful metadata: " + report.matchesWithUsefulMetadata,
"",
"Sample:",
JSON.stringify(report.sampleMatches.slice(0, 5), null, 2)
].join("\n");

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
fs.writeFileSync(summaryPath, summary);
console.log(summary);
