const { validateResponseContract } = require("./details-response-contract");

const badSnapshot = [
  {
    key: "",
    response: {
      ok: "true",
      status: "hit",
      type: "movie",
      title: "Bad Snapshot",
      name: "Bad Snapshot",
      year: 2020,
      poster: null,
      overview: "Bad",
      streamUrl: "http://example.invalid/bad.mkv"
    }
  }
];

let problems = 0;

for (const item of badSnapshot) {
  if (!item.key) {
    console.error("EXPECTED_SNAPSHOT_FAIL missing snapshot key");
    problems++;
  }

  const contractProblems = validateResponseContract(item.response, item.key || "bad-snapshot");
  for (const p of contractProblems) {
    console.error("EXPECTED_SNAPSHOT_CONTRACT_FAIL " + p);
    problems++;
  }
}

console.log("NEGATIVE_RESPONSE_SNAPSHOT_PROBLEMS=" + problems);

if (!problems) {
  console.error("NEGATIVE_RESPONSE_SNAPSHOT_FAIL: bad snapshot unexpectedly passed");
  process.exit(1);
}

console.log("NEGATIVE_RESPONSE_SNAPSHOT_PASS");
