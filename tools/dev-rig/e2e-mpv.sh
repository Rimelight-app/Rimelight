#!/bin/bash
# Automated test of the mpv (bit-perfect) engine with a pretend USB DAC
# (pnpm electron:build first; needs mpv installed). Usage: e2e-mpv.sh [filter]
HERE="$(cd "$(dirname "$0")" && pwd)"
"$HERE/navidrome.sh" >/dev/null
cd "$HERE" && dbus-run-session -- xvfb-run -a -s "-screen 0 1600x1000x24" node e2e-mpv.mjs "$@" 2>&1 | grep -E "^(PASS|FAIL)|passed,|Error|page errors" -A0
