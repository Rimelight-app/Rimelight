# Tools

Developer scripts. None of these are part of the app build.

| Path | What it does |
|---|---|
| `dev-rig/setup.sh` | Local Navidrome 0.58.5 + generated test library (4 albums, 29 tracks, covers, `.lrc` lyrics) + Playwright driver. `RIG=/tmp/clearplay-rig tools/dev-rig/setup.sh`; login admin / test1234 at `http://127.0.0.1:4533`. Needs ffmpeg, python3 (pillow, mutagen), node, xvfb-run. |
| `dev-rig/run.sh` | Screenshots of the built app (`pnpm electron:build` first): `tools/dev-rig/run.sh /tmp/shots go=/library/albums clicktext="Neon Tides" shot=album`. Steps: `go= click= clicktext= dblclicktext= rclicktext= hover= mouse= clickat= jitterclick= key= wait= shot= snap= eval= mainjs=`; `SCALE=2` for 2x. |
| `dev-rig/e2e.sh` | Automated click-through test of the built app against the rig: plays, skips, seeks, likes, rates, uses the song menus, drags in the queue, the fullscreen player, navigation, settings. Prints PASS/FAIL per check; `tools/dev-rig/e2e.sh "queue"` runs only matching checks. |
| `dev-rig/soak.mjs` | Long-run check of the fullscreen player: `xvfb-run -a node tools/dev-rig/soak.mjs <minutes>` logs FPS, JS heap, DOM nodes, listeners and GPU-process CPU each minute (`EVERY=10` for every 10 s). |
| `dev-rig/navidrome.sh` | Starts the rig's Navidrome if it is down. |
| `make_logo.py` | Regenerates `build/icon.svg`, `public/clearplay-logo.svg` and every icon PNG/ICO from the logo geometry: `python3 tools/make_logo.py .` |
