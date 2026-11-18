# ClearPlay

A minimal, frosted-glass desktop player for self-hosted
[Navidrome](https://www.navidrome.org/) (OpenSubsonic) servers.
Linux (AppImage, deb) and Windows (installer).

> Status: early. Stage 0 is a rename of the upstream app; the new design lands in later stages. See `CHANGELOG.md`.

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

## CI

GitHub Actions builds Linux and Windows packages on every push and tag, and attaches them as workflow artifacts. Tags starting with `v` also create a GitHub release.

## Licence

MIT. Copyright (c) 2026 Victor Alves (upstream Aonsoku); ClearPlay modifications by tonihk00.
