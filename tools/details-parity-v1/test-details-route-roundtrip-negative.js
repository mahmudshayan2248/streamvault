const badRoutes = [
  {
    key: "bad:path",
    kind: "movie",
    title: "Correct Title",
    path: "/api/details/movie/Wrong%20Title",
    query: "title=Correct%20Title",
    fullPath: "/api/details/movie/Wrong%20Title?title=Correct%20Title"
  },
  {
    key: "bad:query",
    kind: "series",
    title: "Correct Show",
    path: "/api/details/series/Correct%20Show",
    query: "title=Wrong%20Show",
    fullPath: "/api/details/series/Correct%20Show?title=Wrong%20Show"
  }
];

let problems = 0;

function titleFromPath(route) {
  const prefix = `/api/details/${route.kind}/`;
  if (!route.path.startsWith(prefix)) return "";
  return decodeURIComponent(route.path.slice(prefix.length));
}

function titleFromQuery(route) {
  const params = new URLSearchParams(String(route.query || ""));
  return params.get("title") || "";
}

for (const route of badRoutes) {
  if (titleFromPath(route) !== route.title) {
    console.error("EXPECTED_ROUTE_ROUNDTRIP_FAIL path mismatch");
    problems++;
  }

  if (titleFromQuery(route) !== route.title) {
    console.error("EXPECTED_ROUTE_ROUNDTRIP_FAIL query mismatch");
    problems++;
  }
}

console.log("NEGATIVE_ROUTE_ROUNDTRIP_PROBLEMS=" + problems);

if (!problems) {
  console.error("NEGATIVE_ROUTE_ROUNDTRIP_FAIL: bad routes unexpectedly passed");
  process.exit(1);
}

console.log("NEGATIVE_ROUTE_ROUNDTRIP_PASS");
