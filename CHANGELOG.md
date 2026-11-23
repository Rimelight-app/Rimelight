# Changelog

All notable changes to ClearPlay. Format loosely follows Keep a Changelog.

## [0.5.2] - 2026-11-24

### Fixed
- **Pausing didn't show in Navidrome's Now Playing**: Navidrome kept showing ClearPlay as playing after a pause, until it timed out. ClearPlay only sent "now playing" (`scrobble?submission=false`) once per song, and that call has no paused state. On servers that list the OpenSubsonic `playbackReport` extension (Navidrome 0.64.2 does), ClearPlay now reports what the player is doing with `reportPlayback`: starting when a song loads, playing once audio is really moving, paused on every pause (player bar, space bar, media keys, Windows media controls, MPRIS, or when the audio engine pauses on its own), and stopped when a song ends, the queue is cleared or the app quits. While playing it sends the position every 30 seconds and after every seek. Works with both audio engines.
  - Play counts work exactly as before: a play is counted by `scrobble?submission=true`, and every report is sent with `ignoreScrobble=true`, so a song is never counted twice.
  - Servers without the extension (and "Music on this computer") keep the old "now playing" call. The app asks the server which extensions it has at login and again at every start, so a server updated since you logged in is picked up.
  - These reports are live only: when the server can't be reached they are dropped, not queued. Listens are still queued and retried as before.
  - "Scrobble plays" off still sends nothing.

### Changed
- **Settings: frosted look**, like the Android app: each group of settings is a frosted card with its name above it in small capitals, one setting per row with a thin line between rows, on a translucent sheet that lets the cover's colour show through. The page name is shown large at the top. No setting was added, removed, renamed or moved, and every control works as before.
- Small grey hints in Settings (output details, server addresses, scrobble activity, ReplayGain and equalizer notes) are a little brighter, so they stay readable over a light cover.

## [0.5.1] - 2026-11-23

### Changed
- **Player bar: output info moved next to the artist** ("Don Toliver · Not bit-perfect: system mixer"). The song's format, bit depth and rate stay on the line below with the stars, as before, and no longer get squeezed to "1…" by the status. When the artist line is short the output info gets shorter, never the artist name: the long status becomes a short word ("Mixed", "Bit-perfect", "Re-encoded", "Converted"), then an icon, then it hides. Hover it (or the artist line when it's hidden) for the full status and the output device, in a frosted tooltip. The room is worked out from the line's real width, so it follows window size and display scaling. The "Show output info" setting still switches it on and off right away.
- **Player bar: stars sit closer to the song's quality**, and a value that doesn't fit drops out whole (usually the bitrate) instead of being cut ("1411 k…").
- **Now Playing (fullscreen): stars moved to the right**, under the heart, ending at the cover's right edge. Artist and album get the room they took, so "Travis Scott · ASTROWORLD" fits on a 14" laptop.

### Licence
- **Source code of the bundled mpv (Windows)**: every release now carries `ClearPlay-vX.Y.Z-mpv-source.tar.gz` with the exact source of the mpv build in the installer: mpv v0.41.0, FFmpeg at the commit the build used, and the LGPL libraries FriBidi, libiconv and libplacebo. The build checks the shipped DLLs against these sources. `licenses/mpv/README.md` and `NOTICE.md` say where to find it. This also covers 0.5.0, which shipped the same mpv build.

## [0.5.0] - 2026-11-22

### Added
- **Bit-perfect playback (optional mpv engine)**: Settings → Player & Audio → Audio engine → "mpv (bit-perfect)" (takes effect after a restart; "Built-in" stays the default and works as before). Each song is streamed as the original file and sent to the chosen output unchanged, at its own sample rate and bit depth. ClearPlay takes the device for itself while it plays: on Linux the ALSA device directly, past PipeWire (if PipeWire is only holding an idle device, ClearPlay asks it to let go); on Windows WASAPI exclusive mode. ClearPlay talks to mpv through mpv's own IPC with its own code. Linux uses the mpv you install (`sudo dnf install mpv`; Settings says so if it's missing); the Windows installer includes mpv 0.41.0 (licence in `licenses/mpv/`).
  - Works with any output: ClearPlay reads which sample rates and bit depths the device supports (Linux: from the kernel; Windows: by opening it briefly with silence) and remembers them per device. Rates the device doesn't take are converted to the closest one it does, staying in the same family (88.2/176.4 kHz → a 44.1 kHz multiple, 96/192 kHz → a 48 kHz multiple), and the app says so. Rates can be switched off per device for outputs that claim more than they play.
  - If the device is busy or refuses exclusive mode, playback continues through the system mixer and says "Not bit-perfect: device busy" (or "exclusive mode refused").
  - Volume: with a hardware volume control the slider moves the device's own volume; without one, choose fixed volume (bit-perfect, set the loudness on the device or amp) or the app's volume (marked not bit-perfect). A device used bit-perfect for the first time starts quiet (about −40 dB); after that it keeps its own level.
  - Bluetooth plays but is always marked "Bluetooth · re-encoded".
  - The equalizer, visualizer, mono, ReplayGain and playback speed are off with this engine, and Settings says why.
  - Queue, progress bar, player bar, fullscreen, Now Playing, MPRIS (Linux), Windows media controls, scrobbling and repeat-one counting, sleep timer, queue sync, AutoDJ, radio and podcasts all work with it. ALAC `.m4a` files play with this engine.
  - After a minute of pause the device is given back to other apps; playback picks up where it stopped.
