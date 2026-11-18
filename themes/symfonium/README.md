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
application style. It contains the layout, the now-playing screen and the colours in one
file:

- **Blurred cover** behind the now-playing screen, with a lighter dark overlay so more of
  the art shows through.
- **Frosted panels:** the navigation bar, compact player, top bar, cards, chips and the
  active row use translucent graphite and white instead of solid colours.
- **Rounded shapes:** a rounded-rectangle floating mini player and rounded-square covers,
  matching ClearPlay's corners.
- **Lyrics** in bold Inter: the current line is large and bright, and the others shrink
  to 82 % and fade.
- **ClearPlay logo** in the home header.

### Install

1. Copy `ClearPlay-Glass-Style.json` to your phone.
2. Symfonium → **Settings → Interface → Application style → Import**, and pick the file.
3. If you only want the colours, import `ClearPlay-Glass.json` as a custom theme
   instead (see above).

The style was made for Symfonium 15 (the version the base was exported from).

### Credits

Built on **TIDAL For Symfonium** by **Myke**
([Symfonium Styles](https://styles.symfonium.app/styles/stellar-tidal-music)), version
3.1.0. Its layout and now-playing structure are kept. ClearPlay changes the colours (new
translucent glass theme), corner sizes, lyric fading and overlay strength, and replaces
the TIDAL wordmark with the ClearPlay logo. TIDAL is a trademark of TIDAL Music AS; this
style is not affiliated with TIDAL.

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
