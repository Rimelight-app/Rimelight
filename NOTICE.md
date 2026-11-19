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

The ClearPlay logo (`build/icon.svg`, `src/app/components/glass/logo.tsx`) was supplied by the project owner.


## Android app (`android/`)

Original code under the MIT licence, like the desktop app. No code, assets or
design from Liner, and no GPL code (Tempus, Ultrasonic, Tempo and similar apps were
not used). Licence texts shipped inside the APK are in
`android/app/src/main/assets/licenses/`.

Bundled in the app:

- **Inter** typeface (SIL Open Font Licence 1.1), static TTFs from the Inter 4.1 release
  (`android/app/src/main/res/font/`).
- **Lucide** icons (ISC licence), the vector drawables from `symfonium-iconpack/`.
- **AndroidX** (Core, Activity, Lifecycle, Navigation, DataStore), **Jetpack Compose**
  (UI, Foundation, Material 3) and **Media3** (ExoPlayer, Session, OkHttp data source),
  Apache License 2.0.
- **Kotlin** standard library, **kotlinx.coroutines** and **kotlinx.serialization**,
  Apache License 2.0.
- **Ktor** client (OkHttp engine), Apache License 2.0.
- **OkHttp** / **Okio** (via Ktor, Coil and Media3), Apache License 2.0.
- **Guava** (via Media3), Apache License 2.0.
- **Coil 3** (image loading), Apache License 2.0.
- **Haze** and **Haze Blur** by Chris Banes (glass blur for the mini player),
  Apache License 2.0.

Used only to build and test, not shipped in the APK:

- Android Gradle Plugin, Kotlin Gradle plugins: Apache License 2.0.
- **Robolectric** (MIT) and **Roborazzi** (Apache License 2.0) for screenshot tests.
- **Ktor client mock** (Apache License 2.0) for the fake server in tests.
- **JUnit 4** (Eclipse Public License 1.0), required by Robolectric's test runner.

## Symfonium icon pack (`symfonium-iconpack/`)

- Icons from [Lucide](https://lucide.dev), ISC licence (parts derived from Feather, MIT); see `symfonium-iconpack/LICENSE-Lucide.txt`.
- Project structure from [symfonium-icon-pack-template](https://github.com/Tolriq/symfonium-icon-pack-template), MIT licence; see `symfonium-iconpack/LICENSE`.
