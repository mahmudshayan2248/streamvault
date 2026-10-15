#!/usr/bin/env bash
set -euo pipefail
snapshot_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$snapshot_dir/RESTORE-LINUX.sh" "$@"
