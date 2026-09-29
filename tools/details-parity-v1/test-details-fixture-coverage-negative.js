const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sv-details-coverage-negative-"));
const badFixture = path.join(dir, "bad-coverage-fixture.json");

const rows = Array.from({ length: 60 }, (_, i) => ({
  key: `movie:Bad ${i}:2020`,
  status: "hit",
  type: "movie",
  title: `Bad ${i}`,
  name: `Bad ${i}`,
  year: "2020",
  rating: "",
  genre: "",
  runtime: "",
  language: "",
  poster: "",
  backdrop: "",
  overview: "",
  streamUrl: ""
}));

fs.writeFileSync(badFixture, JSON.stringify(rows, null, 2));

const validator = path.join("tools", "details-parity-v1", "test-details-fixture-coverage.js");
const result = spawnSync(process.execPath, [validator, badFixture], { encoding: "utf8" });

process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");

if (result.status === 0) {
  console.error("NEGATIVE_COVERAGE_FAIL: bad fixture unexpectedly passed");
  process.exit(1);
}

console.log("NEGATIVE_COVERAGE_PASS");
