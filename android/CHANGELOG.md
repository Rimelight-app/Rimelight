# ClearPlay for Android — changelog

## [1.6.0] - 2026-11-25

### Added
- **Continue on other devices** (Settings → Player, off by default): ClearPlay saves your queue and position to Navidrome when the song changes or you pause, so ClearPlay on your computer (desktop 0.6.0) or another app such as Symfonium can carry on where you left off, and the other way round. When another device saved a queue more recently, a pill above the player offers it: "Playing on ClearPlay desktop · Way Bigger" (*Continue here*), "Paused on ClearPlay desktop · Way Bigger · 5 min ago" or "Saved by Symfonium · Way Bigger · 2 h ago" (*Continue*). Continue starts the same song at the same second, also when that song is in the queue twice. If the computer takes over while the phone is playing, the phone shows "Continued on ClearPlay desktop" with *Pause here*; it never pauses by itself. The queue menu (⋮ next to *Clear*) has *Load queue from server* and *Save queue to server*. Both apps follow the same written rules, checked by the same 91 shared test cases.
- **Your queue survives**: the queue, the position, shuffle, repeat and shuffle library are kept on the phone. When Android closes ClearPlay in the background, a headset or Bluetooth play button, the system's media controls (also the resume card after a restart) or the new Resume shortcut pick up at the same song and second. Stream links are always made fresh (never with an old login or bitrate), a queue saved for another server or account isn't restored, and songs the server no longer has (Navidrome 0.64 gave every song a new id) are skipped instead of stopping playback.
- **App shortcuts**: long-press the ClearPlay icon for *Shuffle library*, *Resume · <song>* and *Downloads*. They work when the app is closed, too.
- **Refresh button on Statistics**, where Shuffle library sits on Library: reloads the numbers from Navidrome right away, even if they were loaded a minute ago. It turns while loading, is greyed out offline, and if the server can't be reached the old numbers stay and a message says so. Without a server it recounts your downloads and phone music.

### Changed
- **Library opens instantly**: the first page of Albums, Artists, Playlists, Favorites and Genres is kept on the phone (about 2 MB at most, per server account) and shown at once on a cold start, then refreshed in the background; the list only changes if the server's answer did, and keeps its scroll position. Cleared on sign-out, server switch and Settings → Clear cache, and dropped when Navidrome is updated.
- **Faster start-up**: the app ships a Baseline Profile and a startup profile, so Android compiles the code used at start-up and while scrolling when the APK is installed.
- **Less work loading Statistics and long lists**: songs, albums, playlists, favorites and search results are decoded in one pass from the server's answer. Reading Statistics allocates about a third of the memory (a page of 500 songs: 3.8 MB instead of 10.7 MB, 13.7 ms instead of 15.1 ms, measured on the JVM).
- **Live glass blur on new installs** starts on only on phones Android rates as media performance class 13 or newer (never on low-RAM phones), because it costs more than the frame budget while scrolling on mid-range phones (measured below). If you update from an earlier version, your setting stays as it is, and the switch in Settings → Appearance works as before.

