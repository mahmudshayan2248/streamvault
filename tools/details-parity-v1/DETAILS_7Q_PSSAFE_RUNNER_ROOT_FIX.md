StreamVault Haskell Details 7Q PowerShell Safe Runner Root Fix
==============================================================

Status:

* Task type: tooling-only fix
* Runtime/frontend/playback files changed: no

Fix:
Replaces the brittle Resolve-Path repo root calculation with Split-Path parent traversal.

Reason:
The first PowerShell-safe runner resolved repo root incorrectly on Windows and failed before running the details shadow suite.
