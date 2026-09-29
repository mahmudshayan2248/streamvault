StreamVault Haskell Details 7S Shadow Failure Buckets
=====================================================

Status:

* Task type: report-only failure classifier
* Runtime/frontend/playback files changed: no
* Source output: details-shadow-all-safe-20260608-211719.txt
* Safe runner EXIT_CODE=0

Bucket counts:

* FAIL lines: 2
* mismatch lines: 0
* error lines: 0
* SCHEMA_BAD lines: 2
* fixture-related lines: 27
* missing-related lines: 11
* key-related lines: 1
* poster-related lines: 3
* overview-related lines: 3
* rating-related lines: 1
* genre-related lines: 1
* runtime-related lines: 1
* language-related lines: 1
* production-company-related lines: 1

Recommended next safe parity target:

1. If mismatch/FAIL lines exist, fix the smallest repeated field bucket first.
2. Ignore expected schema-negative SCHEMA_BAD noise unless EXIT_CODE is non-zero.
3. Prefer metadata adapter fixes over route/runtime changes.

Recent FAIL lines:
- SCHEMA_FAIL: invalid fixture schema
- DETAILS_FIXTURE_COVERAGE_FAIL

Recent mismatch lines:
- none

Recent error lines:
- none

Recent missing lines:
- GAP_MISSING_POSTER=4
- GAP_MISSING_BACKDROP=11
- GAP_MISSING_OVERVIEW=5
- GAP_MISSING_RATING=23
- GAP_MISSING_GENRE=120
- GAP_MISSING_RUNTIME=120
- GAP_MISSING_LANGUAGE=120
- GAP_MISSING_DIRECTOR=120
- GAP_MISSING_PRODUCTIONCOMPANIES=120
- GAP_ITEMS_WITH_ANY_MISSING=120
- C:\Users\MACMIN~1\AppData\Local\Temp\sv-details-schema-negative-Vb6QvH\bad-fixture.json[0]: hit row missing year

Recent metadata-field lines:
- COVERAGE_POSTERS=116
- COVERAGE_POSTERS=0
- GAP_MISSING_POSTER=4
- COVERAGE_OVERVIEWS=115
- COVERAGE_OVERVIEWS=0
- GAP_MISSING_OVERVIEW=5
- GAP_MISSING_RATING=23
- GAP_MISSING_GENRE=120
- GAP_MISSING_RUNTIME=120
- GAP_MISSING_LANGUAGE=120
- GAP_MISSING_PRODUCTIONCOMPANIES=120
