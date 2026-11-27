#!/usr/bin/env python3
"""Adds what the Android audit needs to the desktop's big test library
(git show v0.6.2:tools/dev-rig/make_big_library.py, used unchanged), and makes phone music.

Usage:
    python3 extend_big_library.py MUSIC_DIR [--phone PHONE_DIR] [--phone-songs 5000]

MUSIC_DIR must already hold make_big_library.py's output. Adds:
  - "Playlist 500" (500 songs) and 197 more small playlists, so there are 200 in all
    (with "Big Playlist 10000" and "Playlist 300" from the generator)
  - "Lyrics" by "Rig": 10 real 20-second songs, each with a synced .lrc next to it
  - "Huge Covers" by "Rig": 3 songs, cover.jpg 4000x4000 (about 0.4 MB)
  - "No Tags" folder: 10 songs with no ID3 tags at all (Navidrome falls back to the
    file name; no album, artist, year or genre), and 5 with only a title
PHONE_DIR (for /sdcard/Music on the emulator; push it with adb push):
  - PHONE_SONGS short MP3s in 100 albums of 50, tagged, every 10th album with an
    embedded-art-free folder; plus 8 corrupt files (empty, truncated, text, noise, zero FLAC)

The desktop generator stays unchanged; everything extra is here, so both can be reused.
Needs ffmpeg and Pillow (python3 with PYTHONPATH=~/clearplay-rig/pylib on hp-server).
"""
import argparse
import os
import random
import subprocess
import sys
import tempfile

ap = argparse.ArgumentParser()
ap.add_argument("music")
ap.add_argument("--phone")
ap.add_argument("--phone-songs", type=int, default=5000)
ap.add_argument("--seed", type=int, default=162)
args = ap.parse_args()
rnd = random.Random(args.seed)
MUSIC = os.path.abspath(args.music)
if not os.path.exists(os.path.join(MUSIC, "Big Playlist 10000.m3u")):
    sys.exit(f"{MUSIC} doesn't look like make_big_library.py output")

tmp = tempfile.mkdtemp(prefix="rl-ext-")


def ffmpeg(*a):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)


def mp3(seconds, freq, rate=44100, kbps=64):
    path = os.path.join(tmp, f"t{seconds}-{freq}-{rate}.mp3")
    ffmpeg("-f", "lavfi", "-i", f"sine=frequency={freq}:sample_rate={rate}:duration={seconds}",
           "-af", "volume=0.12", "-ac", "1", "-b:a", f"{kbps}k", "-id3v2_version", "0", "-write_xing", "1", path)
    return open(path, "rb").read()


def syncsafe(n):
    return bytes([(n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F])


def frame(fid, payload):
    return fid.encode() + syncsafe(len(payload)) + b"\x00\x00" + payload


def text(fid, value):
    return frame(fid, b"\x03" + value.encode("utf-8"))


def id3(tags):
    frames = b"".join(text(k, v) for k, v in tags.items())
    return b"ID3\x04\x00\x00" + syncsafe(len(frames)) + frames if frames else b""


def song(folder, name, tags, audio):
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name)
    with open(path, "wb") as f:
        f.write(id3(tags))
        f.write(audio)
    return path


REAL = mp3(20, 260)
SHORT = mp3(6, 440, 16000, 16)

# ---------------------------------------------------------------- synced lyrics
lyr = os.path.join(MUSIC, "Rig", "Lyrics")
for n in range(1, 11):
    t = f"Lyrics Song {n}"
    p = song(lyr, f"{n:03d} - {t}.mp3", {"TIT2": t, "TPE1": "Rig", "TPE2": "Rig", "TALB": "Lyrics",
                                          "TRCK": f"{n}/10", "TDRC": "2026", "TCON": "Test"}, REAL)
    with open(p[:-4] + ".lrc", "w", encoding="utf-8") as f:
        f.write(f"[ti:{t}]\n[ar:Rig]\n")
        for s in range(0, 20, 2):
            f.write(f"[00:{s:02d}.00]Line {s // 2 + 1} of song {n}\n")

