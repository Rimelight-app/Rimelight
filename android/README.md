# ClearPlay for Android

The ClearPlay frosted-glass player for Navidrome / OpenSubsonic, as a native Android app.
Kotlin, Jetpack Compose, Media3 (ExoPlayer + MediaLibraryService), Coil, Haze, Ktor.
Same design tokens as the desktop `.glass` theme (`src/themes.css`).

Status: **1.5.3** — see `CHANGELOG.md`.

## Build

Needs JDK 17 and the Android SDK (platform 37, build-tools 36).

```sh
cd android
echo "sdk.dir=$HOME/android-sdk" > local.properties   # once
./gradlew assembleDebug            # app/build/outputs/apk/debug/
./gradlew testDebugUnitTest        # logic tests + screenshot tests
./gradlew recordRoborazziDebug     # writes screenshots to app/build/screens/
./gradlew --stop                   # free the memory afterwards
./gradlew assembleRelease -PcpReleaseSuffix=.rtest   # release-speed test build next to the real app
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
  data/ScrobbleQueue       listens waiting for the server (offline plays), kept in a file
  player/SourceRouter      playback source per song: download or server
  player/BitPerfect        USB DAC bit-perfect output (Android 14 mixer attributes) + output path shown in the player
  player/HiResAudioRenderer  float decoding only for songs above 16 bits
  player/PcmTap           debug-only capture of the PCM sent to the output (sample checks)
  player/QueueStore        the queue as last left (filesDir/queue.json) for playback resumption
  player/QueueWatcher      service-side listener: saves the queue, feeds Continue, Resume shortcut
  player/QueueFiller       shuffle library's refill, on the service's player
  player/QueueHandoff      Continue on other devices: the rules, ported line by line from desktop 0.6.0
  player/Handoff           Continue on other devices at run time (saves, look, offer, left behind)
  data/LibraryCache        first page of each library list on disk, per account
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

## Bit-perfect output

`PlaybackService` uses a `DefaultAudioSink` with float output, and `HiResAudioRenderer` asks the decoder
for float only for songs above 16 bits (24-bit FLAC stays exact: the platform decoder gives
`sample / 2^(bits-1)`). 16-bit songs decode to 16-bit integers: float output for them played as noise
on a Galaxy S24 (1.5.0). The sink output is wrapped by `BitPerfectOutputProvider`. With the setting on
and a USB DAC attached (API 34+), it picks the DAC's `MIXER_BEHAVIOR_BIT_PERFECT` format with the song's
rate and channels (32-bit, then 24-bit packed, then float; 16-bit only for 16-bit songs), sets it with
`AudioManager.setPreferredMixerAttributes` before the AudioTrack opens, and converts the samples
to that format (exact, tested in `BitPerfectTest`). Volume stays at full scale.
**Anything that changes samples (ReplayGain, EQ, crossfade, speed) must be off while it is on**:
list it in `Settings.alteringSamples()`.

Phones without bit-perfect modes (Samsung One UI, many OEM/Lineage builds) still offer normal
(`MIXER_BEHAVIOR_DEFAULT`) mixer attributes for the DAC; then the same call sets the mixer to the song's
rate and depth ("No resampling" in the player). The samples still pass the mixer, so this is not bit-perfect.

Media3 fades in the first 20 ms after a start, seek or output change (against clicks); it can't be
turned off. Everything after that is exact, including gapless song changes at the same rate.

Settings → Player → USB DAC details shows what Android reports for the DAC (also logged under the
`ClearPlayBitPerfect` tag when bit-perfect can't be used).

**Checking the samples** (debug builds): `adb shell run-as com.tonihk00.clearplay.debug mkdir -p files/pcmtap`,
then `touch files/pcmtap/on` the same way and restart the app. `PcmTapProvider` then saves what the player
sends to the audio output in `files/pcmtap/<n>-<encoding>-<rate>.raw` (2 = 16-bit, 4 = float). Compare with
`ffmpeg -i song.flac -f s16le` (or `s32le` for 24-bit).

Check on a phone with a DAC: `adb shell dumpsys media.audio_flinger`. The USB output thread should
show the song's sample rate, and the track should be marked `BitPerfect true`.

## Testing against a server

Never test against a real library: ratings, likes and scrobbles change it. Use the
dev rig on another port, e.g. `PORT=4544 RIG=~/clearplay-rig tools/dev-rig/setup.sh`;
the emulator reaches it at `http://10.0.2.2:4544` (admin / test1234).

### Continue on other devices, end to end

`tools/e2e/` drives the app through its UI (adb + `uiautomator dump`) against the rig's
Navidrome 0.64.2, with `pretend_desktop.mjs` playing ClearPlay desktop (c=ClearPlay) using the
desktop's own rules (`git show v0.6.0:src/service/queue-handoff.ts > rules.ts`, Node 22.18+):

```sh
cd android/tools/e2e
ANDROID_SERIAL=emulator-5554 RULES=/path/to/rules.ts python3 handoff_e2e.py        # the 12 cases
ANDROID_SERIAL=emulator-5554 python3 device_checks.py   # Android 17 audio, resumption, shortcuts, Statistics
```

The shared rule cases (`app/src/test/resources/queue-handoff-cases.json`) are a byte-for-byte
copy of the desktop's; change them there first, then copy.

### Benchmarks and the Baseline Profile

```sh
./gradlew :benchmark:connectedBenchmarkReleaseAndroidTest   # startup, Albums fling, player → lyrics
./gradlew :app:generateBaselineProfile                       # before a release: regenerates
                                                             # app/src/main/generated/baselineProfiles/
```

Both sign in to the rig through the login screen if needed (instrumentation arguments
`cpServer`, `cpUser`, `cpPassword`).
