StreamVault Haskell Details 7P PowerShell Safe Shadow Runner
============================================================

Status:

* Task type: tooling-only safety improvement
* Runtime/frontend/playback files changed: no

Problem:
PowerShell can stop when npm writes expected schema-negative stderr during:
npm run details:shadow:all

Fix:
Adds:

* tools/details-parity-v1/run-details-shadow-all-powershell-safe.ps1
* npm run details:shadow:all:pssafe

Purpose:
Capture stdout/stderr safely through cmd.exe and preserve the real npm exit code.
