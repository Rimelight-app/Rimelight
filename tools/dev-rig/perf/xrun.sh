#!/bin/bash
# Runs a measuring script under Xvfb + openbox (a window manager, so the app
# can be minimized, hidden and covered like on a desktop), with a session bus.
# Usage (from tools/dev-rig): SIZE=1920x1080 perf/xrun.sh node perf/<script>.mjs
# Starts the rig's Navidrome first if it isn't running.
HERE="$(cd "$(dirname "$0")" && pwd)"
"$HERE/../navidrome.sh" >/dev/null
SIZE="${SIZE:-1920x1080}"
W="${SIZE%x*}"; H="${SIZE#*x}"
export SIZE
exec dbus-run-session -- xvfb-run -a -s "-screen 0 $((W + 40))x$((H + 80))x24" \
  bash -c 'command -v openbox >/dev/null && (openbox >/dev/null 2>&1 &); sleep 0.5; "$@"' _ "$@"
