#!/bin/bash
# Screenshots of the built app. Rebuild first: pnpm electron:build
# Usage: tools/dev-rig/run.sh <outdir> step...   (SCALE=2 for 2x)
# Steps: go=<hash route> click=<selector> clicktext=<text> dblclicktext=<text>
#        hover=<selector> rclick=<selector> rclicktext=<text> mouse=<x,y>
#        snap=<name> (screenshot without the settle wait, for animations)
#        key=<key> wait=<ms> shot=<name> eval=<renderer js> mainjs=<main-process js>
# Example: run.sh /tmp/shots go=/library/albums clicktext="Neon Tides" shot=album
HERE="$(cd "$(dirname "$0")" && pwd)"
"$HERE/navidrome.sh" >/dev/null
cd "$HERE" && xvfb-run -a -s "-screen 0 1600x1000x24" node shoot.mjs "$@" 2>&1 \
  | grep -E "saved|failed|pageerror|console\]|eval:|main:|Error" | grep -v "Failed to load resource" | head -40
