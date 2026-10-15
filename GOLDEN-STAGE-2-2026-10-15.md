# StreamVault — Golden Stage 2 checkpoint (2026-10-15)

> **STATUS: SOURCE CHECKPOINT ONLY — NOT YET A VERIFIED LIVE GOLDEN RESTORE.**
>
> This index is non-destructive. No Hostinger deployment, Mac mini restart, DNS change, service-worker update, or production data change was performed.

## GitHub code snapshots (immutable by convention)

| Component | Frozen ref | Commit SHA | Source branch |
| --- | --- | --- | --- |
| Repository default branch code | `recovery/golden-stage-2-2026-10-15-main` | `7f7f6e1f71e30890caba3177f7d13bf27fed4a78` | `master` |
| Hostinger frontend source code | `recovery/golden-stage-2-2026-10-15-hostinger` | `949cc2133470b46645d7d6194315750c03ab0e4f` | `hostinger-frontend-only` |
| Windows backend historical baseline (not verified running) | `stable-production-macmini` | `8d3780d977a4d15c06c5ed2d2d10e6d295ba814c` | `stable-production-macmini` |

The first two refs were created at the exact recorded commit SHA and must not be force-moved. This index branch may carry documentation; it is not itself the frozen frontend/backend source.

## Critical production divergence

The 2026-10-15 user screenshot shows a navbar item labelled **Files & Downloads**. The repository's Hostinger frontend branch index still labels it **Explore Free Softwares**. Therefore, we have **not proven that the active Hostinger tree equals the frozen GitHub branch**. A prior web crawl of the public domain was two weeks old and did not establish present deployment bytes.

This distinction is essential: **do not restore live production from these refs on an assumption of byte-for-byte identity.**

## Golden Stage 1 — leave unchanged

Existing privately archived production capture (2026-10-02): `STREAMVAULT-GOLDEN-STABLE-2026-10-02-PRIVATE` in Google Drive. Original frontend, backend, database, and restore evidence must remain untouched.

## Requirements before Stage 2 is declared production-stable

- Capture the exact **currently served and active** Hostinger frontend tree, including symlink/build ID, all referenced CSS/JS/assets, runtime config, routes, and deployment metadata; do not reconstruct by combining Git commits.
- Capture the **running** Windows Mac mini backend root, executable code, data files/catalog indexes, persistent caches/posters, database, Node/FFmpeg versions, Windows scheduled/startup services, and local routing. Exclude full media video bytes only if the restore scope states so explicitly.
- Privately archive environment secrets, SSH/tunnel/Cloudflare/Hostinger configuration, with access control (never commit secrets to GitHub).
- Record a SHA-256 manifest for every archive and verify archives can be extracted/compared on a separate machine.
- Smoke-test homepage and rows, live channels, movie/series playback, subtitle/audio switches, seeking, buffering, downloads, server health, and desktop/mobile header clearance. Record timestamps/screenshots/logs.
- Store the complete Stage 2 archive, `MANIFEST.json`, `SHA256SUMS`, `STATUS.md`, and `STABLE-RESTORE.md` in its own private off-machine backup. Optionally keep another separate local backup.
- Produce an immutable version tag only after the exact deployed production tree and test evidence match the capture.

## Restore guidance

For GitHub code inspection or recovery, check out a dedicated `recovery/golden-stage-2-2026-10-15-main` or `recovery/golden-stage-2-2026-10-15-hostinger` worktree. **Do not forcibly reset any active branch or deploy these refs until the live production source-of-truth has been reconciled.**

**Verification as of 2026-10-15:** GitHub snapshot branches created and reread; no CI statuses were reported for either current commit. Live Hostinger bytes, active Windows backend, independent full off-machine Stage 2 backup, and end-to-end tests remain **unverified/unavailable**.
