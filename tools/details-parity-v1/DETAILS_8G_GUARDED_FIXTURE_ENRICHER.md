StreamVault Haskell Details 8G Guarded Fixture Enricher
=======================================================

Status:
- Task type: guarded enrichment tool
- Runtime/frontend/playback files changed: no
- apply mode enabled: False
- expanded-details-fixture.json mutated: False

Inputs:
- fixture: tools\details-parity-v1\expanded-details-fixture.json
- cache: poster-cache.json
- preview output: C:\Users\MACMIN~1\AppData\Local\Temp\sv-details-enrichment-preview-8g.json
- backup output when apply mode is used: C:\Users\MACMIN~1\AppData\Local\Temp\sv-expanded-details-fixture-backup-8g-20260609-101115.json

Counts:
- fixture rows: 120
- poster-cache entries: 58
- poster matches: 0
- backdrop matches: 0
- normalized title matches: 0
- any matches: 0
- candidate rows with at least one fill: 0

Field fill candidates:
- genre: 0
- runtime: 0
- language: 0
- director: 0
- productionCompanies: 0

Safety:
- Default run is preview-only.
- Real fixture mutation requires -Apply and SV_DETAILS_ENRICHMENT_APPLY=YES_I_ACCEPT_FIXTURE_MUTATION.
- This task ran without apply mode.

Sample candidate rows:
- none
