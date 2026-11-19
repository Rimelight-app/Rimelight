#!/bin/bash
# Starts the rig's Navidrome if it is not already answering.
RIG="${RIG:-/tmp/clearplay-rig}"
PORT="${PORT:-4533}"
PING="http://127.0.0.1:$PORT/rest/ping?u=admin&p=test1234&v=1.16.1&c=rig"
if ! curl -s -o /dev/null "$PING"; then
  (cd "$RIG/nd" && nohup ./navidrome --configfile navidrome.toml > nd.log 2>&1 &)
  for i in $(seq 1 20); do sleep 1; curl -s -o /dev/null "$PING" && break; done
fi
echo navidrome up
