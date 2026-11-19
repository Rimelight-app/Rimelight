# Notice

ClearPlay is a fork of **Aonsoku** (https://github.com/victoralvesf/aonsoku),
Copyright (c) 2026 Victor Alves, released under the MIT licence.
The original licence text is kept unchanged in `LICENSE.txt` and must stay with
every copy or substantial portion of this software.

The fork was started from upstream commit `13343e3` (v0.15.0).

## Design

ClearPlay's visual design (frosted-glass look, layout, icons, copy) is original
work. No code, assets or design files from the Liner player (tryliner/desktop)
are used.

## Third-party components

Dependencies are installed from npm and keep their own licences; see
`package.json` and `pnpm-lock.yaml`.

- **Inter** typeface, Copyright 2016 The Inter Project Authors, SIL Open Font
  Licence 1.1 (`licenses/Inter-OFL-1.1.txt`), via `@fontsource-variable/inter`.
- **Lucide** icons (ISC licence), via `lucide-react`.
- **music-metadata** (MIT licence, Copyright Borewit), bundled into the app to
  read tags, lyrics and cover art from local music files. Its dependencies are
  MIT-licensed except `ieee754` (BSD-3-Clause, Copyright 2008 Fair Oaks Labs, Inc.).
  Their licence texts are in `licenses/music-metadata/` (`@tokenizer/token` is
  MIT per its package.json and ships no licence file).

The ClearPlay logo (`build/icon.svg`, `src/app/components/glass/logo.tsx`) was supplied by the project owner.

