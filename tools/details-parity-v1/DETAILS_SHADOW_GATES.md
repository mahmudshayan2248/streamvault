# Details Shadow Safety Gates

Node remains primary. Haskell details stays shadow-only.

## Main command

```bash
npm run details:shadow:all
```

## Gate order

1. details:shadow:audit - fixture count, bad rows, duplicates
2. details:shadow:schema - required fields, status/type, hit-row consistency
3. details:shadow:schema:negative - bad schema must fail; pass marker: NEGATIVE_SCHEMA_PASS
4. details:shadow:fixture:determinism - builder output must stay stable
5. details:shadow:fixture:coverage - movie/tv/poster/overview coverage
6. details:shadow:fixture:coverage:negative - weak coverage must fail; pass marker: NEGATIVE_COVERAGE_PASS
7. details:shadow:suite - final smoke check

## Expected pass markers

```txt
DETAILS_FIXTURE_AUDIT_PASS
DETAILS_FIXTURE_SCHEMA_PASS
NEGATIVE_SCHEMA_PASS
FIXTURE_BUILDER_DETERMINISM_PASS
DETAILS_FIXTURE_COVERAGE_PASS
NEGATIVE_COVERAGE_PASS
SUITE_PASS
```
