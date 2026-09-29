StreamVault Haskell Details 8H Strong Match Enrichment Preview
=============================================================

Status:
- Task type: strong-match preview-only enrichment
- Runtime/frontend/playback files changed: no
- expanded-details-fixture.json mutated: no

Safety model:
- Poster URL and backdrop URL matches are treated as strong matches.
- Normalized title-only matches are counted but not used for field filling.
- This task writes only a temp preview output and this markdown report.

Inputs:
- fixture: tools\details-parity-v1\expanded-details-fixture.json
- cache: poster-cache.json
- preview output: C:\Users\MACMIN~1\AppData\Local\Temp\sv-details-strong-match-enrichment-preview-8h.json

Counts:
- fixture rows: 120
- poster-cache entries: 58
- strong poster matches: 0
- strong backdrop matches: 0
- strong matches total: 0
- weak normalized title-only matches: 0
- weak-only matches not used for fill: 0
- candidate rows with at least one strong-fill: 0

Field fill candidates from strong matches only:
- genre: 0
- runtime: 0
- language: 0
- director: 0
- productionCompanies: 0

Decision rule:
- If strong-fill candidate counts are good, next task can create guarded apply branch.
- If strong-fill candidate counts are low, do not mutate the fixture.

Sample strong-fill candidate rows:
- none

Sample weak title-only matches ignored for fill:
- none
