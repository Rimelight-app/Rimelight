#!/usr/bin/env python3
"""Build the ClearPlay Symfonium icon pack sources from Lucide SVGs.

usage: make_iconpack.py <template-dir> <lucide-package-dir> <keymap.json> <out-project-dir> <preview.png>
"""
import json, math, os, re, shutil, subprocess, sys, xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(__file__))
from lucide_map import M2L, FILLABLE

TPL, LUC, KEYMAP, OUT, PREVIEW = sys.argv[1:6]
STROKE = "1.75"            # same stroke as the ClearPlay desktop icons
ALWAYS_FILL = {"play", "pause", "skip-forward", "skip-back"}
STATE_SUFFIX = (".filled", ".on", ".active", ".selected")
PKG = "com.tonihk00.clearplay.icons"
PACK_ID = "clearplay-lucide"

# ---------- SVG path normalisation (explicit separators, arc flags split) ----------
NUM = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
ARGS = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}

def fmt(v):
    s = f"{v:.3f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s

def normalize(d):
    out, i, cmd = [], 0, None
    while i < len(d):
        c = d[i]
        if c.isspace() or c == ",":
            i += 1; continue
        if c.isalpha():
            cmd = c; out.append(c); i += 1
            if c in "zZ": cmd = None
            continue
        n = ARGS[cmd.upper()]
        vals = []
        for k in range(n):
            while i < len(d) and (d[i].isspace() or d[i] == ","): i += 1
            if cmd.upper() == "A" and k in (3, 4):      # single-digit flags
                vals.append(d[i]); i += 1; continue
            m = NUM.match(d, i)
            if not m: raise ValueError(f"bad path near {d[i:i+20]!r}")
            vals.append(fmt(float(m.group(0)))); i = m.end()
        out.append(" ".join(vals))
        if cmd == "M": cmd = "L"
        elif cmd == "m": cmd = "l"
    return " ".join(out)

def f(e, k, dflt=0.0):
    return float(e.get(k, dflt))

def shape_to_path(e):
    tag = e.tag.split("}")[-1]
    if tag == "path":
        return normalize(e.get("d"))
    if tag in ("circle", "ellipse"):
        cx, cy = f(e, "cx"), f(e, "cy")
        rx = f(e, "r") if tag == "circle" else f(e, "rx")
        ry = f(e, "r") if tag == "circle" else f(e, "ry")
        return (f"M {fmt(cx-rx)} {fmt(cy)} A {fmt(rx)} {fmt(ry)} 0 1 0 {fmt(cx+rx)} {fmt(cy)} "
                f"A {fmt(rx)} {fmt(ry)} 0 1 0 {fmt(cx-rx)} {fmt(cy)} Z")
    if tag == "rect":
        x, y, w, h = f(e, "x"), f(e, "y"), f(e, "width"), f(e, "height")
        rx = f(e, "rx", e.get("ry", 0)); ry = f(e, "ry", rx)
        rx, ry = min(rx, w / 2), min(ry, h / 2)
        if rx == 0:
            return f"M {fmt(x)} {fmt(y)} H {fmt(x+w)} V {fmt(y+h)} H {fmt(x)} Z"
        return (f"M {fmt(x+rx)} {fmt(y)} H {fmt(x+w-rx)} A {fmt(rx)} {fmt(ry)} 0 0 1 {fmt(x+w)} {fmt(y+ry)} "
                f"V {fmt(y+h-ry)} A {fmt(rx)} {fmt(ry)} 0 0 1 {fmt(x+w-rx)} {fmt(y+h)} H {fmt(x+rx)} "
                f"A {fmt(rx)} {fmt(ry)} 0 0 1 {fmt(x)} {fmt(y+h-ry)} V {fmt(y+ry)} "
                f"A {fmt(rx)} {fmt(ry)} 0 0 1 {fmt(x+rx)} {fmt(y)} Z")
    if tag == "line":
        return f"M {fmt(f(e,'x1'))} {fmt(f(e,'y1'))} L {fmt(f(e,'x2'))} {fmt(f(e,'y2'))}"
    if tag in ("polyline", "polygon"):
        pts = [fmt(float(v)) for v in NUM.findall(e.get("points"))]
        d = "M " + " L ".join(f"{pts[j]} {pts[j+1]}" for j in range(0, len(pts), 2))
        return d + (" Z" if tag == "polygon" else "")
    raise ValueError("unsupported element " + tag)

