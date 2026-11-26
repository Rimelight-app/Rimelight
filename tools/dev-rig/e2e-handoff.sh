#!/bin/bash
# "Continue on other devices" against the rig's Navidrome (0.64.2+) with a
# pretend phone app (HANDOFF_PHONE=ClearPlay-Android for one not updated
# yet). pnpm electron:build first.
# Usage: e2e-handoff.sh   (ENGINE=mpv for the mpv engine; needs mpv installed)
HERE="$(cd "$(dirname "$0")" && pwd)"
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}"
"$HERE/navidrome.sh" >/dev/null
cd "$HERE" && dbus-run-session -- xvfb-run -a -s "-screen 0 1600x1000x24" node e2e-handoff.mjs "$@" 2>&1 | grep -E "^(PASS|FAIL)|^      note|passed,|Error"
