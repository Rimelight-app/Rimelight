#!/bin/bash
# Embedded lyrics of a local song in the built app (pnpm electron:build first; needs ffmpeg).
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE" && xvfb-run -a -s "-screen 0 1600x1000x24" node e2e-local-lyrics.mjs 2>&1 | grep -E "^(PASS|FAIL)|passed,|Error"
