const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const TOOL = path.join(__dirname, "SearchShadowReader.hs");
const BUILD_DIR = path.join(__dirname, ".build-search-shadow-reader-gate");
const EXE = path.join(BUILD_DIR, process.platform === "win32" ? "SearchShadowReader.exe" : "SearchShadowReader");
const CATALOG = path.join(ROOT, "catalog.json");

function fail(msg) {
console.error("FAIL:", msg);
process.exit(1);
}

function run(cmd, args) {
const result = spawnSync(cmd, args, {
cwd: ROOT,
encoding: "utf8",
shell: false
});

if (result.status !== 0) {
console.error(result.stdout || "");
console.error(result.stderr || "");
fail(`${cmd} exited ${result.status}`);
}

return result;
}

if (!fs.existsSync(TOOL)) fail(`Missing tool: ${TOOL}`);
if (!fs.existsSync(CATALOG)) fail(`Missing catalog: ${CATALOG}`);

fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.mkdirSync(BUILD_DIR, { recursive: true });

run("ghc", [
"-O0",
"-Wall",
"-fforce-recomp",
"-outputdir", BUILD_DIR,
"-odir", BUILD_DIR,
"-hidir", BUILD_DIR,
"-o", EXE,
TOOL
]);

const out = run(EXE, [CATALOG, "the", "12"]).stdout.trim();

let parsed;
try {
parsed = JSON.parse(out);
} catch (err) {
console.error(out);
fail(`Invalid JSON: ${err.message}`);
}

if (parsed.ok !== true) fail("Expected ok=true");
if (parsed.source !== "base-haskell-search-shadow-reader") fail("Unexpected source");
if (parsed.query !== "the") fail("Expected query=the");
if (parsed.limit !== 12) fail("Expected limit=12");
if (!Number.isFinite(parsed.count) || parsed.count <= 0) fail("Expected count > 0");
if (!Number.isFinite(parsed.estimatedTitleFields) || parsed.estimatedTitleFields <= 0) fail("Expected estimatedTitleFields > 0");
if (!Array.isArray(parsed.items)) fail("Expected items array");
if (parsed.items.length !== parsed.count) fail("items length must match count");

fs.rmSync(BUILD_DIR, { recursive: true, force: true });

console.log("SEARCH_SHADOW_READER_GATE_PASS");
console.log(`QUERY=${parsed.query}`);
console.log(`COUNT=${parsed.count}`);
console.log(`ESTIMATED_TITLE_FIELDS=${parsed.estimatedTitleFields}`);