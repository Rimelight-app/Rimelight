"""Writes the ClearPlay Glass theme for Symfonium in Material Theme Builder
JSON format (the format Symfonium's docs say can be imported directly)."""
import colorsys, json, sys

out = sys.argv[1]

dark = {
    "primary": "#F4F4F5", "surfaceTint": "#F4F4F5", "onPrimary": "#121216",
    "primaryContainer": "#2A2A33", "onPrimaryContainer": "#F4F4F5",
    "secondary": "#C9C9D1", "onSecondary": "#1A1A20",
    "secondaryContainer": "#2C2C36", "onSecondaryContainer": "#F4F4F5",
    "tertiary": "#D7D3E8", "onTertiary": "#1C1A26",
    "tertiaryContainer": "#34313F", "onTertiaryContainer": "#EDE9F7",
    "error": "#FFB4AB", "onError": "#690005",
    "errorContainer": "#93000A", "onErrorContainer": "#FFDAD6",
    "background": "#0D0D11", "onBackground": "#F4F4F5",
    "surface": "#0D0D11", "onSurface": "#F4F4F5",
    "surfaceVariant": "#2A2A31", "onSurfaceVariant": "#A9A9B3",
    "outline": "#4A4A54", "outlineVariant": "#26262E",
    "shadow": "#000000", "scrim": "#000000",
    "inverseSurface": "#E6E6EA", "inverseOnSurface": "#1B1B20", "inversePrimary": "#3A3A44",
    "primaryFixed": "#F4F4F5", "onPrimaryFixed": "#121216",
    "primaryFixedDim": "#D4D4D8", "onPrimaryFixedVariant": "#3A3A44",
    "secondaryFixed": "#E4E4EA", "onSecondaryFixed": "#1A1A20",
    "secondaryFixedDim": "#C9C9D1", "onSecondaryFixedVariant": "#3F3F48",
    "tertiaryFixed": "#EDE9F7", "onTertiaryFixed": "#1C1A26",
    "tertiaryFixedDim": "#D7D3E8", "onTertiaryFixedVariant": "#46424F",
    "surfaceDim": "#0D0D11", "surfaceBright": "#2E2E36",
    "surfaceContainerLowest": "#08080B", "surfaceContainerLow": "#131318",
    "surfaceContainer": "#17171D", "surfaceContainerHigh": "#1E1E25",
    "surfaceContainerHighest": "#26262E",
}

def tones(hue, sat):
    keys = [0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 95, 98, 99, 100]
    res = {}
    for k in keys:
        r, g, b = colorsys.hls_to_rgb(hue, k / 100, sat)
        res[str(k)] = "#%02X%02X%02X" % (round(r * 255), round(g * 255), round(b * 255))
    return res

theme = {
    "description": "ClearPlay Glass - dark frosted-glass theme matching the ClearPlay desktop player. "
                   "Neutral graphite surfaces, soft-white accents. Same scheme for light and dark mode.",
    "seed": "#8A86A8",
    "coreColors": {"primary": "#8A86A8"},
    "extendedColors": [],
    "schemes": {k: dark for k in ["light", "light-medium-contrast", "light-high-contrast",
                                  "dark", "dark-medium-contrast", "dark-high-contrast"]},
    "palettes": {
        "primary": tones(0.69, 0.08), "secondary": tones(0.69, 0.05),
        "tertiary": tones(0.72, 0.18), "neutral": tones(0.67, 0.04),
        "neutral-variant": tones(0.67, 0.06),
    },
}
with open(out, "w") as f:
    json.dump(theme, f, indent=2)
    f.write("\n")
print("wrote", out, len(dark), "roles")
