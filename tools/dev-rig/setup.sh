#!/bin/bash
# Sets up a local test rig: Navidrome 0.58.5 with a generated library (4 albums,
# 29 tracks, covers, .lrc lyrics) and the Playwright driver for screenshots.
# Usage: [PORT=4533] RIG=/tmp/clearplay-rig tools/dev-rig/setup.sh     (admin / test1234 on 127.0.0.1:$PORT)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
RIG="${RIG:-/tmp/clearplay-rig}"
PORT="${PORT:-4533}"
ND_VER=0.58.5
mkdir -p "$RIG/nd/data" "$RIG/music" "$RIG/shots"
if [ ! -x "$RIG/nd/navidrome" ]; then
  curl -sL "https://github.com/navidrome/navidrome/releases/download/v${ND_VER}/navidrome_${ND_VER}_linux_amd64.tar.gz" | tar xz -C "$RIG/nd"
fi
cat > "$RIG/nd/navidrome.toml" <<TOML
MusicFolder = "$RIG/music"
DataFolder = "$RIG/nd/data"
Address = "127.0.0.1"
Port = $PORT
LogLevel = "warn"
EnableInsightsCollector = false
DevAutoCreateAdminPassword = "test1234"
Scanner.Schedule = "0"
TOML
if [ -z "$(ls -A "$RIG/music")" ]; then
  pip install -q --break-system-packages pillow mutagen >/dev/null 2>&1 || true
  python3 "$HERE/make_library.py" "$RIG/music"
fi
(cd "$HERE" && npm install --silent --no-audit --no-fund)
PORT="$PORT" RIG="$RIG" "$HERE/navidrome.sh"
curl -s "http://127.0.0.1:$PORT/rest/startScan?u=admin&p=test1234&v=1.16.1&c=rig" >/dev/null
echo "rig ready in $RIG"
