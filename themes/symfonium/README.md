# ClearPlay Glass for Symfonium

A colour theme and a full application style for [Symfonium](https://symfonium.app)
(Android) that match the ClearPlay desktop player: graphite surfaces, soft-white accents and quiet, low-contrast
outlines.

File: [`ClearPlay-Glass.json`](ClearPlay-Glass.json) (Material Theme Builder JSON
format, which Symfonium imports directly). It is also attached to every
[ClearPlay release](https://github.com/tonihk00/ClearPlay/releases).

## Install

1. Copy `ClearPlay-Glass.json` to your phone.
2. In Symfonium open **Settings → Interface → Theme, font and colors**.
3. Set **Default color source** to **Custom theme**.
4. In the **Custom theme** section tap **Import** and pick the file.
5. Use dark mode. The light and dark schemes in the file are identical, so the look
   stays the same either way.

## Getting the frosted look on Now Playing

A colour theme can only set colours; Symfonium draws its own screens. The blurred
cover background comes from Symfonium's now-playing options:

- **Settings → Interface → Now playing screens → Expanded player → Background Style:
  Blur.** This gives the blurred album art behind the player, like ClearPlay.
- **Background Overlay:** pick a dark overlay so white text stays readable on bright
  covers.

Menu names can differ slightly between Symfonium versions.

## Full application style (frosted look)

[`ClearPlay-Glass-Style.json`](ClearPlay-Glass-Style.json) is a complete Symfonium
application style: layout, now-playing screen, colours and icons in one file.

- **Apple Music-style arrangement:** tabs Home, Playlists, Library, Search; a home page
  of large rows (recently added, recently played albums and songs, rediscover,
  playlists, favourites) with the ClearPlay logo as the page title; Apple-style album,
  artist and playlist pages and a compact floating tab bar.
- **Blurred cover** behind the now-playing screen at maximum blur, with a dark wash.
- **Frosted panels:** the navigation bar, compact player, top bar, cards and the active
  row use translucent graphite and white instead of solid colours, on graphite
  (not pure black) pages.
- **Rounded shapes:** a rounded-rectangle mini player and rounded-square covers.
- **Lyrics** in bold Inter: the current line is large and bright, the others shrink and
  fade.
- **Icons:** uses the ClearPlay icon pack (below) when it is installed; otherwise
  Symfonium's own icons.

### Install

1. Download `ClearPlay-Icons-Symfonium.apk`, `ClearPlay-Glass-Style.json` from the
   [rolling Symfonium release](https://github.com/tonihk00/ClearPlay/releases/tag/symfonium).
2. Install the APK (Android asks you to allow installs from your browser or file
   manager). It has no screen of its own; it only provides icons.
3. Symfonium → **Settings → Interface → Application style → Import**, and pick the
   JSON file.
4. If the icons did not change, choose them by hand: **Settings → Interface → Theme,
   icons, fonts and colors → Icon pack → ClearPlay (Lucide)**.

Icon packs need Symfonium 16 or newer. If you only want the colours, import
`ClearPlay-Glass.json` as a custom theme instead (see above).

### ClearPlay icon pack

The same [Lucide](https://lucide.dev) icons as the desktop app, with the same thin
1.75 stroke, for 375 of Symfonium's 409 icons; play, pause and skip are solid, and
liked/rated states are filled. Server and cloud provider logos and numbered badges stay
Symfonium's own. The source is in [`symfonium-iconpack/`](../../symfonium-iconpack), built
by GitHub Actions on every change.

The APK is signed with a fixed key that is kept in the repository so each build can
update the previous one. That key is not secret, so it does not prove who made a
build; only install the APK from this repository's releases.

### What can and can't be blurred

- **Now playing:** blurred cover, works.
- **Home, library and lists:** Symfonium has no setting that puts the cover art behind
  these pages, so they use the dark graphite background. The frosted part on these
  pages is the bars (below).
- **Navigation bar and top bar (Symfonium 16):** the blur and glass materials are
  already tuned (blur 28 dp, 40 % graphite tint, saturation 140 %, 22 dp corners on the
  navigation bar). They are left on **Solid** because the exported styles only confirm
  that value. Switch them to **Blur** or **Glass** in Symfonium's interface settings to
  get frosted bars that the page scrolls under.
- **Mini player:** Symfonium has no blur option for it; it uses the theme's
  translucent graphite.

### Credits

- Base file: **TIDAL For Symfonium** by **Myke**
  ([Symfonium Styles](https://styles.symfonium.app/styles/stellar-tidal-music)), 3.1.0.
- Layout and now-playing arrangement: **Apple Music for Symfonium** by **RoyalGuard**
  ([Symfonium Styles](https://styles.symfonium.app/styles/apple-music-for-symfonium)), 2.5.0.
- ClearPlay adds the translucent glass colours, Inter, corner sizes, lyric fading, the
  blur settings, the bar materials, the icon pack and the ClearPlay logo.

TIDAL is a trademark of TIDAL Music AS and Apple Music is a trademark of Apple Inc.;
this style is not affiliated with either.

## Colours

| Role | Colour | Used for (per Symfonium's docs) |
|---|---|---|
| primary | `#F4F4F5` | accents, switches, highlighted buttons |
| onPrimary | `#121216` | text on primary buttons |
| surface | `#0D0D11` | default background |
| surfaceContainer | `#17171D` | navigation bar, compact player |
| surfaceContainerHigh | `#1E1E25` | top bar, cards, dialogs |
| surfaceContainerHighest | `#26262E` | menus, notifications |
| secondaryContainer | `#2C2C36` | selected chips, selected nav item, search bar |
| onSurface | `#F4F4F5` | main text |
| onSurfaceVariant | `#A9A9B3` | subtitles, secondary text |
| outlineVariant | `#26262E` | currently playing row |

Text contrast is at least 7:1 on every surface.

## Licence

MIT, like ClearPlay.
