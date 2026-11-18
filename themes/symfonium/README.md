# ClearPlay Glass for Symfonium

A colour theme for [Symfonium](https://symfonium.app) (Android) that matches the
ClearPlay desktop player: graphite surfaces, soft-white accents and quiet, low-contrast
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

Symfonium can also import and save a whole **application style**: layout, now-playing
screen and colours in one JSON file (Settings → Interface → Application style). Its file
format isn't publicly documented, so this repository doesn't ship one yet. Writing one
blind risks a file Symfonium rejects or that breaks layouts.

To get one made that matches ClearPlay:

1. In Symfonium set up the look you like (with this colour theme and **Background
   Style: Blur**).
2. Settings → Interface → Application style → **Save**, then export or share the file.
3. Open an issue or send the JSON. It can then be tuned (rounded covers, blur, overlay,
   spacing) and published here next to the colour theme.

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
