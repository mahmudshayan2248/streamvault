# StreamVault Golden Stage 2 — PARTIAL

Snapshot: `STREAMVAULT-GOLDEN-STAGE-2-2026-10-15`  
Report generated: 2026-10-16T19:23:25.565388+00:00 (client date: 2026-10-17, Asia/Dhaka)

## Outcome

This snapshot preserves accessible actual Hostinger production files and complete Git source reference history, with encrypted archives and portable restore tooling. It **cannot rebuild the complete current service**: the current Windows backend, database, backend persistent state and tunnel configuration are missing. No FULLY VERIFIED designation or stable promotion tag was created.

The requested snapshot name retains its October 15 mission date. Capture was interrupted and resumed; verification reports retain their actual UTC timestamps. This is not a simultaneous full-service point-in-time image.

No production files, database records, DNS, services or deployments were changed. Tests used read-only production requests, a new local restore directory and GitHub CI. Golden Stage 1 was opened read-only; its recorded manifest hash still matches. The three protected Stage 2 branch tips are unchanged. The existing dirty checkout was preserved.

## Completion by component

| Component / gate | Completion | Evidence and limits |
|---|---:|---|
| Actual deployed frontend asset inventory | 100% | 254 frontend files; 260 files including accessible routing/config in initial capture; all 31 checked public assets match origin hashes. |
| Active Hostinger application bundle | 100% | 7373 regular files; zero exclusions in active tree; exposed FTP metadata and symlinks retained. |
| Current Windows backend | 0% | Authorized SSH timed out. Initial peer status was offline; refreshed local Tailscale is Stopped, so current peer metadata is cached. Public HTTP is checked separately. |
| Current database | 0% | Existing historical credentials denied from current client; no dump, row count or integrity verification. |
| Backend persistent files / external poster cache | 0% | Windows management unavailable; external Hostinger poster path returned FTP 550. Static files bundled in Hostinger tree are distinct. |
| Current Windows runtime, env, scheduled tasks, FFmpeg | 0% | Not captured or version verified. |
| Current Cloudflare zone/tunnel configuration | 0% | Public DNS observations only; no current zone export or tunnel credentials. |
| Available current Hostinger private config | 100% of accessible paths | Separately age encrypted. Current FTP capture connection and accessible routing/config retained. Missing Windows/tunnel secrets remain missing. |
| Git reference history | 100% of discovered remote refs | Full mirror fsck and complete Git bundle verification passed. Not a deployed Windows backup. |
| Restore tooling platform fixtures | 100% of defined fixture gates | Latest CI passed Windows, Linux, macOS; synthetic data only. |
| Actual Hostinger isolated restore | PASS | 7373 files, captured offline dependencies, symlinks, root HTML and 31 assets verified. |
| Full-service independent restore | 0% | Blocked by missing backend/database/persistent/tunnel components. |

Percentages describe each defined capture/test gate. An overall service percentage would imply unknown coverage and is not provided.

## Exact versions and source evidence