def lucide_paths(name):
    root = ET.parse(os.path.join(LUC, "icons", name + ".svg")).getroot()
    return [shape_to_path(e) for e in root.iter() if e.tag.split("}")[-1] in
            ("path", "circle", "ellipse", "rect", "line", "polyline", "polygon")]

def vector_xml(name, filled):
    body = []
    for d in lucide_paths(name):
        body.append(
            '    <path\n'
            f'        android:fillColor="{"#FF000000" if filled else "#00000000"}"\n'
            '        android:strokeColor="#FF000000"\n'
            f'        android:strokeWidth="{STROKE}"\n'
            '        android:strokeLineCap="round"\n'
            '        android:strokeLineJoin="round"\n'
            f'        android:pathData="{d}" />')
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            f'<!-- Lucide "{name}" (ISC licence, lucide.dev), stroke {STROKE}{", filled" if filled else ""} -->\n'
            '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
            '    android:width="24dp"\n    android:height="24dp"\n'
            '    android:viewportWidth="24"\n    android:viewportHeight="24">\n'
            + "\n".join(body) + "\n</vector>\n")

def svg_preview(name, filled, x, y):
    paths = "".join(f'<path d="{d}"/>' for d in lucide_paths(name))
    return (f'<g transform="translate({x},{y}) scale(2)" fill="{"#fff" if filled else "none"}" stroke="#fff" '
            f'stroke-width="{STROKE}" stroke-linecap="round" stroke-linejoin="round">{paths}</g>')

# ---------- project scaffold ----------
if os.path.exists(OUT):
    shutil.rmtree(OUT)
shutil.copytree(TPL, OUT, ignore=shutil.ignore_patterns(".git", "drawable", "docs", "tools", "build", "README.md"))
os.makedirs(f"{OUT}/app/src/main/res/drawable")
old_java = f"{OUT}/app/src/main/java/app"
src = open(f"{old_java}/symfonium/iconpack/materialsymbols/SymfoniumIconPackService.java").read()
shutil.rmtree(old_java)
jdir = f"{OUT}/app/src/main/java/" + PKG.replace(".", "/")
os.makedirs(jdir)
open(f"{jdir}/SymfoniumIconPackService.java", "w").write(
    src.replace("package app.symfonium.iconpack.materialsymbols;", f"package {PKG};"))

g = open(f"{OUT}/app/build.gradle.kts").read()
g = g.replace('namespace = "app.symfonium.iconpack.materialsymbols"', f'namespace = "{PKG}"')
g = g.replace('applicationId = "app.symfonium.iconpack.materialsymbols"', f'applicationId = "{PKG}"')
g = g.replace('''    compileOptions {''', '''    signingConfigs {
        // Fixed, non-secret signing key so every CI build can update the previous one.
        // Not a publisher identity: sign with your own key before uploading anywhere.
        create("clearplay") {
            storeFile = file("clearplay-iconpack.jks")
            storePassword = "clearplay"
            keyAlias = "clearplay"
            keyPassword = "clearplay"
        }
    }

    buildTypes {
        getByName("debug") { signingConfig = signingConfigs.getByName("clearplay") }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("clearplay")
        }
    }

    compileOptions {''')
open(f"{OUT}/app/build.gradle.kts", "w").write(g)
open(f"{OUT}/app/src/main/res/values/strings.xml", "w").write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">ClearPlay Icons for Symfonium</string>\n</resources>\n')

