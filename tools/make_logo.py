"""ClearPlay logo (provided by the user), redrawn as vector + raster sizes."""
import os, sys
from PIL import Image, ImageDraw

app = sys.argv[1]

# Geometry in a 100x100 box
BOX_R = 22          # squircle corner radius
CX, CY, R = 50, 50, 31   # black disc
HX, HR = 57.4, 13.8      # white hole (shifted right)
RINGS = 3
STROKE = 1.9

def rings():
    # Rings step evenly from the disc edge to the hole on the left, but bunch
    # up on the right, so the grooves read as fanning out to the left.
    out = []
    d_left, d_right = CX - R, CX + R
    h_left, h_right = HX - HR, HX + HR
    for i in range(1, RINGS + 1):
        t = i / (RINGS + 1)
        left = d_left + (h_left - d_left) * t
        right = h_right + (d_right - h_right) * (1 - t) ** 2.2
        out.append(((left + right) / 2, (right - left) / 2))
    return out

svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
       f'<rect x="2" y="2" width="96" height="96" rx="{BOX_R}" fill="#F4F4F5"/>',
       f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="#0B0B0E"/>']
for cx, r in rings():
    svg.append(f'<circle cx="{cx:.2f}" cy="{CY}" r="{r:.2f}" fill="none" stroke="#F4F4F5" stroke-width="{STROKE}"/>')
svg.append(f'<circle cx="{HX}" cy="{CY}" r="{HR}" fill="#F4F4F5"/>')
svg.append('</svg>')
svg_text = "\n".join(svg) + "\n"
os.makedirs(os.path.join(app, "build"), exist_ok=True)
open(os.path.join(app, "build/icon.svg"), "w").write(svg_text)
open(os.path.join(app, "public/clearplay-logo.svg"), "w").write(svg_text)

def render(size, pad=0.0):
    ss = 8
    S = size * ss
    k = S / 100
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    o = 2 * k
    d.rounded_rectangle([o, o, S - o, S - o], radius=BOX_R * k, fill=(244, 244, 245, 255))
    d.ellipse([(CX - R) * k, (CY - R) * k, (CX + R) * k, (CY + R) * k], fill=(11, 11, 14, 255))
    w = max(1, round(STROKE * k))
    for cx, r in rings():
        d.ellipse([(cx - r) * k, (CY - r) * k, (cx + r) * k, (CY + r) * k], outline=(244, 244, 245, 255), width=w)
    d.ellipse([(HX - HR) * k, (CY - HR) * k, (HX + HR) * k, (CY + HR) * k], fill=(244, 244, 245, 255))
    return img.resize((size, size), Image.LANCZOS)

big = render(1024)
big.save(os.path.join(os.environ.get("RIG", "/tmp"), "logo-preview.png"))
def save(path, size):
    p = os.path.join(app, path); os.makedirs(os.path.dirname(p), exist_ok=True)
    render(size).save(p)
for p in ["build/icon.png", "resources/icons/icon.png"]:
    save(p, 512)
for p in ["build/icon.ico", "resources/icons/icon.ico", "public/favicons/favicon.ico"]:
    big.save(os.path.join(app, p), sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
for n in [16, 32, 48, 256]:
    save(f"resources/assets/tray/other/icon-{n}x{n}.png", n)
    save(f"resources/assets/tray/mac/icon-{n}x{n}.png", n)
for f, n in {"android-chrome-192x192.png":192, "android-chrome-512x512.png":512, "apple-touch-icon.png":180,
             "favicon-16x16.png":16, "favicon-32x32.png":32, "maskable_icon_x192.png":192,
             "maskable_icon_x512.png":512, "mstile-150x150.png":150}.items():
    save(f"public/favicons/{f}", n)
print("logo done")
