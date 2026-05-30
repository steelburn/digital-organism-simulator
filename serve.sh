#!/usr/bin/env bash
set -euo pipefail

# Serve files from the project directory (where this script lives).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${1:-5050}"
python3 -m http.server "$PORT" --bind 127.0.0.1
