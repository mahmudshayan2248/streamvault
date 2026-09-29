StreamVault Haskell Details 8M Review Pack Regenerator
======================================================

Status:
- Task type: recovery checkpoint for review-pack regenerator
- Runtime/frontend/playback files changed: no
- expanded-details-fixture.json mutated: no
- generated at: 20260609-110735

Reason:
- Previous generated script contained pasted markdown fence lines.
- The bad generated script was removed.
- This checkpoint keeps the migration safe and prevents fixture mutation.

Inputs checked:
- fixture: tools\details-parity-v1\expanded-details-fixture.json
- cache: poster-cache.json
- review pack placeholder: tools\details-parity-v1\out\fixture-enrichment-candidates-8m.json

Counts:
- fixture rows: 120
- poster-cache entries: 58

Outputs:
- review pack placeholder JSON: tools\details-parity-v1\out\fixture-enrichment-candidates-8m.json
- report: tools\details-parity-v1\DETAILS_8M_REVIEW_PACK_REGENERATOR.md

Safety:
- Review pack placeholder is an empty valid JSON array.
- No real fixture mutation was performed.
- Next task should rebuild the review-pack generator with a safer no-nested-script approach.

Next task:
- 8N should implement the regenerator directly in one command or a committed script without pasted fence artifacts.
