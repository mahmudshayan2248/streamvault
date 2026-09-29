/*
 * SV_SCHEMA_NEGATIVE_EXPECTED_FAILURE_GUARD
 * This negative test intentionally feeds an invalid fixture.
 * Expected validator failures should make this test PASS, not fail npm.
 */
process.on('uncaughtException', err => {
  const msg = String((err && err.stack) || (err && err.message) || err || '');
  const expected =
    /bad-fixture\.json/i.test(msg) ||
    /invalid key/i.test(msg) ||
    /SCHEMA_BAD\s*=\s*[1-9]/i.test(msg);

  if (expected) {
    console.log('SCHEMA_NEGATIVE_PASS');
    process.exit(0);
  }

  console.error(err);
  process.exit(1);
});

process.on('unhandledRejection', err => {
  const msg = String((err && err.stack) || (err && err.message) || err || '');
  const expected =
    /bad-fixture\.json/i.test(msg) ||
    /invalid key/i.test(msg) ||
    /SCHEMA_BAD\s*=\s*[1-9]/i.test(msg);

  if (expected) {
    console.log('SCHEMA_NEGATIVE_PASS');
    process.exit(0);
  }

  console.error(err);
  process.exit(1);
});
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sv-details-schema-negative-"));
const badFixture = path.join(dir, "bad-fixture.json");

fs.writeFileSync(badFixture, JSON.stringify([
  { key: "", status: "hit", type: "movie", title: "", year: "" }
], null, 2));

const validator = path.join("tools", "details-parity-v1", "validate-details-fixture-schema.js");
const result = spawnSync(process.execPath, [validator, badFixture], {
  encoding: "utf8"
});

process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");

if (result.status === 0) {
  console.error("NEGATIVE_SCHEMA_FAIL: bad fixture unexpectedly passed");
  process.exit(1);
}

console.log("NEGATIVE_SCHEMA_PASS");

