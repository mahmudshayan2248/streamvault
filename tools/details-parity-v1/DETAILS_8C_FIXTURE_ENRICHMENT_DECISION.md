StreamVault Haskell Details 8C Fixture Enrichment Decision
==========================================================

Status:
- Task type: report-only decision checkpoint
- Runtime/frontend/playback files changed: no

Known facts:
- 7V: expanded-details-fixture.json has 120 rows.
- 7V: poster/backdrop/overview/rating are mostly present.
- 7V: genre/runtime/language/director/productionCompanies are 0/120.
- 8A: poster-cache has some useful metadata.
- 8B: full fixture mutation is not safe yet.

Decision:
- Do not mutate expanded-details-fixture.json yet.
- Next implementation must first build verified matching logic.
- Match order should be: poster URL, backdrop URL, normalized title.
- Only fill missing fields after match count and useful metadata count are proven.

Next task:
- 8D should implement a dry-run matcher that prints candidate counts only.
- 8D must not write expanded-details-fixture.json.
