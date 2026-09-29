StreamVault Haskell Details 7O Shadow All Baseline
==================================================

Status:

* Task type: report-only safety checkpoint
* Runtime/frontend/playback files changed: no
* npm run details:shadow:all exit code: 0

Note:
PowerShell previously stopped because npm wrote schema-negative stderr:
SCHEMA_TOTAL=1
SCHEMA_BAD=3
bad-fixture.json[0]: invalid key

This checkpoint preserves the output so the next task can decide whether it is expected negative-test behavior or a real failing gate.

Output file:
tools\details-parity-v1\out\details-shadow-all-7o-20260608-202843.txt
