# Details Shadow 7G Checkpoint

Status: PASS

Node remains primary. Haskell details remains shadow-only.

7G route parity gates:
- details:shadow:route:contract
- details:shadow:route:negative
- details:shadow:route:snapshot
- details:shadow:route:snapshot:negative
- details:shadow:route:roundtrip
- details:shadow:route:roundtrip:negative

Full gate command:
```bash
npm run details:shadow:all
```

Route coverage:
- rows: 120
- movie routes: 80
- series/tv routes: 40

Validated behavior:
- detail route kind normalization
- encoded detail paths
- encoded title query
- deterministic route snapshots
- path/query title roundtrip
- negative route failures are intentional when NEGATIVE_*_PASS appears
