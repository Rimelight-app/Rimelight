"""Builds the ClearPlay Glass full application style for Symfonium from a
user-supplied base export (TIDAL For Symfonium 3.1.0). Only appearance values
are changed; the base's layout and enum choices are kept so the file stays
valid for Symfonium's importer."""
import base64, io, json, math, sys, uuid
from PIL import Image, ImageDraw, ImageFont

base_path, out_path, font_path, layout_path = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
outer = json.load(open(base_path))
inner = json.loads(outer["style"])
old_id = outer["id"]

# ---- 0. Layout from "Apple Music for Symfonium" (RoyalGuard): home rows, shortcuts,
# tabs, library, list and page arrangement, now playing arrangement. ClearPlay keeps
# its own colours, font, lyrics look, bar materials and home banner.
layout = json.loads(json.load(open(layout_path))["style"])
KEEP_I = {"home.custom.icon", "home.custom.icon.banner", "app.icon", "home.icon.size"}
for k, v in layout["i"].items():
    if k not in KEEP_I:
        inner["i"][k] = v
KEEP_D_PREFIX = ("lyrics.",)
KEEP_D = {"bottom.navigation.transparency"}
for k, v in layout["d"].items():
    if k not in KEEP_D and not k.startswith(KEEP_D_PREFIX):
        inner["d"][k] = v
# Show the ClearPlay banner as the first home row, left-aligned like a page title.
rows = [r for r in inner["i"]["home.rows"].split(";") if r and r != "s:icon"]
inner["i"]["home.rows"] = ";".join(["s:icon"] + rows)
inner["i"]["home.rows.hidden"] = ";".join(r for r in inner["i"]["home.rows.hidden"].split(";") if r and r != "s:icon")
inner["i"]["home.icon.left.align"] = True
# Graphite surfaces instead of pure AMOLED black, as on the desktop app.
inner["a"]["dark.mode"] = "on"
# ClearPlay icon pack (Lucide); Symfonium falls back to its own icons if it is missing.
inner["i"]["active.icon.pack.id"] = "com.tonihk00.clearplay.icons:clearplay-lucide"
new_id = str(uuid.uuid5(uuid.NAMESPACE_URL, "https://github.com/tonihk00/ClearPlay/symfonium-style"))

# ---- 1. Colour theme (same scheme for light/dark; translucent containers = glass)
dark = {
    "primary": "#FFF4F4F5", "surfaceTint": "#FFF4F4F5", "onPrimary": "#FF121216",
    "primaryContainer": "#26FFFFFF", "onPrimaryContainer": "#FFF4F4F5",
    "secondary": "#FFC9C9D1", "onSecondary": "#FF1A1A20",
    "secondaryContainer": "#24FFFFFF", "onSecondaryContainer": "#FFF4F4F5",
    "tertiary": "#FFD7D3E8", "onTertiary": "#FF1C1A26",
    "tertiaryContainer": "#2EFFFFFF", "onTertiaryContainer": "#FFF4F4F5",
    "error": "#FFFFB4AB", "onError": "#FF690005",
    "errorContainer": "#FF93000A", "onErrorContainer": "#FFFFDAD6",
    "background": "#FF0B0B0E", "onBackground": "#FFF4F4F5",
    "surface": "#FF0B0B0E", "onSurface": "#FFF4F4F5",
    "surfaceVariant": "#FF2A2A31", "onSurfaceVariant": "#FFA9A9B3",
    "outline": "#FF4A4A54", "outlineVariant": "#FF3A3A44",
    "shadow": "#FF000000", "scrim": "#FF000000",
    "inverseSurface": "#FFE6E6EA", "inverseOnSurface": "#FF1B1B20", "inversePrimary": "#FF3A3A44",
    "primaryFixed": "#FFF4F4F5", "onPrimaryFixed": "#FF121216",
    "primaryFixedDim": "#FFD4D4D8", "onPrimaryFixedVariant": "#FF3A3A44",
    "secondaryFixed": "#FFE4E4EA", "onSecondaryFixed": "#FF1A1A20",
    "secondaryFixedDim": "#FFC9C9D1", "onSecondaryFixedVariant": "#FF3F3F48",
    "tertiaryFixed": "#FFEDE9F7", "onTertiaryFixed": "#FF1C1A26",
    "tertiaryFixedDim": "#FFD7D3E8", "onTertiaryFixedVariant": "#FF46424F",
    "surfaceDim": "#FF0B0B0E", "surfaceBright": "#FF2E2E36",
    "surfaceContainerLowest": "#FF08080B", "surfaceContainerLow": "#FF131318",
    "surfaceContainer": "#D91E1E25",        # nav bar, compact player: 85 % graphite
    "surfaceContainerHigh": "#CC1A1A21",    # top bar, cards, dialogs, overlays: 80 %
    "surfaceContainerHighest": "#F226262E", # menus, snackbars: 95 %
}
base_theme = json.loads(inner["a"]["custom.material.theme"])
assert set(dark) == set(base_theme["schemes"]["dark"]), set(base_theme["schemes"]["dark"]) ^ set(dark)
theme = {
    "name": "ClearPlay Glass",
    "id": str(uuid.uuid5(uuid.NAMESPACE_URL, "https://github.com/tonihk00/ClearPlay/symfonium-theme")),
    "imported": True,
    "schemes": {"light": dict(dark), "dark": dict(dark)},
}
a = inner["a"]
a["custom.material.theme"] = json.dumps(theme, separators=(",", ":"))
seed = 0xFF8A86A8
a["theme.color.seed"] = str(seed - (1 << 32))  # signed ARGB int, as in the base
a["typography"] = "Custom"
a["typography.custom"] = "Inter"

