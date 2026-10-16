# Recovery instructions — partial snapshot

## Prerequisites

Retain the separate SSH Ed25519 private identity whose public fingerprint is `SHA256:PaUabO3vIdrkH8ojX37muA7Qrx0xfrzyWHMCsQtq82Q`. It is deliberately not in Drive or GitHub. The encrypted snapshot cannot be restored without it. Use a clean machine with Node.js 22+, Python 3.12+ and adequate disk space. The toolkit includes SHA-verified age binaries for Windows, Linux and macOS, x64 and arm64. Other architectures require an independently verified age binary.

## Download and assemble

Download and unpack the toolkit, then download every archive or numbered part from the private Drive folder. Keep MANIFEST.json, TRANSFER-MANIFEST.json, restore/, tools/ and archives/ together. Place numbered parts under transfers/ or flat in the snapshot directory.

```sh
node restore/assemble.js --snapshot . --dry-run
node restore/assemble.js --snapshot . --apply
node restore/restore.js --snapshot . --verify
```

Assembly verifies each part and the reconstructed archive SHA-256 before atomic rename. Repeating a successful assembly verifies the existing result. If interrupted, remove only the locally created incomplete `.part` output before retrying; never remove source chunks.

## Restore captured Hostinger application into a new directory

```sh
bash RESTORE-LINUX.sh --snapshot . --target /new/isolated-streamvault --dry-run
bash RESTORE-LINUX.sh --snapshot . --target /new/isolated-streamvault --private-key /secure/recovery-identity --apply
# macOS: use RESTORE-MACOS.sh with the same arguments.
# Windows PowerShell:
./RESTORE-WINDOWS.ps1 -Snapshot . -Target C:/Recovery/streamvault-stage2 -DryRun
./RESTORE-WINDOWS.ps1 -Snapshot . -Target C:/Recovery/streamvault-stage2 -PrivateKey C:/Secure/recovery-identity -Apply
```

Use a NEW directory whose parent already exists. Scripts verify all artifact hashes, decrypt and verify the tar hash, safely extract and check captured member hashes. Existing unrelated targets are refused. Matching completed restores are hash checked and reused. Original ownership and permissions remain recorded in the archive; safe extraction uses the current user and may restrict write permissions. Windows real-payload symlinks can require Developer Mode or administrator privileges; the CI fixtures do not prove Windows restoration of this production symlink set.

```sh
node restore/serve-frontend.js --target /new/isolated-streamvault --port 18080 --dry-run
node restore/serve-frontend.js --target /new/isolated-streamvault --port 18080 --apply
```

The launcher checks the captured server hash and forces its listener onto 127.0.0.1. This serves captured static pages and assets only; their production API URLs are preserved, so browser playback is not an offline backend restoration. Stop this test process with Ctrl-C. No service is installed by the default restore.

## Hostinger migration

The full runtime archive retains public_html/.htaccess, hbuilds/config, the active version and current symlink. Review encrypted configuration privately, adapt absolute account paths, Node 22 executable, domain, Passenger startup and document root for the NEW host. Do not upload unchanged old account paths blindly. Preserve captured dependencies; source installation may require network/native platform rebuilds. Validate on a new hostname before changing routing. No production deployment was performed.

## Docker and service templates

restore/compose.frontend.yml and Dockerfile.frontend are templates, not tested container deployments. Docker was unavailable locally. Set frontend path/context for the restored captured tree. Use docker compose config for review before an isolated build/up. compose.full.template.yml, systemd and Windows task registration are incomplete templates: backend/env/database/persistent captures are missing. The Windows registration helper defaults to dry-run and never starts a task. Do not use templates to replace current production.

## Database and backend

No current database dump or backend artifact exists. The restore tool refuses missing backend components. Database import scaffolding is untested and restricted to a new local sv_restore_* schema; it cannot recover state absent from this snapshot. Obtain current read-only consistent backups before any full-service recovery. Git history and HTTP bodies are not substitutes.

## Private archives and reference history

Use the bundled platform age binary to decrypt private-config.tar.gz.age or observations.tar.gz.age into a private scratch directory, verify plaintext_sha256 from MANIFEST.json, inspect tar paths before extraction and restrict permissions. The private configuration archive holds current FTP capture access and accessible Hostinger config, not the missing Windows/tunnel environment. Observations contain API responses/media URLs and are encrypted. The Git bundle decrypts to a standard complete Git bundle; verify with git bundle verify, then clone into a new directory. It is source history only.

## Rollback

Tests create new isolated directories only. Stop only their own process, retain reports, and remove or archive those new directories if unwanted. No production rollback is needed because production files, services, DNS and databases were not changed. Do not reset the existing working tree or overwrite Golden Stage 1. A production migration requires complete current state and separate routing planning.
