# Tools

Developer scripts. None of these are part of the app build.

| Path | What it does |
|---|---|
| `dev-rig/setup.sh` | Local Navidrome 0.58.5 + generated test library (4 albums, 29 tracks, covers, `.lrc` lyrics) + Playwright driver. `RIG=/tmp/clearplay-rig tools/dev-rig/setup.sh`; login admin / test1234 at `http://127.0.0.1:4533`. Needs ffmpeg, python3 (pillow, mutagen), node, xvfb-run. |
| `dev-rig/run.sh` | Screenshots of the built app (`pnpm electron:build` first): `tools/dev-rig/run.sh /tmp/shots go=/library/albums clicktext="Neon Tides" shot=album`. Steps: `go= click= clicktext= dblclicktext= key= wait= shot= eval= mainjs=`; `SCALE=2` for 2x. |
| `dev-rig/navidrome.sh` | Starts the rig's Navidrome if it is down. |
| `make_logo.py` | Regenerates `build/icon.svg`, `public/clearplay-logo.svg` and every icon PNG/ICO from the logo geometry: `python3 tools/make_logo.py .` |
| `symfonium/make_symfonium.py` | Writes the colour theme `themes/symfonium/ClearPlay-Glass.json`. |
| `symfonium/make_symfonium_style.py` | Builds `ClearPlay-Glass-Style.json`: `python3 tools/symfonium/make_symfonium_style.py <tidal-base.json> themes/symfonium/ClearPlay-Glass-Style.json <Inter.ttf> <apple-music.json>`. The two input styles are third-party exports (TIDAL For Symfonium 3.1.0 by Myke, Apple Music for Symfonium 2.5.0 by RoyalGuard) and are not stored here; download them from styles.symfonium.app. |
| `symfonium/make_iconpack.py` + `lucide_map.py` | Regenerates `symfonium-iconpack/` from the Symfonium icon-pack template and `lucide-static`. |
