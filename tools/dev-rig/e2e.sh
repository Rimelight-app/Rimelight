#!/bin/bash
# Automated click-through test of the built app (pnpm electron:build first).
# Usage: tools/dev-rig/e2e.sh [name-filter]
HERE="$(cd "$(dirname "$0")" && pwd)"
"$HERE/navidrome.sh" >/dev/null
cd "$HERE" && xvfb-run -a -s "-screen 0 1600x1000x24" node e2e.mjs "$@" 2>&1 | grep -E "^(PASS|FAIL)|passed,|Error"