- Active Hostinger target: `/hbuilds/versions/01a13f59-ed1b-73ce-a5e7-1ac5aed7161b`; `/hbuilds/current` resolved to the same inode before and after capture.
- Embedded Hostinger Git HEAD: `cc58a670051d84a215225369618345bee5ad331b`. This records embedded metadata; captured file hashes establish deployed bytes. The commit is not present in the requested repository mirror, and no exact Git-tree equivalence is claimed.
- Public backend reports version `title-details-route-active`, build `20260624-lite-ui-preview-cleanup2`. These are strings returned by the API, not a verified backend commit or filesystem hash.
- Hostinger configured Node major 22. Exact production minor and FFmpeg version unknown. Local actual restore used Node `v22.23.3`; CI uses Node 22 and Python 3.12.
- Tested restore tooling commit: `4f5054c18874415ca8826695cadce6ced3f50042`; [three-platform CI evidence](https://github.com/mahmudshayan2248/streamvault/actions/runs/38772855475).
- Recovery branch: [recovery/golden-stage-2-2026-10-15-universal-161706Z](https://github.com/mahmudshayan2248/streamvault/tree/recovery/golden-stage-2-2026-10-15-universal-161706Z). Public branch contains tooling and sanitized metadata only.
- Existing protected refs: main `7f7f6e1f71e30890caba3177f7d13bf27fed4a78`, hostinger `949cc2133470b46645d7d6194315750c03ab0e4f`, index `e874a08d17b4d33978c6772abb5e65a4cbf3c986`.
- Stage 1 manifest: `015e4a75a3c16768d8c1de5e90c60018d6b35d31347e8caee3aee605d3609dfb`; preserved, not substituted for current state.

## Archive locations and integrity

Local snapshot: `outputs/STREAMVAULT-GOLDEN-STAGE-2-2026-10-15`. New [private Drive folder](https://drive.google.com/drive/folders/16kPBzGuwxr-yNuBozUvHdyQR7zlFvILw). Archives larger than 20 MiB are stored as numbered 12 MiB parts; TRANSFER-MANIFEST.json maps them to their canonical archive hashes. Every uploaded archive/part has owner-only permission metadata and a downloaded SHA-256 check. Whole archive hashes are recalculated over ordered downloaded parts.

| Canonical encrypted archive | Bytes | SHA-256 |
|---|---:|---|
| `archives/frontend-live.tar.gz.age` | 13,841,314 | `9807d983c5d2ec419d26d87e3c36505b6efa585a7259d6caec7e899ba605a61d` |
| `archives/runtime-live.tar.gz.age` | 265,223,267 | `11e07ff841685ad4112479b23fe584b84f6197c5bfe1902d109b9e0756d52d1c` |
| `archives/github-source-reference.bundle.age` | 127,526,549 | `bd527575f9c864c0bcf13c8478547867db9de85ca6392b5129c868e1504cea0b` |
| `archives/private-config.tar.gz.age` | 353,483 | `89e7a7803443f3ba8a1237fc7915b03ed1bc5e478bf21464b580c1af3db2fb06` |
| `archives/observations.tar.gz.age` | 824,316 | `fdf8e8c9c10344a8acf21af33235b8ec11c383f102ab086837abb7552a765bf0` |

All 5 archive receipts verify authenticated age decryption and plaintext SHA-256 against the original. Drive readback has verified 5 canonical archives at this report generation. Detailed receipts and final coverage appear in MANIFEST.json and verification/drive-archive-readback.json; per-part IDs are in verification/drive-files.json. SHA256SUMS covers the final local snapshot files except itself.

Encryption uses age v1.3.2 with an existing SSH Ed25519 recipient. The separate private identity is **not** uploaded or committed. Preserve it independently; losing it makes these encrypted captures unrecoverable. Its public fingerprint is `SHA256:PaUabO3vIdrkH8ojX37muA7Qrx0xfrzyWHMCsQtq82Q`.

The private config archive also retains early capture manifests as diagnostic evidence. Those intermediate manifests contain failed attempts; the final Hostinger runtime archive and its embedded CAPTURE-MEMBERS.json determine completed file coverage. Current secrets absent from production access are explicitly not represented as captured.

## Restore and stability results

- Latest Windows/Linux/macOS CI: PASS. Fixtures exercise dry-run without writes, authenticated decryption, file hashing, safe extraction, traversal rejection, part assembly, idempotency, corruption detection, unrelated target protection, missing-backend refusal, platform wrappers, and loopback launcher startup. These are not actual backend/database restores.
- Actual clean frontend restore: PASS. See verification/actual-frontend-restore.json. Local testing does not install dependencies or fetch assets over the network. Browser code retains production API origins; this does not make the service offline capable.
- Recorded root and catalog/API HTTP checks passed at their report timestamps. The post-interruption access refresh is in verification/resume-access.json. Initial version/search/downloads timeouts were retried successfully; both original and retry reports remain.
- HLS master manifest: HTTP 200, manifest only. Movie download route: HTTP 200 with video MIME type and Content-Length; no multi-gigabyte download or browser acceptance claimed.
- Movie capability response exposes audio/subtitle choices; decoded playback, seek, buffering, recovery and selection functionality are NOT VERIFIED.
- Live TV primary relay route tested: HTTP 404, FAIL. Direct private source probe timed out and is not a backend relay test.
- External TMDB poster response passed. This is not proof of the missing Hostinger persistent cache.
- External downloads catalog link returned an HTML landing page; successful download is NOT VERIFIED.
- Browser layout, responsive UI and full playback tests: BLOCKED, authorized Chrome profile was unavailable. No other profile was used.
- Database integrity: NOT VERIFIED, no current dump.
- Docker and service templates: NOT EXECUTED, Docker unavailable; Windows actual-payload symlink privileges not verified. Node/FFmpeg portability on a newly provisioned backend remains unverified. CI runner success does not certify every Windows 10/11/Server edition or ARM64 host.

## Recovery commands

See STABLE-RESTORE.md for full instructions and Hostinger path adaptation. Run from the toolkit directory after downloading all required chunks:

```sh
node restore/assemble.js --snapshot . --dry-run
node restore/assemble.js --snapshot . --apply
node restore/restore.js --snapshot . --verify
bash RESTORE-LINUX.sh --snapshot . --target /new/isolated-streamvault --dry-run
bash RESTORE-LINUX.sh --snapshot . --target /new/isolated-streamvault --private-key /secure/recovery-identity --apply
node restore/serve-frontend.js --target /new/isolated-streamvault --port 18080 --dry-run
node restore/serve-frontend.js --target /new/isolated-streamvault --port 18080 --apply
```

Use RESTORE-MACOS.sh on macOS. PowerShell uses named parameters:

```powershell
./RESTORE-WINDOWS.ps1 -Snapshot . -Target C:/Recovery/streamvault-stage2 -DryRun
./RESTORE-WINDOWS.ps1 -Snapshot . -Target C:/Recovery/streamvault-stage2 -PrivateKey C:/Secure/recovery-identity -Apply
```

Only restore into a new isolated directory. Stop its own server with Ctrl-C. Existing production remains untouched. Do not attempt backend/database recovery from this incomplete snapshot. Backend, database and persistent directories contain explicit MISSING.md markers rather than fabricated archives.

## External dependencies and exclusions

The active Hostinger tree capture excludes no inventoried file, including bundled catalogs, cached metadata, static posters, source, lockfiles and dependencies. External media on FTP/CDN/Drive/private upstream hosts is not backed up; no claim is made to preserve source video files outside the deployed tree. URLs and mappings present in captured files/API observations are encrypted with the archive. Reachability and continued ownership of external media providers are separate recovery dependencies. Current backend disk inventory is inaccessible, so its media exclusions and persistent file count are unknown. FTP does not expose ACLs, xattrs or Windows alternate streams.

## Access needed to finish

1. Restore the existing local Tailscale connection and authorized Windows SSH management access, so its exact deployed files, runtime, env, tasks and persistent state can be captured read-only.
2. Enable current authorized read-only database backup access from an approved connection or tunnel. Do not paste credentials into chat.
3. Restore access to the specifically authorized Chrome profile for UI/decoded playback/download acceptance.
4. Provide an existing authorized connection to current Cloudflare tunnel and zone configuration and the external Hostinger persistent poster path.

After those captures, make a new uniquely versioned supplement, verify a clean full-service restore, resolve the recorded Live TV failure, repeat acceptance tests and only then consider promotion. This capture is a useful verified component backup, **not a complete current production disaster-recovery guarantee**.
