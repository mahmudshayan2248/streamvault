const badSnapshot = [
  { key: "", kind: "", title: "", path: "/api/details//", query: "", fullPath: "/api/details//?title=" },
  { key: "bad", kind: "movie", title: "Bad Route", path: "/api/details/movie/Bad Route", query: "title=Bad Route", fullPath: "/api/details/movie/Bad Route?title=Bad Route" }
];

let problems = 0;
const seen = new Set();

for (const r of badSnapshot) {
  if (!r.key || !r.kind || !r.title || !r.path || !r.query || !r.fullPath) {
    console.error("EXPECTED_ROUTE_SNAPSHOT_FAIL missing field");
    problems++;
  }

  if (!["movie", "series"].includes(r.kind)) {
    console.error("EXPECTED_ROUTE_SNAPSHOT_FAIL invalid kind");
    problems++;
  }

  if (String(r.fullPath).includes(" ")) {
    console.error("EXPECTED_ROUTE_SNAPSHOT_FAIL raw space");
    problems++;
  }

  if (seen.has(r.fullPath)) {
    console.error("EXPECTED_ROUTE_SNAPSHOT_FAIL duplicate");
    problems++;
  }

  seen.add(r.fullPath);
}

console.log("NEGATIVE_ROUTE_SNAPSHOT_PROBLEMS=" + problems);

if (!problems) {
  console.error("NEGATIVE_ROUTE_SNAPSHOT_FAIL: bad route snapshot unexpectedly passed");
  process.exit(1);
}

console.log("NEGATIVE_ROUTE_SNAPSHOT_PASS");
