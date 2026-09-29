const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sv-details-response-negative-"));
const badFixture = path.join(dir, "bad-response-fixture.json");

fs.writeFileSync(badFixture, JSON.stringify([
  {
    key: "movie:Bad:2020",
    status: "hit",
    type: "movie",
    title: "",
    name: "",
    year: "",
    poster: "",
    overview: "",
    streamUrl: ""
  }
], null, 2));

const script = path.join("tools", "details-parity-v1", "test-details-response-parity-basic.js");
const result = spawnSync(process.execPath, [script, badFixture], { encoding: "utf8" });

process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");

if (result.status === 0) {
  console.error("NEGATIVE_RESPONSE_PARITY_FAIL: bad response fixture unexpectedly passed");
  process.exit(1);
}

console.log("NEGATIVE_RESPONSE_PARITY_PASS");
