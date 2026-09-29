StreamVault Haskell Details 7T Negative Schema Classification
=============================================================

Status:

* Task type: tooling/report-only cleanup
* Runtime/frontend/playback files changed: no

Problem:
The summary showed SCHEMA_FAIL even though it was part of the expected negative schema test.

Fix:
Classify SCHEMA_FAIL as expected when:

* NEGATIVE_SCHEMA_PASS exists
* EXIT_CODE=0

Purpose:
Prevent future summaries from treating intentional bad-fixture schema tests as real parity failures.
