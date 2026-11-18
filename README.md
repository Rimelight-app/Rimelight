# ClearPlay

A minimal, frosted-glass desktop player for self-hosted
[Navidrome](https://www.navidrome.org/) (OpenSubsonic) servers.
Linux (AppImage, deb) and Windows (installer).

> Status: 0.1.0, first usable release. See `CHANGELOG.md`.

## Features

- Frosted-glass interface over a blurred copy of the current cover, Inter font, rounded panels.
- Icon rail (Home, Search, Library, Settings); library tabs for albums, artists, songs, playlists, favourites and genres.
- Fullscreen now-playing view with a cover-colour gradient and synced lyrics from your server.
- Queue, shuffle, repeat, favourites, playlists, search (`Ctrl+K`), scrobbling to Navidrome.
- OS media controls through the system media session (MPRIS on Linux, SMTC on Windows).
- Settings → Appearance → *Reduce visual effects* for slower GPUs.

Based on [Aonsoku](https://github.com/victoralvesf/aonsoku) (MIT). See `NOTICE.md` and `LICENSE.txt`.

## Run from source

Requirements: Node.js 24, pnpm 11.9 (`corepack enable`).

```bash
pnpm install
pnpm electron:dev        # development with hot reload
pnpm lint                # lint
pnpm exec tsc --noEmit   # typecheck
```

On first start, enter your server URL (for example your Tailscale address such as `http://100.x.y.z:4533`), username and password.

## Build installers

```bash
pnpm electron:build      # compile main + renderer into out/
pnpm build:linux         # dist/ClearPlay-v*-linux-x64.AppImage and .deb
pnpm build:win           # Windows installer (best run on Windows or via CI)
```

The AppImage needs `libfuse2` on some distributions.

## Download

Installers are attached to each [release](https://github.com/tonihk00/ClearPlay/releases): `.AppImage` and `.deb` for Linux, `Setup .exe` for Windows. The Windows installer is unsigned, so SmartScreen may warn on first run (*More info → Run anyway*).

## CI

GitHub Actions builds Linux and Windows packages on every push and attaches them as workflow artifacts. When a push to `main` carries a `version` in `package.json` that has no release yet, the workflow tags it (`v<version>`) and publishes a GitHub release with the installers. To release: bump the version, add a CHANGELOG entry, push.

## Licence

MIT. Copyright (c) 2026 Victor Alves (upstream Aonsoku); ClearPlay modifications by tonihk00.
