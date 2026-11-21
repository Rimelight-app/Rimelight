# ClearPlay for Android — changelog

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
