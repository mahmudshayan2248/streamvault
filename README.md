# StreamVault Golden Stable — 2026-10-02

This reference indexes a verified production capture. It is not a deployment commit or a production restore.

- Private snapshot: owner-only Google Drive folder named STREAMVAULT-GOLDEN-STABLE-2026-10-02-PRIVATE.
- Manifest: MANIFEST.json, SHA-256 015e4a75a3c16768d8c1de5e90c60018d6b35d31347e8caee3aee605d3609dfb.
- Active Hostinger frontend: hbuilds/current -> versions/aa25f91-hls-delivery-v1; 255 captured files. The frontend archive SHA-256 is 4706fb1fdb5ff181d2071dbf02d1bc0d3669d91601c906a7522d394f6d60f666.
- Active Windows backend: archived code, data, posters, non-video files, Startup script, and private runtime configuration. The private manifest lists every archive and file hash.
- MariaDB: consistent snapshot of five tables and 620,041 rows, completed 2026-10-02T17:17:30Z. The compressed SQL SHA-256 is 237b50b54bb3c05b937a05c3aa696fb09d8a5e3cfce7da6f1c06b3b7c16c9f86.
- Verification: 5,440 tar member hashes, 111 local checksum entries, ten owner-only Drive archive readbacks, and five metadata readbacks passed.

Retrieve the owner-only private snapshot and follow STABLE-RESTORE.md. Verify MANIFEST.sha256 and SHA256SUMS before any staging or restore. The capture spans more than one host and is not an atomic cross-host transaction. No production files, database rows, deployment, or service was changed for this reference.