# ---- 2. Now playing: rounder covers and player, glassy overlays (numeric tweaks only)
np = json.loads(inner["i"]["now.playing.page.configuration"])
c = np["compactConfiguration"]
c["playerCornerRadius"] = 18          # rounded rectangle (Apple Music style uses 15)
c["thumbnailRoundedCorners"] = 12     # rounded-square cover (as in Apple Music style)
for key in ("portraitConfiguration", "landscapeConfiguration"):
    p = np.get(key)
    if not isinstance(p, dict):
        continue
    if "coverArtRoundedCornerPercent" in p:
        p["coverArtRoundedCornerPercent"] = 6      # ClearPlay uses ~24 px on a 540 px cover
    if "backgroundProtectionTransparency" in p:
        p["backgroundProtectionTransparency"] = 45  # dark wash over the blur, like ClearPlay
    if "backgroundBlurLevel" in p:
        p["backgroundBlurLevel"] = 256              # Symfonium's maximum
    # Blurred-artwork background: value 12 as exported by Symfonium in the
    # "Apple Music for Symfonium" style (the base's 1/3 are solid colours).
    p["backgroundStyle"] = 12
    p["adaptivePrimaryColor"] = False
    p["backgroundProtectionBlack"] = True
    if "coverArtDropShadow" in p:
        p["coverArtDropShadow"] = True
    t = p.get("topBarTitle")
    if isinstance(t, dict) and "customText" in t:
        t["customText"] = "%queue.name%"
inner["i"]["now.playing.page.configuration"] = json.dumps(np, separators=(",", ":"), ensure_ascii=False)

# ---- 2b. Symfonium 16 bar materials, pre-tuned to ClearPlay (kind stays SOLID,
# the only value confirmed in exports; switch to Blur/Glass in the app).
def bar_effect(corner):
    return json.dumps({
        "kind": "SOLID",
        "settings": {
            "blur": {"appearance": {"blurRadiusDp": 28.0,
                     "tint": {"colorSource": "automatic", "opacityPercent": 40, "opacityMode": "FIXED"},
                     "transparencyPercent": 0, "saturationPercent": 140}, "grainPercent": 6},
            "glass": {"appearance": {"blurRadiusDp": 24.0,
                      "tint": {"colorSource": "automatic", "opacityPercent": 18, "opacityMode": "FIXED"},
                      "transparencyPercent": 0, "saturationPercent": 150},
                      "refractionPercent": 45, "depthPercent": 50, "highlightsPercent": 35,
                      "edgeSoftnessDp": 1, "dispersionPercent": 0, "preset": "REGULAR"},
            "cornerRadiusDp": corner,
        },
        "solidColor": {"source": "automatic"},
    }, separators=(",", ":"))
inner["d"]["navigation.background.effect"] = bar_effect(22)
inner["d"]["top.bar.background.effect"] = bar_effect(0)

# ---- 3. Lyrics like ClearPlay: big bold current line, quiet others
d = inner["d"]
d["lyrics.inactive.alpha"] = 35
d["lyrics.inactive.scale"] = 82
d["lyrics.font.weight"] = 700
d["lyrics.center.text"] = False

# ---- 4. Home header image: ClearPlay mark + wordmark (replaces the TIDAL logo)
W, H = 1373, 182
S = 4
img = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
box = H * S
k = box / 100
white = (255, 255, 255, 255)
clear = (0, 0, 0, 0)
draw.rounded_rectangle([2 * k, 2 * k, 98 * k, 98 * k], radius=22 * k, fill=white)
CX, CY, R, HX, HR = 50, 50, 31, 57.4, 13.8
draw.ellipse([(CX - R) * k, (CY - R) * k, (CX + R) * k, (CY + R) * k], fill=clear)
for i in range(1, 4):
    t = i / 4
    left = (CX - R) + ((HX - HR) - (CX - R)) * t
    right = (HX + HR) + ((CX + R) - (HX + HR)) * (1 - t) ** 2.2
    cx, r = (left + right) / 2, (right - left) / 2
    draw.ellipse([(cx - r) * k, (CY - r) * k, (cx + r) * k, (CY + r) * k], outline=white, width=round(1.9 * k))
draw.ellipse([(HX - HR) * k, (CY - HR) * k, (HX + HR) * k, (CY + HR) * k], fill=white)
font = ImageFont.truetype(font_path, int(H * S * 0.62))
try:
    font.set_variation_by_axes([680])
except Exception:
    pass
draw.text((box + 46 * S, H * S / 2), "ClearPlay", font=font, fill=white, anchor="lm")
img = img.resize((W, H), Image.LANCZOS)
img.save(out_path.replace(".json", "-banner-preview.png"))
buf = io.BytesIO()
img.save(buf, format="PNG", optimize=True)
inner["ci"] = base64.urlsafe_b64encode(buf.getvalue()).decode().rstrip("=")
for key in ("home.custom.icon",):
    if isinstance(inner["i"].get(key), str):
        inner["i"][key] = inner["i"][key].replace(old_id, new_id)

# ---- 5. Outer envelope
outer["name"] = "ClearPlay Glass"
outer["id"] = new_id
outer["style"] = json.dumps(inner, separators=(",", ":"), ensure_ascii=False)
json.dump(outer, open(out_path, "w"), ensure_ascii=False)

s = outer["style"]
print("ok", out_path, "id", new_id, "bytes", len(json.dumps(outer)))
print("tidal mentions left:", s.lower().count("tidal"))
