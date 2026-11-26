# Measuring and breakage scripts

The harness behind the 0.6.1 release (rebuilt from the 0.6.1 audit report).
Each script starts the **built** app (`pnpm electron:build`) against the rig's
Navidrome, clicks through it like a user, and prints what it measured. Results
are also written to `$RIG/perf-results/` as JSON. They're slow (minutes), so
they aren't in CI.

`make_big_library.py` and `fault-proxy.mjs` also work on their own, without
Electron or the rest of this folder. Rimelight for Android uses them from an
emulator (see below).

## Setup

Needs Node 22, pnpm, ffmpeg, python3 with Pillow, xvfb-run, openbox,
dbus-run-session and (for `ENGINE=mpv`) mpv.

```bash
pnpm install && pnpm electron:build
(cd tools/dev-rig && npm install)           # playwright-core, pngjs

# Navidrome 0.64.2 + the big library (about 15 s to write, 3 min to scan)
RIG=/tmp/rimelight-rig
mkdir -p $RIG/nd/data && (cd $RIG/nd && curl -sL https://github.com/navidrome/navidrome/releases/download/v0.64.2/navidrome_0.64.2_linux_amd64.tar.gz | tar xz)
python3 tools/dev-rig/make_big_library.py $RIG/music $RIG/local
#   navidrome.toml as in tools/dev-rig/setup.sh, with MusicFolder = $RIG/music
RIG=$RIG tools/dev-rig/navidrome.sh
curl "http://127.0.0.1:4533/rest/startScan?u=admin&p=test1234&v=1.16.1&c=rig"
```

`make_big_library.py MUSIC [LOCAL] [--artists 2000] [--albums 5000] [--songs-per-album 10]`
writes 50 538 short tagged MP3s (5 006 albums, 2 004 artists, every 50th album
without a cover) plus:

| What | For |
|---|---|
| "Big Playlist 10000", "Playlist 300" (`.m3u`, imported by Navidrome) | big tables |
| "Big Album" (500 songs), "Three Discs" (3 × 8) | big tables, disc headers |
| "Three Hours" (one 3-hour song) | fullscreen, idle |
| "Fault Test" (5 real 20 s songs) | fault proxy cases |
| "Audit Test / Comment Injection" (a script in the comment tag; a normal comment with a link) | sanitizer |
| "Names" (Cyrillic, Japanese, Hebrew, Arabic, emoji, 300 characters) | layout |
| `LOCAL/`: 20 real songs and 5 corrupt files | "Music on this computer" |

## Running

All from `tools/dev-rig`. `xrun.sh` runs a script under Xvfb + openbox with a
session bus and starts Navidrome if needed.

