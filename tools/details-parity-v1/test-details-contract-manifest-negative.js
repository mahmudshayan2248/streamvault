const badManifest = [
  { key: "", route: null, response: null },
  {
    key: "bad:key",
    route: { key: "other:key", kind: "movie", fullPath: "/api/details/movie/Bad Route?title=Bad Route" },
    response: { ok: "true" }
  }
];

let problems = 0;

for (const item of badManifest) {
  if (!item.key || !item.route || !item.response) {
    console.error("EXPECTED_MANIFEST_FAIL missing key/route/response");
    problems++;
    continue;
  }

  if (item.key !== item.route.key) {
    console.error("EXPECTED_MANIFEST_FAIL route key mismatch");
    problems++;
  }

  if (!item.route.fullPath || String(item.route.fullPath).includes(" ")) {
    console.error("EXPECTED_MANIFEST_FAIL bad route fullPath");
    problems++;
  }

  if (typeof item.response.ok !== "boolean") {
    console.error("EXPECTED_MANIFEST_FAIL bad response contract");
    problems++;
  }
}

console.log("NEGATIVE_MANIFEST_PROBLEMS=" + problems);

if (!problems) {
  console.error("NEGATIVE_MANIFEST_FAIL: bad manifest unexpectedly passed");
  process.exit(1);
}

console.log("NEGATIVE_MANIFEST_PASS");
