#!/bin/bash
# Rebuilds the embedded-lyrics fixtures in tools/dev-rig/fixtures (committed,
# so CI needs neither ffmpeg nor mutagen). Needs ffmpeg and python3 + mutagen.
# Usage: tools/dev-rig/make-lyrics-fixtures.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/fixtures"
mkdir -p "$OUT"

# FLAC with a Vorbis LYRICS tag (the 0.6.0 bug report's file).
LYRICS=$'[ar:Test]\n[offset:+300]\n[00:05.00]First line\n[00:08]No fraction line\n[00:10.50][01:20.00]Chorus line (repeats)\n[0:15.00]One-digit minute\n[00:20.00]<00:20.00>Word <00:20.60>by <00:21.10>word'
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=440:sample_rate=8000:duration=1" \
  -ac 1 -c:a flac -metadata title="Lyrics fixture" -metadata artist=Test \
  -metadata "LYRICS=$LYRICS" "$OUT/local-lyrics.flac"

# MP3s with ID3 SYLT only: milliseconds (syllables, a leading \n starts a
# line) and MPEG frames (not usable as times: unsynced).
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=440:sample_rate=8000:duration=1" \
  -ac 1 -c:a libmp3lame -b:a 8k "$OUT/sylt-ms.mp3"
cp "$OUT/sylt-ms.mp3" "$OUT/sylt-frames.mp3"
python3 - "$OUT" <<'PY'
import sys
from mutagen.id3 import ID3, SYLT, Encoding
out = sys.argv[1]
syllables = [('Hel', 1000), ('lo ', 1300), ('world', 1600),
             ('\nSecond ', 4000), ('line', 4400), ('\nThird line', 9000)]
for name, fmt in (('sylt-ms.mp3', 2), ('sylt-frames.mp3', 1)):
    tags = ID3()
    tags.add(SYLT(encoding=Encoding.UTF8, lang='eng', format=fmt, type=1,
                  desc='', text=syllables))
    tags.save(f'{out}/{name}')
PY
ls -la "$OUT"
