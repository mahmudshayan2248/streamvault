const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const builder = path.join("tools", "details-parity-v1", "build-expanded-details-fixture.js");
const fixture = path.join("tools", "details-parity-v1", "expanded-details-fixture.json");

const original = fs.existsSync(fixture) ? fs.readFileSync(fixture, "utf8") : "";

function runBuilder(label) {
  const result = spawnSync(process.execPath, [builder], { encoding: "utf8" });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) {
    console.error("DETERMINISM_FAIL: builder failed on " + label);
    process.exit(1);
  }
  return fs.readFileSync(fixture, "utf8");
}

const first = runBuilder("first run");
const second = runBuilder("second run");

if (original) fs.writeFileSync(fixture, original);

if (first !== second) {
  console.error("DETERMINISM_FAIL: fixture builder output changed between runs");
  process.exit(1);
}

const rows = JSON.parse(second);
if (!Array.isArray(rows) || rows.length < 100) {
  console.error("DETERMINISM_FAIL: fixture output has too few rows");
  process.exit(1);
}

console.log("FIXTURE_BUILDER_DETERMINISM_PASS");
