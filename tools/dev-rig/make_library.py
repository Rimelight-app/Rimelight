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

# Lossless files at different rates and depths for the bit-perfect (mpv) tests.
from mutagen.flac import FLAC
folder = os.path.join(root, "Test Signals", "Rates and Depths")
os.makedirs(folder, exist_ok=True)
cover(os.path.join(folder, "cover.jpg"), (230, 230, 240), (60, 60, 80))
formats = [(44100, 16), (48000, 24), (88200, 24), (96000, 24), (192000, 24)]
for i, (rate, bits) in enumerate(formats):
    title = f"{rate / 1000:g} kHz {bits}-bit"
    f = os.path.join(folder, f"{i+1:02d} - {title}.flac")
    fmt = "s16" if bits == 16 else "s32"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    f"sine=frequency={330 + 110 * i}:sample_rate={rate}:duration=25",
                    "-af", "volume=0.15", "-c:a", "flac", "-sample_fmt", fmt,
                    "-bits_per_raw_sample", str(bits), "-ar", str(rate), f], check=True)
    tags = FLAC(f)
    tags.update({"title": title, "artist": "Test Signals", "albumartist": "Test Signals",
                 "album": "Rates and Depths", "date": "2026", "tracknumber": f"{i+1}/{len(formats)}",
                 "genre": "Test"})
    tags.save()

# An album with two album artists (multi-valued ID3v2.4 TPE2), for the live
# covers (tools/dev-rig/e2e-live-covers.mjs). Songs are by Rig Artist A; one
# features Rig Artist C. Its own random generator keeps the albums above as
# they were.
rnd = random.Random(11)
duo_album, duo_artists = "Twin Signals", ["Rig Artist A", "Rig Artist B"]
folder = os.path.join(root, "Rig Artist A", duo_album)
os.makedirs(folder, exist_ok=True)
cover(os.path.join(folder, "cover.jpg"), (250, 210, 70), (30, 70, 150))
duo_songs = [("First Light", ["Rig Artist A"]), ("Crossing", ["Rig Artist A", "Rig Artist C"]),
             ("Second Wind", ["Rig Artist A"])]
for i, (title, artists) in enumerate(duo_songs):
    f = os.path.join(folder, f"{i+1:02d} - {title}.mp3")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    f"sine=frequency={262 + 40 * i}:duration={rnd.randint(40, 60)}",
                    "-af", "volume=0.15", "-b:a", "128k", f], check=True)
    tags = EasyID3()
    tags.update({"title": title, "artist": artists, "albumartist": duo_artists, "album": duo_album,
                 "date": "2025", "tracknumber": f"{i+1}/{len(duo_songs)}", "genre": "Synthpop"})
    tags.save(f, v2_version=4)
print("done")