Common settings (environment): `PROFILE=normal|cpu4|nogpu` (`cpu4` slows only
the renderer's JavaScript, through CDP), `ENGINE=html|mpv`, `SIZE=1920x1080`,
`USERDATA=<profile dir>`, `FRESH=1` (empty profile),
`RIMELIGHT_APP=<another build>` and `ELECTRON_BIN=<its electron>` to measure
an older version (e.g. a `git worktree` of `v0.6.0`).

| Script | Measures / checks | Command |
|---|---|---|
| `bigopen.mjs` | Opening a big table: ms until rows show, longest task, rows rendered at most, renderer peak memory. `TARGET=playlist` (10 000), `album500`, `playlist300`, `multidisc`; `FROM=home|albums|genres`; `OPENS=3` | `TARGET=playlist perf/xrun.sh node perf/bigopen.mjs` |
| `tables.mjs` | The 10 000-song playlist scrolls to its end; Back/Forward scroll; search in a playlist; disc headers; row context menu; selection | `perf/xrun.sh node perf/tables.mjs` |
| `fullscreen.mjs` | Fullscreen player: frames per second, CPU of each process (GPU process included, % of one core). `VARIANT=asis|noblur|blur` | `SIZE=1920x1080 perf/xrun.sh node perf/fullscreen.mjs` |
| `fs-pixels.mjs` | Pixel comparison of the fullscreen sheet with its blur forced on, off and as built, on a frozen clock: open animation, still, song change. Screenshots in `$RIG/perf-results/fs-pixels/` | `SIZE=1280x720 perf/xrun.sh node perf/fs-pixels.mjs` |
| `requests.mjs` | Requests counted at the server (through the fault proxy): Stats left after 1 s, Stats heap peak, Stats with a dropped page, Albums after 5 pages and Back, covers for the media controls over 60 s and 10 play/pauses. `SCENARIO=stats|albums|media|all` | `perf/xrun.sh node perf/requests.mjs` |
| `imgcache.mjs` | Blob URLs and main-process memory while scrolling Albums (the old "Cache images" setting). `COMMENT=1`: the comment-injection album, `window.open` / `location.href` with `shell.openExternal` stubbed | `COMMENT=1 perf/xrun.sh node perf/imgcache.mjs` |
| `csp.mjs` | Every view, settings page and panel with the console open: CSP violations and page errors; an HLS animated cover through hls.js; a faked update's release notes. Once per engine | `ENGINE=mpv perf/xrun.sh node perf/csp.mjs` |
| `startup.mjs` | Startup JS (from the built `index.html`), main start → first paint and → home covers, renderer reload → first paint, `mpv --version` runs during launch | `PROFILE=cpu4 perf/xrun.sh node perf/startup.mjs` |
| `break.mjs` | Fault cases, PASS/FAIL: 404 on song 3, three 404s, server down mid-queue, corrupt local file first, page errors (500 / bad JSON / 40 / 70), start with the server off, last song ends. `CASES=…` | `ENGINE=html perf/xrun.sh node perf/break.mjs` |
| `covers.mjs` | Songs without a cover: media-controls artwork and console warnings | `perf/xrun.sh node perf/covers.mjs` |
| `handoff-quit.mjs` | Desktop saves, a fake ClearPlay-Android saves after it, the desktop quits untouched: the server keeps the phone's queue | `perf/xrun.sh node perf/handoff-quit.mjs` |
| `radio.mjs` | Start radio from a song, an album, an artist and Ctrl+K; nothing found keeps the queue | `ENGINE=mpv perf/xrun.sh node perf/radio.mjs` |

Not rebuilt from the audit (their fixes weren't in 0.6.1): the idle CPU
matrix, the React re-render counter, the memory soak and the local-library
scan timings.

## Fault proxy (also for Rimelight for Android)

Plain Node 18+, no dependencies. It sits between a client and a real server
and breaks chosen requests.

```bash
node perf/fault-proxy.mjs --listen 127.0.0.1 --port 4534 \
  --upstream http://127.0.0.1:4533 --rule 'stream:id=<songId>:404'
# or: FAULT_LISTEN, FAULT_PORT, FAULT_UPSTREAM, FAULT_RULES='["getAlbum:500"]'
node perf/fault-proxy.mjs --help
```

Rules: `ENDPOINT[:key=value...]:ACTION[:times=N][:after=N]`, where ACTION is an
HTTP status, `badjson`, `errorNN` (a Subsonic error, e.g. `error40`,
`error70`), `drop`, `hang`, `delay=MS` or `down` (every request dropped, like
the server being off). `*` matches every endpoint. Examples:
`getAlbum:500`, `search3:drop:after=3`, `'*:down'`.

Change the rules while a test runs: `POST /__fault/rules` with a JSON array,
`POST /__fault/clear`, `GET /__fault/log` (requests per endpoint, faults
applied, the last 5 000 requests), `POST /__fault/log/reset`.

**Android emulator:** the emulator reaches the computer at `10.0.2.2`. Start
the proxy with `--listen 0.0.0.0 --port 4534` and log the app in to
`http://10.0.2.2:4534`. `make_big_library.py` needs nothing but Python, Pillow
and ffmpeg: point Navidrome at its output as above.
