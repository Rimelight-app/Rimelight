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

The ClearPlay logo (`src/app/components/glass/logo.tsx`) is original.

The icons in `build/` and `resources/` are still the upstream Aonsoku icons and
will be replaced with original ones.