### Fixed
- **Playback ended, but the notification kept ClearPlay in the foreground for 10 minutes.** When the queue plays to its end, ClearPlay now leaves the foreground at once, as Android 17 expects; playing again from the notification, a media button or the app starts it again.
- Shuffle library keeps adding songs with the screen off or the app closed (the refill now runs in the player service, not in the app's screen).
- **Back and the tabs could stop working** when you pressed Back on a page just as something changed under the player bar (a song starting, a confirmation appearing): the page stayed half-way through sliding away. The pages no longer rebuild the navigation when that happens.

### Known limits of Continue on other devices
- No remote control: one device can't pause another.
- Shuffle library and similar-music refills don't carry over; only the saved songs do.
- Two installs of the same app (two PCs, or two phones) send the same client name, so they can't continue from each other.
- From other apps, Continue uses their saved position, never their live one.
- Desktop on Fedora: Electron doesn't report a screen lock on Linux, so locking doesn't save (sleep does).

### Measured
On an **emulator** (Android 17, x86_64, software rendering; no phone was connected), before (1.5.3) and after (1.6.0), same emulator. An emulator's frame times aren't a phone's: without a GPU every frame misses the 120 Hz budget, so the jank counts only say "all frames"; compare the percentiles.

| Emulator | 1.5.3 | 1.6.0 |
|---|---|---|
| Cold start to Albums, first frame (median) | 1 832 ms | 1 393 ms |
| Cold start to Albums with covers drawn (median) | 3 047 ms | 2 336 ms |
| Albums fling, frame time p50 / p90 / p99 | 139 / 149 / 155 ms | 97 / 108 / 130 ms |
| Full player → lyrics → back, p50 / p90 / p99 | 112 / 168 / 223 ms | 114 / 163 / 215 ms |
| Frames over budget (fling / player) | 58 of 58 / 229 of 229 | 699 of 699 / 214 of 214 |

Live glass blur on vs off (Albums fling with the mini player showing, emulator): p90 167 ms vs 138 ms, about 29 ms per frame; a lower blur input scale didn't change it (168 vs 144 ms), so the look is unchanged and the first-run default depends on the phone instead. (1.5.3's fling ran with blur on, 1.6.0's with the new default, which is off on this emulator.)


## [1.5.3] - 2026-11-23

### Fixed
- **Statistics offline showed old numbers** (e.g. 133 h instead of 142 h). Offline, the page added up the play counts saved with your downloads, which never update. Now every time Statistics loads from Navidrome, the whole result is saved, and offline you see exactly that, with "Last synced 2 hours ago" under the tiles. Plays made offline aren't added; when the server answers again, Statistics reload by themselves.
- **Statistics differed from the desktop app.** Android kept the first result until the app was closed, cut hours and percentages down instead of rounding them, and counted artists differently. It now uses the desktop's calculation, so both apps show the same Hours listened, Plays, Discovered and Library. Data older than 10 minutes is reloaded when you open the page, like on the desktop. The Library tile now shows hours of music, with albums, artists and size underneath.
- **Pause now shows on Navidrome's Now Playing.** On servers with the OpenSubsonic playback report (Navidrome 0.62 and newer), ClearPlay sends playing, paused (also from the notification, lock screen, headset buttons, or when another app takes the audio) and stopped, plus the position every 30 s and after each seek. Plays are counted exactly as before. Older servers get the old now-playing message.

### Changed
- **About** in Settings is now a row that opens a window: version and build number, the connected Navidrome version, the licence, a link to GitHub, and *Copy debug info* (app, Android and server versions and the phone model, with no names or addresses).

## [1.5.2] - 2026-11-22

### Added
- **No resampling on phones without bit-perfect** (e.g. Galaxy S24, whose USB DAC details say "Bit-perfect modes: none"): with Bit-perfect USB output on, ClearPlay now sets Android's mixer to each song's own rate and bit depth on the USB DAC, so 44.1 kHz albums stay 44.1 kHz instead of being resampled to 48 kHz. The player shows "No resampling · 44.1 kHz · 24-bit". It is not bit-perfect: the sound still goes through Android's mixer (volume, other apps' sounds).
- USB DAC details also list these mixer modes.

## [1.5.1] - 2026-11-22

### Fixed
- **16-bit albums played as loud noise** (e.g. *Love Sick*, *$OME $EXY $ONGS 4 U*) on every output, bit-perfect on or off. 1.5.0 asked the phone's FLAC decoder for float output on every song, and on the Galaxy S24 that broke 16-bit files. Now only songs above 16 bits decode to float; 16-bit songs decode as they did in 1.4. Checked sample by sample against a reference decode: 16- and 24-bit songs come out exact, streamed and downloaded.
- **"Resampled" with a USB DAC that wasn't resampling**: the rate came from the phone speaker, not the DAC. With USB through the Android mixer the line now just says "Android mixer", and it only says "Resampled" when Android really reports a different rate. The reason bit-perfect isn't on (e.g. "phone offers no bit-perfect mode for this DAC") now gets its own line instead of being cut off.

