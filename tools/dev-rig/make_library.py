"""Generate a small test library: albums with covers, tagged MP3s and .lrc lyrics."""
import math, os, random, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter
from mutagen.easyid3 import EasyID3

root = sys.argv[1]
random.seed(7)
albums = [
    ("Neon Tides", "Mira Vale", 2024, [(255, 80, 160), (90, 40, 200)], "Synthpop"),
    ("Paper Lanterns", "Oskar Lind", 2021, [(255, 170, 60), (200, 60, 40)], "Indie"),
    ("Cold Harbour", "The Glass Rooms", 2019, [(40, 160, 200), (20, 40, 90)], "Ambient"),
    ("Велосипед", "Нощна смяна", 2023, [(120, 220, 140), (20, 90, 80)], "Pop"),
]
titles = ["Opening", "Afterglow", "Static Hearts", "Long Way Home", "Signal", "Low Tide", "Ember", "Outro"]

def cover(path, c1, c2):
    w = 800
    img = Image.new("RGB", (w, w), c2)
    d = ImageDraw.Draw(img)
    for i in range(14):
        r = random.randint(120, 380)
        x, y = random.randint(0, w), random.randint(0, w)
        t = random.random()
        col = tuple(int(c1[k] * t + c2[k] * (1 - t)) for k in range(3))
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)
    img = img.filter(ImageFilter.GaussianBlur(30))
    d = ImageDraw.Draw(img)
    d.rectangle([60, 60, w - 60, w - 60], outline=(255, 255, 255), width=6)
    img.save(path, quality=90)

for album, artist, year, cols, genre in albums:
    folder = os.path.join(root, artist, album)
    os.makedirs(folder, exist_ok=True)
    cover(os.path.join(folder, "cover.jpg"), *cols)
    n = random.randint(5, 8)
    for i in range(n):
        title = titles[i]
        dur = random.randint(35, 70)
        f = os.path.join(folder, f"{i+1:02d} - {title}.mp3")
        freq = 220 * 2 ** (random.randint(0, 12) / 12)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                        f"sine=frequency={freq:.1f}:duration={dur}", "-af", "volume=0.15",
                        "-b:a", "128k", f], check=True)
        tags = EasyID3()
        tags.update({"title": title, "artist": artist, "albumartist": artist, "album": album,
                     "date": str(year), "tracknumber": f"{i+1}/{n}", "genre": genre})
        tags.save(f)
        lines = ["[ar:%s]" % artist, "[ti:%s]" % title]
        words = ["Lights are fading on the water", "Every signal finds its way",
                 "Hold the moment, let it linger", "We were dancing in the static",
                 "Counting colours in the dark", "Нека песента остане тук", "Until the morning comes around"]
        t = 2.0
        while t < dur - 3:
            lines.append("[%02d:%05.2f]%s" % (t // 60, t % 60, random.choice(words)))
            t += random.uniform(3.5, 6)
        open(f[:-4] + ".lrc", "w").write("\n".join(lines) + "\n")
print("done")
