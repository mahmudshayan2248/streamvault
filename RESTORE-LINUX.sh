#!/usr/bin/env bash
set -euo pipefail
snapshot_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
command -v node >/dev/null || { echo 'Install Node.js 22+ first' >&2; exit 1; }
exec node "$snapshot_dir/restore/restore.js" --snapshot "$snapshot_dir" "$@"