### Added
- **USB DAC details** in Settings → Player (shown while bit-perfect is on): the rates, formats and bit-perfect modes Android reports for the connected DAC, with a Copy button.
- **Bit-perfect for downloads**: songs downloaded at Original play bit-perfect like streams. Songs downloaded at a lower quality now show their real format in the player ("→ OPUS 192") instead of looking like the original.
- Bit-perfect also works with DACs whose only bit-perfect format is float.

### Changed
- **Shorter output line** on Now Playing, without the device name: "Bit-perfect · 96 kHz · 24-bit", "Resampled to 48 kHz", "Bluetooth · re-encoded".

## [1.5.0] - 2026-11-22

### Added
- **Bit-perfect USB output** (Settings → Player, Android 14 or newer): with a USB DAC plugged in, each song goes to the DAC at its own sample rate and full bit depth, past the Android mixer. No resampling, no volume scaling, no effects. 44.1, 88.2 and 192 kHz albums reach the DAC at those rates. Set the volume on the DAC. While it plays, other apps' sounds are muted on the DAC. Turning it on or plugging the DAC in takes effect at once. Bitrate caps are skipped while a DAC is attached.
- **Where the sound goes**, under the song quality in the player: "Bit-perfect · FiiO KA3 · 96 kHz · 32-bit", "Speaker · resampled to 48 kHz" or "Bluetooth · re-encoded", so you can see whether what you hear is untouched.

### Changed
- **24-bit songs keep all 24 bits** on every output. Before, they were cut to 16 bits before Android got them.
- **"Original" quality now always gets the original file**: streams and downloads ask Navidrome for the raw file, so a transcoding rule on the server can't convert it.

## [1.4.0] - 2026-11-21

### Added
- **Offline listens are scrobbled later.** Songs you listen to without a connection are kept (also if the app is closed) and sent to Navidrome as soon as the server answers again, with the time you played them, so they reach ListenBrainz / Last.fm too. Works across your saved addresses for the same server (home, Tailscale…).
- **Playback source** in Settings → Player: *Auto* (server when connected, downloads when offline; the new default), *Always server*, or *Always downloads*. Decided per song when it starts, so a song never switches files halfway.
- **Pause on the album page**: while a song from the album is playing, the big Play button turns into Pause; tap again to resume. Not playing, it looks and works as before.
- **Reorder the queue**: hold a song and drag it to a new place; the list makes room and scrolls by itself near the edges. Holding a song still and letting go opens its menu (Play next, Go to album…).

### Fixed
- **Back gesture right after opening a page** no longer glitches (the page jumped left and snapped away). Going back while a page is still sliding in now lets it settle and then slides it off to the right, whether you swipe, tap the back arrow or pull the page down.
- **Lyrics scroll smoothly every time on phones with adaptive refresh rate** (e.g. Samsung Galaxy S24): while lyrics are on screen and playing, the app asks the screen to stay at its top refresh rate, and it starts drawing a moment before each line change, so the glide no longer starts at a low refresh rate. Released when you pause or leave the lyrics.

## [1.3.0] - 2026-11-20

### Added
- **Scan library** in Settings → Servers: starts a Navidrome scan and shows its progress ("Scanning… 1 204 items found"). Needs an admin account; others get a clear message.
- **Drag to select albums**: long-press an album, keep the finger down and slide across others to select (or deselect) them all; scrolls by itself near the edges. Tapping single albums still works.
- **Decades open their albums**: tap a decade in Statistics to see that decade's albums.

### Changed
- **New back animation**: pages are solid sheets that slide. Going back, the page slides off to the right (following your finger with the back swipe) and the previous page slides in beneath it. No more shrinking. Bottom tabs simply cross-fade.
- **Lyrics scroll smoothly**: one animated value drives the whole view and nothing is re-laid out per frame; the expensive full-screen fade mask is gone. The page behind the full player is no longer redrawn while the player covers it, which also makes the cover view lighter.
- **Going back keeps your place**: lists, search results and statistics are kept while you're on another page, so you return to the same scroll position.
- Pull-down on pages and the player only moves the screen (no shrinking).

