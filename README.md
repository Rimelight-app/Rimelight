<div align="center">

<img src="build/icon.svg" width="96" height="96" alt="Rimelight logo">

# Rimelight

**A calm, frosted-glass music player for your [Navidrome](https://www.navidrome.org/) server, on your computer and your phone.**

Linux · Windows · Android · works with any OpenSubsonic server

[![Latest release](https://img.shields.io/github/v/release/Rimelight-app/Rimelight?style=flat-square&label=desktop&color=0b0b0e)](https://github.com/Rimelight-app/Rimelight/releases/latest)
[![Android release](https://img.shields.io/github/v/release/Rimelight-app/Rimelight?filter=android-v*&style=flat-square&label=android&color=0b0b0e)](https://github.com/Rimelight-app/Rimelight/releases/tag/android-v1.6.1)
[![Build](https://img.shields.io/github/actions/workflow/status/Rimelight-app/Rimelight/build.yml?style=flat-square&label=build)](https://github.com/Rimelight-app/Rimelight/actions)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-0b0b0e?style=flat-square)](LICENSE.txt)

<img src="docs/screenshots/album.jpg" alt="Album page in Rimelight" width="900">

<!-- VIDEO TO ADD (near the top, below the album shot or replacing it):
     docs/screenshots/lyrics.mp4 (or .gif), at most 10 s and 5 MB.
     Shot: 1280×800 window, a real album playing in the fullscreen player with synced lyrics
     scrolling for ~5 s. Alt text: "Synced lyrics gliding in Rimelight's fullscreen player". -->

</div>

Rimelight is a music player for Navidrome and other Subsonic / OpenSubsonic servers, for Windows, Linux and Android, with a frosted-glass interface, synced lyrics and bit-perfect playback. Start a song on one device and continue it on the other at the same second.

## Why Rimelight

You host your own music. Your player should feel as good as the streaming apps, without their clutter.

- **Looks like your music.** The current cover, softly blurred, tints the whole window. Panels are frosted glass with rounded corners, the type is Inter, and the motion is slow and quiet.
- **Lyrics that glide.** Time-synced lyrics from your own files, with the current line large and bright and the rest gently fading. They are available full screen or in a side panel on any page.
- **Built for a home server.** Save your home and Tailscale addresses and switch with one click, or let Rimelight pick the fastest one at start. Cap the streaming bitrate when you're away.
- **Knows your listening.** A Now Playing page with the album, the artist and their discography, plus statistics: hours listened, top artists, genres, songs and decades.
- **Continue on other devices.** Tap Continue on one device and it picks up the other's song at the same second, through your server, whether the other device is playing or paused. Works between Rimelight on the computer and Rimelight for Android. Apps that read Navidrome's saved queue, such as Symfonium, work too, from the position they last saved.
- **On your phone too.** Rimelight for Android has the same look, synced lyrics and statistics, plus offline downloads and bit-perfect output to a USB DAC.
- **Plays well with your other apps.** Plays go to Navidrome (and on to Last.fm/ListenBrainz), queued and retried if you're offline.

## Screenshots

| | |
|---|---|
| <img src="docs/screenshots/home.jpg" alt="Home page"> | <img src="docs/screenshots/fullscreen.jpg" alt="Fullscreen player with synced lyrics"> |
| **Home.** Featured, recently and most played | **Fullscreen player.** Cover, controls and synced lyrics |
| <img src="docs/screenshots/side-lyrics.jpg" alt="Artist page with the lyrics side panel"> | <img src="docs/screenshots/stats.jpg" alt="Listening statistics with the queue panel"> |
| **Artist page.** Biography, with lyrics in the side panel | **Statistics.** Hours, plays, top artists and genres, with the queue |

### Continue on other devices

| | |
|---|---|
| <img src="docs/screenshots/continue-desktop.jpg" alt="Rimelight on the computer offering to continue the song paused on the phone" width="520"> | <img src="docs/screenshots/continue-android.jpg" alt="Rimelight for Android offering to continue the song playing on the computer" width="250"> |
| **On the computer.** You paused on the phone a moment ago. Continue starts that song here, at the same second. | **On the phone.** The computer is playing. Continue here picks it up at the live second. |

### Rimelight for Android

| | | | | |
|---|---|---|---|---|
| <img src="docs/screenshots/android-album.jpg" alt="Android album page" width="170"> | <img src="docs/screenshots/android-now-playing.jpg" alt="Android now playing" width="170"> | <img src="docs/screenshots/android-lyrics.jpg" alt="Android synced lyrics" width="170"> | <img src="docs/screenshots/android-stats.jpg" alt="Android statistics" width="170"> | <img src="docs/screenshots/android-settings.jpg" alt="Android settings" width="170"> |
| **Album** | **Now playing** | **Lyrics** | **Statistics** | **Settings** |

**Rimelight for Android** is the same frosted-glass player on your phone. Get the APK from [the Android release](https://github.com/Rimelight-app/Rimelight/releases/tag/android-v1.6.1) (1.6.1). It was called ClearPlay for Android up to 1.6.0; 1.6.1 installs over it and keeps your login, queue, downloads and settings.

<!-- SCREENSHOTS TO ADD (desktop, real library, 1440×900 window):
     1. docs/screenshots/settings.jpg — Settings → Player & Audio, the frosted cards (changed in 0.5.2),
        Audio engine and Sound groups visible. Alt: "Rimelight settings: audio engine and sound".
     2. docs/screenshots/start-radio.jpg — an album page, a song right-clicked, the menu open
        with "Start radio" under "Add last". Alt: "Start radio in a song's menu".
     3. docs/screenshots/live-cover.jpg — an album with a live cover, album page and player bar both
        showing it. Alt: "A live album cover on the album page and in the player bar".
     Android (540 px wide, like the others):
     4. docs/screenshots/android-song-menu.jpg — the frosted-glass song menu (new in 1.6.1) over an
        album page. Alt: "The frosted-glass song menu on Android". -->

<sub>Screenshots from a real Navidrome library. Album art and lyrics belong to their artists and labels.</sub>

## Features

**Listening**
- Albums, artists, songs, playlists, favourites, genres; queue, shuffle, repeat; likes and 1–5 star ratings
- Shuffle the whole library; clearing the queue keeps the song that's playing
- Drag songs in the queue to change their order; Play next / Add to the end, confirmed by a small pill above the player bar
- Time-synced lyrics from your server (`.lrc` files or embedded); LRCLIB lookup is optional
- Audio quality in the player bar: format, bit depth, sample rate, bitrate, plus a Hi-Res badge
- 10-band equalizer with presets and preamp, output device selection, mono, playback speed
- Optional bit-perfect engine (mpv): each song goes to your DAC unchanged, at its own sample rate and bit depth, with exclusive access to the device. Rimelight reads what the device supports, converts only what it can't play, uses its hardware volume, starts quiet on a new device, and shows the song's path ("Bit-perfect · 96 kHz · 24-bit") in Settings and, if you like, the player bar. Linux needs mpv installed (`sudo dnf install mpv`); the Windows installer includes it
- Sleep timer (minutes or end of song), ReplayGain
- Keep playing similar music when the queue runs out (uses Navidrome's Last.fm data, or the same genre)
- Start radio from a song, an album or an artist (right-click, the "…" menu or `Ctrl+K`): a new queue of similar music that keeps going
- A song that can't be played is tried once more, then skipped with a short message; if the server can't be reached, Rimelight pauses and says so instead of skipping. When the queue ends, it stays
- Optional spectrum visualizer on the Now Playing page (Settings → Appearance)
- Optional live album covers: animated covers from an outside service on the album page, the player bar and the fullscreen player, each with its own switch, all showing the same frame (Settings → Privacy & Security; off by default)

**No server? Music on this computer**
- Add music folders on this computer (login page or Settings → Servers) and use the whole app without a server: browsing, search, lyrics (`.lrc` or embedded in the file, synced lines kept as written), cover art, likes, ratings, playlists, play counts
- Folders are rescanned at start; only new or changed files are read

**Your server**
- Several saved servers (home, Tailscale, a friend's) with latency check and one-click switching
- Optional: connect to the fastest server automatically at start
- Streaming-quality cap (Original, 320 to 96 kbps; Opus, MP3 or AAC) for mobile data
- Scrobbling with an offline queue and an activity log
- Continue on other devices (Settings → Queue): your queue and position are saved to the server, and a pill offers to continue what another device is playing or left paused, at the live second with Rimelight for Android; also save the queue as a playlist
- Navidrome's Now Playing shows when you pause (on servers with the OpenSubsonic `playbackReport` extension, such as Navidrome 0.64)
- Who's listening now on the server; library and listening statistics
- If the server is off when Rimelight starts, it opens anyway and reconnects by itself; a page that fails to load says why and offers Retry

**Desktop**
- System media controls: MPRIS on Linux; media keys and SMTC on Windows (not yet confirmed on Windows)
- Tray icon, keyboard shortcuts (`Ctrl+K` quick search and commands)
- Song progress on the taskbar button (Windows): green while playing, yellow when paused, red when a song couldn't play
- Reduce-effects mode for older GPUs; adjustable background strength
- Checks GitHub for a new version at start and offers to install it
- Runs on Electron 45 with its pages in Chromium's sandbox

**Rimelight for Android**
- Library, search, synced lyrics, statistics, likes and 1–5 stars, scrobbling with an offline queue
- Offline downloads (albums, playlists, artists, genres); when the server can't be reached, the library switches to your downloads and the phone's own music by itself
- Use the phone's own music, with or without a server
- Bit-perfect output to a USB DAC (Android 14 or newer); on phones without bit-perfect modes, no resampling to 48 kHz
- Continue on other devices with Rimelight on the computer, both ways, at the live second
- Separate bitrate caps for Wi-Fi and mobile data, several saved servers, sleep timer
- The queue survives Android closing the app: the headset button, the notification or the Resume shortcut pick up at the same song and second
- A song that can't be played is tried once more, then skipped with a message; without a connection, it pauses instead of skipping
- Frosted-glass player bar, tab bar, song menu and sleep timer

## Download

Get the latest build from **[Releases](https://github.com/Rimelight-app/Rimelight/releases/latest)**:

| System | File | Install |
|---|---|---|
| Any Linux | `Rimelight-*.AppImage` | `chmod +x Rimelight-*.AppImage && ./Rimelight-*.AppImage` |
| Debian, Ubuntu, Mint | `Rimelight-*.deb` | `sudo apt install ./Rimelight-*.deb` |
| Fedora, RHEL, openSUSE | `Rimelight-*.rpm` | `sudo dnf install ./Rimelight-*.rpm` |
| Windows 10/11 | `Rimelight-*-win-x64.exe` | run the installer* |
| Android 8 or newer | `Rimelight-*.apk` from the [Android release](https://github.com/Rimelight-app/Rimelight/releases/tag/android-v1.6.1) | open it on the phone and allow installs from your browser or file manager |

<sub>*The Windows installer isn't code-signed, so SmartScreen may warn on first run: More info → Run anyway.</sub>

**Coming from ClearPlay?** Rimelight is the same app under a new name. ClearPlay 0.6.1 offers the update itself; your servers, settings and queue carry over. The Rimelight `.deb` and `.rpm` replace the `clearplay` package when you install them. On the phone, Rimelight for Android 1.6.1 installs over ClearPlay for Android and keeps everything.

On first start, enter your server address (for example `http://192.168.1.10:4533` or your Tailscale address `http://100.x.y.z:4533`), username and password.

## Good to know

- **Lyrics:** put `.lrc` files next to your music (same name as the track) or embed synced lyrics; Navidrome serves them.
- **ListenBrainz / Last.fm:** link them in Navidrome (your user → Personal). Rimelight reports plays to Navidrome, which forwards them.
- **Similar songs and Start radio:** best with a Last.fm API key in Navidrome; without it you get songs of the same genre.
- **Bitrate cap:** needs transcoding (ffmpeg) enabled in Navidrome.
- **Music on this computer:** the built-in engine plays what Chromium can decode (MP3, FLAC, Ogg/Opus, AAC/M4A, WAV); ALAC `.m4a` plays only with the bit-perfect engine. The bitrate cap doesn't apply (there's no transcoding). Artist bios, similar-artist data and Start radio need a server.
- **Hi-res:** Rimelight shows your files' real quality. The built-in engine plays through Chromium's audio, which mixes at the system rate. The bit-perfect engine (Settings → Player & Audio → Audio engine) plays each song unchanged, with exclusive access to the device.

## Is Rimelight for you?

For you if you have Navidrome or another OpenSubsonic server (or just music folders on your computer or phone), use Windows, Linux or Android, and want a player that looks good.

Not (yet): macOS, iPhone, gapless playback with the desktop's bit-perfect engine, a code-signed Windows installer.

## FAQ

**Does it work with Navidrome, Gonic or other servers?** It speaks the Subsonic / OpenSubsonic API and is tested with Navidrome 0.64. Other servers should work for the basics; a few features use OpenSubsonic extensions that Navidrome has.

**Does it show synced lyrics?** Yes, from `.lrc` files or lyrics embedded in your files, served by your server (or read from the files with "Music on this computer"). LRCLIB lookup is optional.

**Is playback bit-perfect?** With the optional mpv engine, yes: each song reaches your DAC unchanged, at its own rate and bit depth. The default engine mixes at the system rate.

**Can I continue on my phone?** Yes, with Rimelight for Android or another app that reads Navidrome's saved queue, such as Symfonium. Turn on Continue on other devices (computer: Settings → Queue; phone: Settings → Player). The other device then shows a pill with Continue, and the song picks up at the same second, also while the first device is still playing. It works both ways. One device can't pause the other. With other apps, Continue starts from the position they last saved.

**Is there an Android app?** Yes, Rimelight for Android, for Android 8 and newer. Install the APK from this repository's releases; each new APK installs over the last one.

**Does it work without a server?** Yes: choose "Use music on this computer" and add your music folders.

**Is it free and open source?** Yes, MIT-licensed, built from this repository.

## Build from source

Requirements: Node.js 24 and pnpm 11 (`corepack enable`).

```bash
git clone https://github.com/Rimelight-app/Rimelight.git
cd Rimelight
pnpm install
pnpm electron:dev                         # run with hot reload
pnpm electron:build && pnpm build:linux   # AppImage, deb, rpm (rpm needs rpmbuild)
pnpm build:win                            # Windows installer (best on Windows or CI)
```

Every push builds Linux and Windows packages in GitHub Actions. Bumping `version` in `package.json` publishes a release automatically.

The Android app lives on the [`android` branch](https://github.com/Rimelight-app/Rimelight/tree/android/android) (Kotlin, Jetpack Compose, Media3); its README has the build steps.

## Credits

Rimelight was called ClearPlay up to version 0.6.1. It began as a fork of [Aonsoku](https://github.com/victoralvesf/aonsoku) by Victor Alves (MIT). The visual design, logo and the features listed above are Rimelight's own. Inter typeface (SIL OFL 1.1), Lucide icons (ISC). See [NOTICE.md](NOTICE.md) and [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT
