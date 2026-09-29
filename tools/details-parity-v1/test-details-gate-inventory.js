const pkg = require("../../package.json");

const requiredScripts = [
  "details:shadow:audit",
  "details:shadow:schema",
  "details:shadow:schema:negative",
  "details:shadow:fixture:determinism",
  "details:shadow:fixture:coverage",
  "details:shadow:fixture:coverage:negative",
  "details:shadow:response:parity",
  "details:shadow:response:contract",
  "details:shadow:response:contract:negative",
  "details:shadow:response:snapshot",
  "details:shadow:response:snapshot:negative",
  "details:shadow:response:negative",
  "details:shadow:route:contract",
  "details:shadow:route:negative",
  "details:shadow:route:snapshot",
  "details:shadow:route:snapshot:negative",
  "details:shadow:route:roundtrip",
  "details:shadow:route:roundtrip:negative",
  "details:shadow:manifest",
  "details:shadow:manifest:negative",
  "details:shadow:gate:inventory",
  "details:shadow:suite"
];

let bad = 0;
const scripts = pkg.scripts || {};
const all = scripts["details:shadow:all"] || "";

for (const name of requiredScripts) {
  if (!scripts[name]) {
    console.error("GATE_INVENTORY_FAIL missing script:", name);
    bad++;
  }

  if (name !== "details:shadow:all" && !all.includes("npm run " + name)) {
    console.error("GATE_INVENTORY_FAIL not wired into all:", name);
    bad++;
  }
}

console.log("GATE_INVENTORY_REQUIRED=" + requiredScripts.length);
console.log("GATE_INVENTORY_BAD=" + bad);

if (bad) {
  console.error("DETAILS_GATE_INVENTORY_FAIL");
  process.exit(1);
}

console.log("DETAILS_GATE_INVENTORY_PASS");
