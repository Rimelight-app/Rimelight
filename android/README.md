# ClearPlay for Android

The ClearPlay frosted-glass player for Navidrome / OpenSubsonic, as a native Android app.
Kotlin, Jetpack Compose, Media3 (ExoPlayer + MediaLibraryService), Coil, Haze, Ktor.
Same design tokens as the desktop `.glass` theme (`src/themes.css`).

Status: **1.1** — stage 1 plus offline downloads, settings and sleep timer. See `CHANGELOG.md`.

## Build

Needs JDK 17 and the Android SDK (platform 37, build-tools 36).

```sh
cd android
echo "sdk.dir=$HOME/android-sdk" > local.properties   # once
./gradlew assembleDebug            # app/build/outputs/apk/debug/
./gradlew testDebugUnitTest        # logic tests + screenshot tests
./gradlew recordRoborazziDebug     # writes screenshots to app/build/screens/
./gradlew --stop                   # free the memory afterwards
```

`gradle.properties` keeps Gradle small (2 GB heap, 2 workers).

## Layout

```
app/src/main/java/com/tonihk00/clearplay/
  ClearPlayApp.kt          app graph (no DI framework), session, Coil setup
  data/api/                OpenSubsonic client (token auth), models, LRC parser
  data/ServerStore.kt      saved servers (DataStore; token + salt only, never the password)
  data/SongEdits.kt        likes and ratings, applied without rebuilding the queue
  player/PlaybackService   Media3 MediaLibraryService: notification, lock screen, Bluetooth
  player/PlayerConnection  MediaController wrapper: queue ops, shuffle library
  player/Scrobbler         now playing + submission after half the song or 4 min
  ui/theme/Theme.kt        design tokens (Cp.*), Inter, motion
  ui/components/           glass panels, covers, play/pause morph, stars, backdrop
  ui/library|search|player|login|settings/
```

## Design rules (same as the desktop)

- Base `hsl(240 14% 5%)`; surfaces are white at low alpha; 16 dp radius; Inter; Lucide at 1.75.
- The cover is blurred **once** into a 48 px bitmap (`Backdrop.kt`) and stretched; nothing
  large is blurred live. Haze blurs only the mini player.
- Controls animate in ~180 ms, screens in ~300 ms; the system "Remove animations" setting
  turns them off.

## Releases

`.github/workflows/android.yml` runs on changes under `android/`. A tag `android-vX.Y.Z`
publishes `ClearPlay-X.Y.Z.apk` as a GitHub release that is **not** marked latest,
so the desktop updater keeps seeing desktop releases.

Every release is signed with the same key, so each APK installs over the previous one
(versionCode is the workflow run number). A tag build fails if the key is missing.
The key lives outside the repo (`~/clearplay-android-signing/` on hp-server; back it up:
losing it means the next APK can't update the installed app). Repository secrets: `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## Stages

1. **Base app** (this): login, library (albums, artists, songs, playlists, favourites,
   genres), search, background playback with notification / lock screen / Bluetooth,
   queue (play next, add to end, clear keeping the playing song, shuffle library), likes,
   1–5 ratings, scrobbling, fullscreen player with synced lyrics.
2. Offline downloads, queue hand-off with the desktop, Android Auto, ReplayGain, EQ,
   sleep timer, bitrate cap.
3. AutoDJ, stats, widget, several servers.

## Testing against a server

Never test against a real library: ratings, likes and scrobbles change it. Use the
dev rig on another port, e.g. `PORT=4544 RIG=~/clearplay-rig tools/dev-rig/setup.sh`;
the emulator reaches it at `http://10.0.2.2:4544` (admin / test1234).