### Fixed
- Opening the Genres tab after Artists could crash the app.
- Tapping the tab you're already on now goes back to its first page (it did nothing on album and decade pages). An album opened from Search keeps the Search tab highlighted.
- Previous went back to the start of the song even in its first seconds; it now goes to the previous song within the first 3 seconds, like other players.
- Lyrics opened in the middle of a song now start at the right line.

## [1.2.0] - 2026-11-19

### Added
- **Works offline by itself.** When the server can't be reached, the library switches to your downloads (and the music on your phone) and looks exactly the same: albums, artists, songs, genres, search, covers and synced lyrics all work. A small "Offline" tag shows in the Library header, and the app switches back on its own when the server answers again.
- **Use music on this phone.** A new button on the sign-in screen skips the server and plays the phone's own music, with covers read from the files, together with any ClearPlay downloads. Connect a server any time from Settings. With a server, Settings → Library → "Music on this phone" adds it to the offline library.
- **Statistics** tab, like the desktop: hours listened, plays, songs discovered, library size, top artists, albums, songs, genres and decades, and formats.
- **Select several albums**: long-press an album, tap more, then play, shuffle, play next, add to queue, download or remove the downloads in one go. "Select all" picks every album in the tab.
- **Song quality** in the player, like the desktop: format, bit depth, sample rate and bitrate, a Hi-Res tag, and "→ OPUS 192" when a song is being converted for the bitrate cap.
- **Pull down an album, artist, playlist or genre page** to go back, like the player.
- Confirmations ("Added to queue", "7 songs play next", "Downloading 16 songs") in a small glass pill above the player.
- Lyrics are saved with downloads.

### Changed
- **Downloads tab shows albums**, not single songs.
- **Buttons respond when pressed**: a soft glow, a slightly deeper press and a light vibration.
- The player screen sits higher: cover, title, seek bar and controls stay together a little above the middle; lyrics sit higher too.
- **The player's cover appears instantly**: a smaller copy that is already loaded shows at once while the big one loads, and the big one is fetched as soon as a song starts.
- **Smoother navigation and back gesture**: pages slide in, and going back (also with the Android back swipe) shrinks the page away; the back swipe pulls the player down as you drag.
- Lock-screen and notification artwork also work offline and for phone music.
- Likes and ratings say "need your server" when offline instead of failing silently.

## [1.1.0] - 2026-11-19

### Added
- **Offline downloads.** Download a whole album, playlist, artist or genre from its page, or single songs from the song menu. Downloaded songs show a small check and play with no connection. A new **Downloads** tab in the Library lists them; without a connection the Library opens there.
- **Settings**, grouped like the desktop app:
  - **Servers:** several saved addresses (home, Tailscale…) with their response time; tap to switch, add or remove one.
  - **Streaming:** separate bitrate caps for Wi-Fi and mobile data, and the format to convert to (Opus, MP3, AAC).
  - **Downloads:** download quality, download on Wi-Fi only, storage used, remove all.
  - **Player:** sleep timer, scrobbling on or off.
  - **Appearance:** background strength (Vivid, Balanced, Dim, Off) and live glass blur on or off.
  - **Storage:** cover cache size and clear.
- **Sleep timer** (15–90 minutes or end of song), also from the moon button in the full player.
- **Pull down to minimise** the full player, like other music apps: drag down from the cover, the title, the top bar, or the top of the queue.

### Changed
- The bottom tab bar is frosted glass like the now-playing card, floating over the page, instead of a dark band. The current tab sits on a soft glass chip.

## [0.1.0] - 2026-11-19

First release: library, search, playback with notification and lock-screen controls, queue, likes and ratings, scrobbling, full player with synced lyrics.
