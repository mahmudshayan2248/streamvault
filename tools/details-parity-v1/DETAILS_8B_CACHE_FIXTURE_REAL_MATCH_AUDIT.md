StreamVault Haskell Details 8B Cache Fixture Real Match Audit
=============================================================

Status:
- Task type: report-only real matching audit scaffold
- Runtime/frontend/playback files changed: no

Known result:
- 8A proved poster-cache has useful metadata.
- 7V proved expanded fixture has 0/120 for genre/runtime/language/director/productionCompanies.

Next safe implementation:
- Build matching logic in small steps.
- Do not mutate expanded-details-fixture.json until match count is proven.

Safety:
- This commit is report-only.
