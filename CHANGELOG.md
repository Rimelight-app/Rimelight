# Changelog

All notable changes to ClearPlay. Format loosely follows Keep a Changelog.

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