- **Output (DAC) info** under the engine setting, like the Android app's USB DAC details: device, supported rates and depths, hardware volume, exclusive or shared, and the song's path ("Bit-perfect · 96 kHz · 24-bit", "Converted to 48 kHz for this device", "Not bit-perfect: device busy", "Bluetooth · re-encoded"), with a Copy button. A drop-down chooses where it shows: "Only in Settings" or "In Settings and the player bar" (next to the song's format and rate, in the same quiet style).
- **Confirmation pill for Play next / Add to queue**: a small glass pill above the player bar ("Playing next", "Added to queue", "7 songs play next", "16 songs added to queue") from song menus (also the Search right-click menu), album, playlist and artist menus, selected songs, the album/playlist add-to-queue buttons and podcast episodes. It replaces the old "Added to queue" toast.

### Notes
- Not done in this version: gapless playback with the mpv engine (there is a short gap between songs while the next one opens).

## [0.4.4] - 2026-11-22

### Added
- **Rescan library** (Settings → Servers → Library): asks the server to scan for new and changed songs, waits until the scan ends, then refreshes every list and loads the lyrics again for the playing song and for new songs. A message says how many songs were added. On Navidrome this needs an admin account (the app says so if the server refuses). Works for "This computer" too.
- **Song menu in search results**: right-click a song on the Search page for the usual song menu (Play next, Add to queue, add to playlist, rating, info and the rest).

### Fixed
- **Album header flashed a white rectangle** while it loaded. The loading placeholder used a light colour from the theme; it is now transparent and only appears if loading takes longer than a moment. The header's text shows at once, the small cover (usually already cached from the album cards) shows straight away, and the sharp cover fades in over it. Applies to album, artist, playlist and genre pages.
- **Equalizer and Now Playing visualizer did nothing** (seen on Fedora): one failed song load (or a play request interrupted by skipping quickly) switched the app to a fallback without the audio engine, and that was saved for good, so the EQ, mono, ReplayGain and the visualizer stayed off on that computer. The fallback is now used only when the server really refuses cross-origin requests, lasts only until the app is restarted, and an interrupted play request no longer counts as an error. Computers already stuck in the fallback recover on the first start of this version.
- **Queue side panel**: with three or more artists, names wrapped onto two lines and ran into each other and into the song length. Artists now sit on one line, separated by commas, and end with "…" when they don't fit (the full list shows on hover). Same fix in the fullscreen queue.

## [0.4.3] - 2026-11-19

### Added
- **Music on this computer**: no server needed. Choose "Use music on this computer" on the login page (or Settings → Servers → Music on this computer), add folders, and the whole app works with them: albums, artists, songs, genres, search, cover art, synced lyrics from `.lrc` files or tags, likes, ratings, play counts, playlists and queue sync. It appears as "This computer" in the server list, so you can switch between it and Navidrome. Folders are rescanned at start (only new or changed files are read), or with Rescan. ALAC `.m4a` files don't play, and the bitrate cap doesn't apply here.
- **Drag and drop in the queue**: drag a song in the queue panel (or the fullscreen queue) to a new place; the list scrolls at the edges and Escape cancels.
- **Visualizer** on the Now Playing page: Settings → Appearance → Visualizer on Now Playing (off by default). White spectrum bars with a quiet peak dot, drawn only while the page is open and music plays.

### Changed
- The fullscreen player's moving backdrop is drawn on a small canvas instead of five window-sized layers, which cuts GPU work while it is open. In the test rig it went from about 10–13 to 16–19 frames per second.
- Settings: the "Language and region" tab is now just "Language".

### Removed
- The Symfonium style and icon pack (and their release files).

### Fixed
- **Play next** did nothing for a song that was already in the queue (e.g. a later song on the same album). It now moves the song right after the current one; Add to queue moves it to the end. Adding songs no longer starts playback when you were paused.
- **Back/forward** buttons in the header were disabled while the lyrics or queue panel was open. The mouse back/forward buttons now work on Windows and Linux too (not only macOS); Back closes the fullscreen player first.
- **Output device** wasn't remembered after restarting the app (seen on Windows): Chromium gives devices new ids each launch, so the device is now also found by its name. A device plugged in later is picked up without a restart.
- Lyrics from LRCLIB were never tried when the server had no lyrics for a song.

### Notes
- The fullscreen slowdown after about 15 minutes couldn't be reproduced in the test rig (a 7-minute run showed no growth in memory, page elements or listeners). The most likely cause is sustained GPU load, which the canvas backdrop above reduces. If it still happens, "Reduce visual effects" (Settings → Appearance) lowers the load further.

## [0.4.2] - 2026-11-19

### Added
- ClearPlay Glass **full application style** for Symfonium (`themes/symfonium/ClearPlay-Glass-Style.json`), based on TIDAL For Symfonium by Myke: translucent glass colours, rounder player and covers, ClearPlay logo.
- Symfonium style now uses the Apple Music for Symfonium arrangement (by RoyalGuard): Home, Playlists, Library and Search tabs, large home rows, Apple-style album/artist/playlist pages; graphite pages instead of pure black; the ClearPlay logo as the home title.
- **ClearPlay icon pack for Symfonium 16** (`symfonium-iconpack/`): the desktop app's Lucide icons for 375 Symfonium icons, built by GitHub Actions and published on the rolling `symfonium` release with the style files.
- **Star ratings** (1–5, saved to Navidrome): quiet white stars in the player bar, the fullscreen player, and the song menus (right-click or ⋯). Click the same star again to clear it; with several songs selected, the menu rates them all. In small windows the stars leave the player bar and the fullscreen player to make room (the menus always have them).
- **Shuffle library**: plays the whole library in random order (Library → Songs, or `Ctrl+K` → Shuffle library) and keeps adding random songs when it reaches the end.
- **Clear queue keeps the playing song**: clearing the queue (new button in the queue panel, or the player-bar queue menu) removes everything except the current song, which keeps playing. Clearing again stops it.

### Changed
- The play/pause button morphs between its two icons (a quick 180 ms shape change) in the player bar, the fullscreen player and the mini player.
- Smoother, quicker motion: pages fade in when you navigate, player-bar buttons respond when pressed, hearts and stars pop when filled, tooltips appear sooner, and a few slow fades are shorter. The system "reduce motion" setting is now respected everywhere.
- The fullscreen player keeps its content while it slides away, instead of closing as an empty gradient.
- Update notes in the app's update dialog now come from this changelog.

### Fixed
- Hovering the volume or progress bar in the fullscreen player showed an empty white bubble; the value now shows in a small dark pill, and the progress bubble follows the cursor from the first hover.
- The frosted album bar appeared empty while scrolling part-way down an album or playlist.
- Liking or rating the playing song could restart it when the media cache is off.
- The player bar re-rendered on every progress tick.
- Turning shuffle off after playing a single song could leave the queue pointing at a missing song.
- Mini player (web): the play button icon and the hover overlay were invisible on the glass theme.

## [0.4.1] - 2026-11-19

### Added
- **Servers** settings: save several addresses (e.g. home network and Tailscale), see each one's latency, switch with one click, and optionally connect to the fastest one at start.
- **Sound** settings: output device selection, 10-band equalizer with presets and preamp, mono, playback speed, and a readout of the rate ClearPlay mixes at.
- **Sleep timer** in the player bar (15–90 minutes or end of the current song).
- **Queue**: sync the play queue with Navidrome (save/load from the queue panel, or automatically), so other apps such as Symfonium can continue it; save the queue as a playlist; keep playing similar music when the queue runs out.
- New README with screenshots and a feature overview.

### Changed
- Much lower GPU use in the fullscreen player: no live blur filters or blend modes on the moving background, lyrics animate only with transform/opacity and check the time 10 times a second instead of every frame, and the app behind the fullscreen view stops drawing while it is open.
- Audio now runs through the browser's built-in audio engine (needed for output-device selection).

## [0.4.0] - 2026-11-18

### Added
- New ClearPlay logo for the app icon, installers, tray and header.
- **Fedora / RHEL package** (`.rpm`) alongside the AppImage and `.deb`.
- **Now playing page** now shows the current track in detail: cover, title, artists, album, year, when it was added, genre, format, bit depth, sample rate, bitrate, length and BPM, play count, like and lyrics buttons; the rest of the album with the current track marked; about the artist (photo, biography, similar artists, switch between featured artists); the artist's discography; and who is listening on the server.
- **ClearPlay Glass theme for Symfonium** (Android) in `themes/symfonium/`, also attached to each release.
- Fullscreen player: a slow, subtle moving blur made from the cover behind the player.

### Changed
- Synced lyrics: the current line is full size and bright while the others shrink and fade with distance; the list now glides between lines with a single smooth animation instead of scrolling. Lyrics are larger overall. You can scroll to look around; it eases back to the current line after a moment.

## [0.3.0] - 2026-11-18

### Added
- Frosted side panel with synced lyrics or the queue, available on every page (lyrics and queue buttons in the player bar); the page makes room for it.
- Search page (rail → Search): searches as you type and shows up to 60 songs, 18 albums and 12 artists, with Play all. `Ctrl+K` quick search shows more songs and reacts faster.
- Settings → Player & Audio:
  - **Streaming quality**: maximum bitrate (Original, 320–96 kbps) and the format to convert to (Opus, MP3, AAC). Only songs above the cap are converted; the player bar shows the conversion.
  - **Scrobbling**: turn reporting on or off, see recent activity (now playing / listen, sent / queued) and listens waiting to be sent, and send them now.
- Settings → Appearance: page to open on start, cover background strength (Vivid, Normal, Dim, Off), fullscreen lyrics size, show/hide audio quality in the player bar.

### Changed
- Fullscreen player: larger cover (up to 540 px on tall screens), larger title, progress and controls.
- Listens that fail to reach the server (offline, VPN drop, server restart) are kept and retried every minute and when the network returns, with their original time. Repeat-one loops now count as new listens.

### Removed
- Visualiser.

### Fixed
- The current song in the fullscreen queue was a white block that hid its title.
- Switches that are on were hard to see.

## [0.2.0] - 2026-11-18

### Added
- Audio quality in the player bar: format, bit depth, sample rate and bitrate, with a Hi-Res badge for lossless files above 16-bit/48 kHz.
- Click the cover in the player bar to open the fullscreen player.
- Visualiser in the fullscreen player: mirrored, rounded frequency bars coloured from the album art (toggle at the top; off with *Reduce visual effects*).
- **Now playing** page: who is listening on your server right now (user, player, quality), refreshed every 15 s.
- **Statistics** page: hours listened, total plays, share of the library explored, library size, top artists and genres by listening time, most played songs and albums, listening by decade, formats.

### Changed
- Album, playlist and artist pages: the bar that appears when scrolling is now a floating frosted bar instead of a solid colour block.
- Performance: the window background is pre-blurred once on a tiny canvas instead of blurring a window-sized image live; panels no longer use live backdrop blur while scrolling; synced lyrics update on one steady timer instead of re-scheduling on every render.

### Fixed
- The app could reopen in the fullscreen player on start.
- A resumed track was not announced to the server as "now playing".

## [0.1.0] - 2026-11-18

### Added
- Glass theme: colour tokens with per-token transparency, soft-white text levels, 10 px radius.
- Window-wide backdrop from the current cover (blurred, darkened, crossfades on track change).
- Narrow icon rail (Home, Search, Library, Settings) and library tabs in the header.
- Floating, rounded glass player bar.
- Inter variable font (with Cyrillic); original ClearPlay logo mark.
- NOTICE.md with upstream and font attribution.
- Page headers for albums, playlists and artists: large rounded cover, title, artist, frosted info chips, soft-white "Play all" pill and frosted round buttons (shuffle, add to queue, search in album/playlist, like, more).
- Track lists inside frosted panels with rounded rows; frosted "Featured" card on Home; rounded album cards with a hover play button.
- Fullscreen now-playing view: large cover, title, progress, controls and volume over a slowly drifting gradient made from the cover's colours; synced lyrics (current line highlighted) or the queue on the right.
- "Reduce visual effects" setting (turns off live blur and motion).
- Original app icon, tray icons, favicons and placeholder covers.
- Softer corner radii throughout (rounded panels, pills, chips and covers); soft scrollbars.

### Changed
- Forked from Aonsoku 0.15.0 (MIT) and renamed to ClearPlay (`com.tonihk00.clearplay`).
- Builds now target Linux x64 (AppImage, deb) and Windows x64 (NSIS installer).
- Auto-update source points at `tonihk00/ClearPlay` GitHub releases.

### Changed (playback)
- Synced lyrics from your server are used by default; looking up missing lyrics on LRCLIB is now opt-in (Settings → Privacy).
- The app no longer reopens in the fullscreen player on start.

### Removed
- Theme picker (ClearPlay uses one glass theme), colourful command icons, Google Fonts requests.
- Discord Rich Presence (and its git-hosted dependency), the old wide sidebar, the song title in the header, Poppins font.
- Docker, Vercel, nginx, Flatpak, macOS and arm64 packaging, upstream funding and docker-publish workflow, upstream screenshots.
