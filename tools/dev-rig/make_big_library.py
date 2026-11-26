#!/usr/bin/env python3
"""Big test library for performance and breakage checks (ClearPlay desktop
0.6.1 audit, reused by ClearPlay for Android).

Usage:
    python3 make_big_library.py MUSIC_DIR [LOCAL_DIR] [--artists N] [--albums N]
        [--songs-per-album N] [--seed N] [--no-covers]

Writes, in about 10 s on a laptop (Navidrome then needs about 3 min to scan):
  MUSIC_DIR (scan it with Navidrome)
    - ARTISTS artists and ALBUMS albums of SONGS_PER_ALBUM short songs
      (defaults 2 000 / 5 000 / 10, i.e. 50 000 songs), each album with a
      small cover except every 50th one (albums without a cover)
    - "Big Album" by "Long Player": one album of 500 songs
    - "Three Discs" by "Long Player": 3 discs of 8 songs (disc headers)
    - "Three Hours" by "Long Player": one 3-hour song
    - "Fault Test" by "Rig": 5 real 20-second songs, for the fault proxy
      (break song 3 of 5 with fault-proxy.mjs)
    - "Comment Injection" by "Audit Test": one song whose comment tag is
      HTML with a script in it (must render as text), one with a normal
      comment with a link and line breaks
    - "Names" by "Нощна смяна": non-Latin, RTL, emoji and 300-character names
    - Playlists, imported by Navidrome from .m3u files at the top level:
      "Big Playlist 10000" (10 000 songs) and "Playlist 300" (300 songs)
  LOCAL_DIR (optional; for "Music on this computer")
    - 20 real songs and 5 corrupt files (empty, truncated, text named .mp3,
      zero-length .flac, random bytes)

Needs ffmpeg (for the few real audio files) and Pillow (covers). Tags are
written directly as ID3v2.4 (UTF-8), so no mutagen and no per-file ffmpeg.
"""
import argparse
import os
import random
import struct
import subprocess
import sys
import tempfile

ap = argparse.ArgumentParser()
ap.add_argument("music")
ap.add_argument("local", nargs="?")
ap.add_argument("--artists", type=int, default=2000)
ap.add_argument("--albums", type=int, default=5000)
ap.add_argument("--songs-per-album", type=int, default=10)
ap.add_argument("--seed", type=int, default=61)
ap.add_argument("--no-covers", action="store_true")
args = ap.parse_args()
random.seed(args.seed)

MUSIC = os.path.abspath(args.music)
os.makedirs(MUSIC, exist_ok=True)
if os.listdir(MUSIC):
    sys.exit(f"{MUSIC} is not empty; give an empty folder")


# ---------------------------------------------------------------- audio
def ffmpeg(*a):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)


def mp3_template(seconds, freq, path, rate=16000, kbps=16):
    """An MP3 without tags (a Xing header so the duration is exact)."""
    ffmpeg("-f", "lavfi", "-i", f"sine=frequency={freq}:sample_rate={rate}:duration={seconds}",
           "-af", "volume=0.12", "-ac", "1", "-b:a", f"{kbps}k", "-id3v2_version", "0",
           "-write_xing", "1", path)
    with open(path, "rb") as f:
        return f.read()


tmp = tempfile.mkdtemp(prefix="cp-big-")
SHORT = mp3_template(6, 440, os.path.join(tmp, "short.mp3"))  # most songs
REAL = [mp3_template(20, 220 + 55 * i, os.path.join(tmp, f"real{i}.mp3"), 44100, 64) for i in range(5)]
HOURS = mp3_template(3 * 3600, 330, os.path.join(tmp, "hours.mp3"), 8000, 8)


