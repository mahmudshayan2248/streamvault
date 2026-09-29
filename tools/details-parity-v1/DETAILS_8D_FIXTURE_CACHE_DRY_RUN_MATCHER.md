StreamVault Haskell Details 8D Fixture Cache Dry Run Matcher
============================================================

Status:
- Task type: dry-run matcher only
- Runtime/frontend/playback files changed: no
- expanded-details-fixture.json mutated: no

Inputs:
- fixture: tools\details-parity-v1\expanded-details-fixture.json
- cache: poster-cache.json

Counts:
- fixture rows: 120
- poster-cache entries: 58
- poster matches: 0
- backdrop matches: 0
- normalized title matches: 0
- any matches: 0
- matches with useful metadata: 0

Decision rule:
- If useful metadata matches are high enough, next task can add a guarded mutation mode.
- If useful metadata matches are low, use stronger TMDB/source metadata instead.

Sample matches:
- none
