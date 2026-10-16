# StreamVault Golden Stage 2 — PARTIAL

This branch preserves portable restore tooling, sanitized manifests, checksums and verification reports. It is not a complete production recovery point. See [FINAL-REPORT.md](FINAL-REPORT.md) and [STABLE-RESTORE.md](STABLE-RESTORE.md). Encrypted payloads and vendor binaries are in the separate private backup, not this public repository.

Latest tested tooling commit: 4f5054c18874415ca8826695cadce6ced3f50042. Three-platform synthetic CI passed. Actual frontend restore evidence is separate from those fixture tests. Current backend/database/persistent/tunnel captures are missing. No stable promotion tag was created. The public SHA256SUMS covers encrypted payload archives only; the private snapshot checksum list additionally covers its metadata and tooling.