# ---------------------------------------------------------------- 4000 px covers
from PIL import Image, ImageDraw  # noqa: E402

huge = os.path.join(MUSIC, "Rig", "Huge Covers")
for n in range(1, 4):
    t = f"Huge Cover {n}"
    song(huge, f"{n:03d} - {t}.mp3", {"TIT2": t, "TPE1": "Rig", "TPE2": "Rig", "TALB": "Huge Covers",
                                       "TRCK": f"{n}/3", "TDRC": "2026", "TCON": "Test"}, REAL)
img = Image.new("RGB", (4000, 4000), (240, 236, 228))
d = ImageDraw.Draw(img)
for i in range(60):  # detail, so the JPEG isn't tiny
    x, y, r = rnd.randint(0, 4000), rnd.randint(0, 4000), rnd.randint(100, 900)
    d.ellipse([x - r, y - r, x + r, y + r], fill=tuple(rnd.randint(150, 255) for _ in range(3)))
img.save(os.path.join(huge, "cover.jpg"), quality=92)

# ---------------------------------------------------------------- missing tags
nt = os.path.join(MUSIC, "No Tags")
for n in range(1, 11):
    song(nt, f"untagged {n:02d}.mp3", {}, SHORT)
for n in range(1, 6):
    song(nt, f"title only {n:02d}.mp3", {"TIT2": f"Only A Title {n}"}, SHORT)

# ---------------------------------------------------------------- playlists (200 in all)
bulk = []
for root, _, files in os.walk(MUSIC):
    rel = os.path.relpath(root, MUSIC)
    if rel.startswith(("Long Player", "Rig", "Audit Test", "No Tags", "Нощна смяна")) or rel == ".":
        continue
    bulk.extend(os.path.join(rel, f) for f in files if f.endswith(".mp3"))
bulk.sort()


def m3u(name, paths):
    with open(os.path.join(MUSIC, f"{name}.m3u"), "w", encoding="utf-8") as f:
        f.write("#EXTM3U\n" + "".join(p + "\n" for p in paths))


m3u("Playlist 500", rnd.sample(bulk, 500))
for i in range(1, 198):
    m3u(f"Mix {i:03d}", rnd.sample(bulk, rnd.randint(5, 60)))

# ---------------------------------------------------------------- phone music
if args.phone:
    PHONE = os.path.abspath(args.phone)
    os.makedirs(PHONE, exist_ok=True)
    per = 50
    for a in range(args.phone_songs // per):
        folder = os.path.join(PHONE, f"Phone Artist {a % 40:02d}", f"Phone Album {a:03d}")
        for n in range(1, per + 1):
            t = f"Phone Song {a:03d}-{n:02d}"
            song(folder, f"{n:02d} - {t}.mp3", {"TIT2": t, "TPE1": f"Phone Artist {a % 40:02d}",
                                                 "TPE2": f"Phone Artist {a % 40:02d}", "TALB": f"Phone Album {a:03d}",
                                                 "TRCK": f"{n}/{per}", "TDRC": str(2000 + a % 26), "TCON": "Phone"}, SHORT)
    bad = os.path.join(PHONE, "Corrupt")
    os.makedirs(bad, exist_ok=True)
    open(os.path.join(bad, "empty.mp3"), "wb").close()
    open(os.path.join(bad, "zero.flac"), "wb").close()
    with open(os.path.join(bad, "truncated.mp3"), "wb") as f:
        f.write(REAL[:3000])
    with open(os.path.join(bad, "text.mp3"), "w") as f:
        f.write("not audio\n")
    for k in range(4):
        with open(os.path.join(bad, f"noise{k}.mp3"), "wb") as f:
            f.write(rnd.randbytes(40000))

print(f"extended {MUSIC}" + (f"; phone music in {args.phone}" if args.phone else ""))
