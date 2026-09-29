let bad = 0;

const invalidRows = [
  { key: "", type: "movie", title: "" },
  { key: "bad:type", type: "unknown", title: "Bad Title" }
];

function clean(v){ return String(v ?? "").trim(); }

function routeKind(type){
  const t = clean(type).toLowerCase();
  if (t === "movie") return "movie";
  if (t === "tv" || t === "series") return "series";
  return "";
}

for (const row of invalidRows) {
  const title = clean(row.title || row.name);
  const kind = routeKind(row.type);

  if (!row.key || !kind || !title) {
    console.error("EXPECTED_ROUTE_CONTRACT_FAIL invalid route fixture");
    bad++;
  }
}

console.log("NEGATIVE_ROUTE_CONTRACT_PROBLEMS=" + bad);

if (!bad) {
  console.error("NEGATIVE_ROUTE_CONTRACT_FAIL: bad route fixture unexpectedly passed");
  process.exit(1);
}

console.log("NEGATIVE_ROUTE_CONTRACT_PASS");
