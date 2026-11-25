#!/bin/bash
# One full device run: the 12 Continue cases, then the section 0/A/C/D device checks.
# Usage: ANDROID_SERIAL=emulator-5554 OUT=/path/prefix tools/e2e/run_all.sh
cd "$(dirname "$0")"
RESULTS="$OUT-e2e.json" python3 handoff_e2e.py > "$OUT-e2e.log" 2>&1; e=$?
RESULTS="$OUT-device.json" python3 device_checks.py > "$OUT-device.log" 2>&1; d=$?
echo "e2e exit $e, device exit $d"