# Launcher icon: the ClearPlay disc on a white rounded square.
open(f"{OUT}/app/src/main/res/drawable/ic_pack_launcher.xml", "w").write('''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#FFFFFFFF"
        android:pathData="M30 6 H78 A24 24 0 0 1 102 30 V78 A24 24 0 0 1 78 102 H30 A24 24 0 0 1 6 78 V30 A24 24 0 0 1 30 6 Z" />
    <path android:fillColor="#FF111114"
        android:pathData="M20 54 A34 34 0 1 0 88 54 A34 34 0 1 0 20 54 Z" />
    <path android:strokeColor="#FFFFFFFF" android:strokeWidth="2" android:fillColor="#00000000"
        android:pathData="M30 54 A24 24 0 1 0 78 54 A24 24 0 1 0 30 54 Z" />
    <path android:strokeColor="#FFFFFFFF" android:strokeWidth="2" android:fillColor="#00000000"
        android:pathData="M38 54 A16 16 0 1 0 70 54 A16 16 0 1 0 38 54 Z" />
    <path android:fillColor="#FFFFFFFF"
        android:pathData="M48 58 A12 12 0 1 0 72 58 A12 12 0 1 0 48 58 Z" />
</vector>
''')

keymap = json.load(open(KEYMAP))
made, entries, skipped = {}, [], []
for key, srcname in keymap.items():
    base = srcname.replace("-fill", "")
    luc = M2L.get(base)
    if not luc:
        skipped.append(key); continue
    want_fill = srcname.endswith("-fill") or key.endswith(STATE_SUFFIX)
    filled = luc in ALWAYS_FILL or (want_fill and luc in FILLABLE)
    res = "ic_cp_" + luc.replace("-", "_") + ("_filled" if filled else "")
    if res not in made:
        open(f"{OUT}/app/src/main/res/drawable/{res}.xml", "w").write(vector_xml(luc, filled))
        made[res] = (luc, filled)
    entries.append(f'        <icon key="{key}" drawable="@drawable/{res}" />')

open(f"{OUT}/app/src/main/res/xml/symfonium_icon_pack.xml", "w").write(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<!-- Unmapped keys (provider logos, numbered badges) keep Symfonium\'s built-in icons. -->\n'
    '<symfonium-icon-pack version="1">\n'
    f'    <pack id="{PACK_ID}" label="ClearPlay (Lucide)">\n' + "\n".join(entries) + "\n    </pack>\n</symfonium-icon-pack>\n")

shutil.copy(os.path.join(LUC, "LICENSE"), f"{OUT}/LICENSE-Lucide.txt")
open(f"{OUT}/THIRD_PARTY_NOTICES.md", "w").write(
    "# Third-party notices\n\n"
    "- **Icons:** [Lucide](https://lucide.dev) " + json.load(open(os.path.join(LUC, "package.json")))["version"]
    + ", ISC licence (parts derived from Feather, MIT). Full text: `LICENSE-Lucide.txt`. "
    "Converted to Android vector drawables with a 1.75 stroke.\n"
    "- **Project template:** [symfonium-icon-pack-template](https://github.com/Tolriq/symfonium-icon-pack-template), "
    "MIT licence, see `LICENSE`.\n")

# Keystore (fixed, non-secret; see build.gradle.kts note)
ks = f"{OUT}/app/clearplay-iconpack.jks"
keep = os.path.join(os.path.dirname(__file__), "clearplay-iconpack.jks")
if not os.path.exists(keep):
    subprocess.run(["keytool", "-genkeypair", "-keystore", keep, "-storepass", "clearplay", "-keypass", "clearplay",
                    "-alias", "clearplay", "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
                    "-dname", "CN=ClearPlay Icons, O=ClearPlay"], check=True, capture_output=True)
shutil.copy(keep, ks)

# ---------- preview sheet ----------
items = sorted(made.items(), key=lambda kv: kv[0])
cols, cell = 16, 64
rows = math.ceil(len(items) / cols)
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{cols*cell}" height="{rows*cell}">'
       f'<rect width="100%" height="100%" fill="#16161c"/>']
for n, (res, (luc, filled)) in enumerate(items):
    svg.append(svg_preview(luc, filled, (n % cols) * cell + 8, (n // cols) * cell + 8))
svg.append("</svg>")
open(PREVIEW + ".svg", "w").write("".join(svg))
subprocess.run(["rsvg-convert", PREVIEW + ".svg", "-o", PREVIEW], check=True)
print(f"keys mapped {len(entries)}/{len(keymap)}, drawables {len(made)}, left built-in {len(skipped)}")
