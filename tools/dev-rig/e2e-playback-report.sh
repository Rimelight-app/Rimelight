#!/bin/bash
# What the built app tells the server about playback (Navidrome's Now Playing),
# through a recording fake server. Needs Navidrome 0.64.2+ in the rig and
# pnpm electron:build first. Usage: e2e-playback-report.sh   (ENGINE=mpv for mpv)
HERE="$(cd "$(dirname "$0")" && pwd)"
"$HERE/navidrome.sh" >/dev/null
cd "$HERE" && dbus-run-session -- xvfb-run -a -s "-screen 0 1600x1000x24" node e2e-playback-report.mjs "$@" 2>&1 | grep -E "^(PASS|FAIL)|passed,|Error"
