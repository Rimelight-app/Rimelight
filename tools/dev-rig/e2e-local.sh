#!/bin/bash
# Test of "music on this computer" with the built app (pnpm electron:build first).
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE" && xvfb-run -a -s "-screen 0 1600x1000x24" node e2e-local.mjs 2>&1 | grep -E "^(PASS|FAIL)|passed,|Error"
