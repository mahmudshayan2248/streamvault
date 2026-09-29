const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const TOOL = path.join(__dirname, "SeriesShadowPager.hs");
const BUILD_DIR = path.join(__dirname, ".build-series-shadow-pager-gate");
const EXE = path.join(BUILD_DIR, process.platform === "win32" ? "SeriesShadowPager.exe" : "SeriesShadowPager");
const CATALOG = path.join(ROOT, "catalog.json");

function fail(msg) {
console.error("FAIL:", msg);
process.exit(1);
}

function run(cmd, args, opts = {}) {
const result = spawnSync(cmd, args, {
cwd: ROOT,
encoding: "utf8",
shell: false,
...opts
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

const out = run(EXE, [CATALOG, "1", "12"]).stdout.trim();
let parsed;

try {
parsed = JSON.parse(out);
} catch (err) {
console.error(out);
fail(`Invalid JSON: ${err.message}`);
}

if (parsed.ok !== true) fail("Expected ok=true");
if (parsed.source !== "base-haskell-series-shadow-pager") fail("Unexpected source");
if (parsed.page !== 1) fail("Expected page=1");
if (parsed.limit !== 12) fail("Expected limit=12");
if (!Number.isFinite(parsed.total) || parsed.total <= 0) fail("Expected total > 0");
if (!Number.isFinite(parsed.totalPages) || parsed.totalPages <= 0) fail("Expected totalPages > 0");
if (!Array.isArray(parsed.items)) fail("Expected items array");

fs.rmSync(BUILD_DIR, { recursive: true, force: true });

console.log("SERIES_SHADOW_PAGER_GATE_PASS");
console.log(`TOTAL=${parsed.total}`);
console.log(`COUNT=${parsed.count}`);
console.log(`TOTAL_PAGES=${parsed.totalPages}`);