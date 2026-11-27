#!/bin/bash
# Live album covers on every screen, in step, against a fake cover service.
# pnpm electron:build first. Usage: tools/dev-rig/e2e-live-covers.sh [name-filter]
# COST=1 measures renderer/GPU CPU over 60 s instead (no checks).
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE" && SIZE=1440x900 perf/xrun.sh node e2e-live-covers.mjs "$@" 2>&1 \
  | grep -E "^(PASS|FAIL)|passed,|Error|^\{|^  |^\}"