# ---------------------------------------------------------------- tags
def syncsafe(n):
    return bytes([(n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F])


def frame(fid, payload):
    return fid.encode() + syncsafe(len(payload)) + b"\x00\x00" + payload


def text(fid, value):
    return frame(fid, b"\x03" + value.encode("utf-8"))


def comment(value):
    return frame("COMM", b"\x03" + b"eng" + b"\x00" + value.encode("utf-8"))


def id3(t):
    frames = b"".join([
        text("TIT2", t["title"]), text("TPE1", t["artist"]), text("TPE2", t["albumartist"]),
        text("TALB", t["album"]), text("TRCK", t["track"]), text("TDRC", str(t["year"])),
        text("TCON", t["genre"]),
        *([text("TPOS", t["disc"])] if t.get("disc") else []),
        *([comment(t["comment"])] if t.get("comment") else []),
    ])
    return b"ID3\x04\x00\x00" + syncsafe(len(frames)) + frames


def write_song(folder, n, tags, audio=SHORT):
    name = f"{n:03d} - {safe(tags['title'])[:80]}.mp3"
    path = os.path.join(folder, name)
    with open(path, "wb") as f:
        f.write(id3(tags))
        f.write(audio)
    return path


def safe(s):
    return "".join("_" if c in '/\\:*?"<>|' else c for c in s).strip() or "_"


# ---------------------------------------------------------------- covers
def cover(folder, seed):
    if args.no_covers:
        return
    from PIL import Image, ImageDraw
    r = random.Random(seed)
    c1 = tuple(r.randint(30, 230) for _ in range(3))
    c2 = tuple(r.randint(10, 120) for _ in range(3))
    img = Image.new("RGB", (240, 240), c2)
    d = ImageDraw.Draw(img)
    for _ in range(3):
        x, y, rad = r.randint(0, 240), r.randint(0, 240), r.randint(40, 120)
        d.ellipse([x - rad, y - rad, x + rad, y + rad], fill=c1)
    img.save(os.path.join(folder, "cover.jpg"), quality=70)


GENRES = ["Rock", "Pop", "Jazz", "Ambient", "Electronic", "Folk", "Classical", "Hip-Hop", "Metal", "Soul"]
WORDS = ["Neon", "Paper", "Cold", "Silver", "Quiet", "Velvet", "Static", "Golden", "Hollow", "Distant",
         "River", "Signal", "Harbour", "Ember", "Glass", "Winter", "Lantern", "Echo", "Orbit", "Tide"]
NONLATIN = ["Нощна смяна", "Ветрове", "夜の街", "서울의 밤", "Πρωινό", "ليل", "שקט", "Ночной поезд"]


def artist_name(i):
    if i % 250 == 0:
        return f"{NONLATIN[(i // 250) % len(NONLATIN)]} {i:04d}"
    return f"{WORDS[i % 20]} {WORDS[(i // 20) % 20]} {i:04d}"


all_songs = []  # relative paths, in a stable order


def album(artist, title, year, songs, folder_seed, with_cover=True, audio=SHORT,
          genre=None, disc_of=None, comments=None):
    folder = os.path.join(MUSIC, safe(artist)[:60], safe(title)[:60])
    os.makedirs(folder, exist_ok=True)
    if with_cover:
        cover(folder, folder_seed)
    genre = genre or GENRES[folder_seed % len(GENRES)]
    paths = []
    for n, song_title in enumerate(songs, start=1):
        tags = {"title": song_title, "artist": artist, "albumartist": artist, "album": title,
                "track": f"{n}/{len(songs)}", "year": year, "genre": genre}
        if disc_of:
            tags["disc"], tags["track"] = disc_of(n)
        if comments and n - 1 < len(comments) and comments[n - 1]:
            tags["comment"] = comments[n - 1]
        a = audio[(n - 1) % len(audio)] if isinstance(audio, list) else audio
        paths.append(write_song(folder, n, tags, a))
    rel = [os.path.relpath(p, MUSIC) for p in paths]
    all_songs.extend(rel)
    return rel


# ---------------------------------------------------------------- the bulk
for a in range(args.albums):
    ar = a % args.artists
    artist = artist_name(ar)
    title = f"{WORDS[a % 20]} {WORDS[(a * 7) % 20]} {a:05d}"
    songs = [f"{WORDS[(a + s) % 20]} {WORDS[(a * 3 + s) % 20]} {s + 1}" for s in range(args.songs_per_album)]
    album(artist, title, 1960 + a % 66, songs, a, with_cover=(a % 50 != 49))

# ---------------------------------------------------------------- specials
big = album("Long Player", "Big Album", 2024, [f"Track {i:03d}" for i in range(1, 501)], 90001)
album("Long Player", "Three Discs", 2022, [f"Disc {(i - 1) // 8 + 1} Song {(i - 1) % 8 + 1}" for i in range(1, 25)],
      90002, disc_of=lambda n: (f"{(n - 1) // 8 + 1}/3", f"{(n - 1) % 8 + 1}/8"))
album("Long Player", "Three Hours", 2020, ["Three Hours"], 90003, audio=HOURS)
album("Rig", "Fault Test", 2026, [f"Fault Song {i}" for i in range(1, 6)], 90004, audio=REAL)
album("Audit Test", "Comment Injection", 2026, ["Injected Comment", "Normal Comment"], 90005, audio=REAL,
      comments=[
          'Liner notes <img src="x" onerror="document.title=\'CP-INJECTED\'">',
          "Recorded live in Sofia, 2019.\nMore at https://example.com/live?a=1&b=2\n\nContact: info@example.com",
      ])
long_name = ("A very long title that keeps going " * 10)[:300]
album("Нощна смяна", "Names", 2023,
      ["Велосипед", "夜の街を歩く", "שיר ערש", "أغنية الليل", "Emoji 🎧🌙✨", long_name], 90006)

# ---------------------------------------------------------------- playlists
def m3u(name, rel_paths):
    with open(os.path.join(MUSIC, f"{name}.m3u"), "w", encoding="utf-8") as f:
        f.write("#EXTM3U\n")
        for p in rel_paths:
            f.write(p + "\n")


bulk = [p for p in all_songs if not p.startswith(("Long Player", "Rig", "Audit Test"))]
m3u("Big Playlist 10000", bulk[:10000])
m3u("Playlist 300", random.Random(3).sample(bulk, 300))

# ---------------------------------------------------------------- local folder
if args.local:
    LOCAL = os.path.abspath(args.local)
    os.makedirs(LOCAL, exist_ok=True)
    folder = os.path.join(LOCAL, "Local Artist", "Local Album")
    os.makedirs(folder, exist_ok=True)
    # The corrupt files sort first, so "play the folder" starts with one.
    open(os.path.join(folder, "000 - Empty.mp3"), "wb").close()
    with open(os.path.join(folder, "000 - Truncated.mp3"), "wb") as f:
        f.write(REAL[0][:2000])
    with open(os.path.join(folder, "000 - Text.mp3"), "w") as f:
        f.write("this is not audio\n")
    open(os.path.join(folder, "000 - Zero.flac"), "wb").close()
    with open(os.path.join(folder, "000 - Noise.mp3"), "wb") as f:
        f.write(random.Random(5).randbytes(50000))
    for n in range(1, 21):
        write_song(folder, n, {"title": f"Local Song {n}", "artist": "Local Artist",
                               "albumartist": "Local Artist", "album": "Local Album",
                               "track": f"{n}/20", "year": 2026, "genre": "Test"}, REAL[n % 5])

print(f"{len(all_songs)} songs, {args.albums + 6} albums, {args.artists + 4} artists in {MUSIC}")
