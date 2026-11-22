#!/usr/bin/env bash
# Builds the source archive for the mpv build that the Windows installer
# ships (tools/fetch-mpv-windows.ps1), as the GPL asks of whoever distributes
# the binaries. Used by .github/workflows/build.yml for every release.
#
#   tools/fetch-mpv-source.sh OUT.tar.gz
#
# The official mpv v0.41.0 Windows build (ci/build-mingw64.sh in the mpv
# source) fetched FFmpeg and libplacebo from their git repositories without
# pinning a commit. The commits below were read from the shipped DLLs and the
# repositories' history (see licenses/mpv/README.md). The script checks the
# DLLs again before it builds anything, so a new mpv pin in
# fetch-mpv-windows.ps1 fails here until this list is updated too.
set -euo pipefail

OUT=$(realpath -m "${1:?usage: fetch-mpv-source.sh OUT.tar.gz}")

# Must match tools/fetch-mpv-windows.ps1.
MPV_ZIP_URL=https://github.com/mpv-player/mpv/releases/download/v0.41.0/mpv-v0.41.0-x86_64-w64-mingw32.zip
MPV_ZIP_SHA256=a49811c0752c108b8260636f9c6f6fcb97406641c98b30f1e7b500dfb20177de

# name | git URL | commit | string the shipped binary carries
GIT_SOURCES=(
  "mpv|https://github.com/mpv-player/mpv.git|41f6a645068483470267271e1d09966ca3b9f413|mpv.exe:mpv v0.41.0-dev-g41f6a6450"
  "ffmpeg|https://github.com/FFmpeg/FFmpeg.git|1fcb201ab10cbc98d931e340da6ace292e82b1e1|avutil-60.dll:FFmpeg version git-2025-12-21-1fcb201"
  "libplacebo|https://github.com/haasn/libplacebo.git|47587a2d47299f7261a01b77e989b74f80a99769|libplacebo-358.dll:v7.358.0"
)
# name | URLs (space separated, tried in order) | SHA-256 | binary check
TARBALLS=(
  "fribidi-1.0.16.tar.xz|https://github.com/fribidi/fribidi/releases/download/v1.0.16/fribidi-1.0.16.tar.xz|1b1cde5b235d40479e91be2f0e88a309e3214c8ab470ec8a2744d82a5a9ea05c|libfribidi-0.dll:(GNU FriBidi) 1.0.16"
  "libiconv-1.18.tar.gz|https://ftpmirror.gnu.org/gnu/libiconv/libiconv-1.18.tar.gz https://ftp.gnu.org/gnu/libiconv/libiconv-1.18.tar.gz|3b08f5f4f9b4eb82f151a7040bfd6fe6c6fb922efe4b1659c66ea933276965e8|"
)

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
STAGE="$WORK/mpv-source"
mkdir -p "$STAGE"

fetch() { # url... -> file
  local out=$1; shift
  for url in "$@"; do
    if curl -fsSL --retry 3 -o "$out" "$url"; then return 0; fi
    echo "  (failed: $url)" >&2
  done
  return 1
}

check_binary() { # "file:text"
  [[ -z $1 ]] && return 0
  local file=${1%%:*} text=${1#*:}
  if ! grep -aqF -- "$text" "$WORK/bin/$file"; then
    echo "error: $file does not say \"$text\": the mpv build changed;" >&2
    echo "update the sources in this script and licenses/mpv/README.md" >&2
    exit 1
  fi
}

echo "Checking the shipped mpv build"
fetch "$WORK/mpv.zip" "$MPV_ZIP_URL"
echo "$MPV_ZIP_SHA256  $WORK/mpv.zip" | sha256sum -c --quiet
mkdir -p "$WORK/outer" "$WORK/bin"
unzip -q "$WORK/mpv.zip" -d "$WORK/outer"
unzip -q "$WORK"/outer/*.zip -d "$WORK/bin"

{
  echo "Source code for the mpv build in the ClearPlay Windows installer"
  echo
  echo "Binary: $MPV_ZIP_URL"
  echo "SHA-256: $MPV_ZIP_SHA256"
  echo
  echo "How it was built: mpv/ci/build-mingw64.sh (official mpv CI, 2025-12-21)."
  echo "GPL/LGPL components, exact sources:"
} > "$STAGE/SOURCES.txt"

for entry in "${GIT_SOURCES[@]}"; do
  IFS='|' read -r name url commit check <<<"$entry"
  check_binary "$check"
  echo "Fetching $name at $commit"
  dir="$STAGE/$name"
  git init -q "$dir"
  git -C "$dir" fetch -q --depth 1 "$url" "$commit"
  git -C "$dir" -c advice.detachedHead=false checkout -q FETCH_HEAD
  # The mpv build cloned with --recursive: include submodules.
  git -C "$dir" submodule -q update --init --recursive --depth 1
  find "$dir" -name .git -prune -exec rm -rf {} +
  echo "  $name: $url @ $commit" >> "$STAGE/SOURCES.txt"
done

for entry in "${TARBALLS[@]}"; do
  IFS='|' read -r name urls sha check <<<"$entry"
  check_binary "$check"
  echo "Fetching $name"
  # shellcheck disable=SC2086
  fetch "$STAGE/$name" $urls
  echo "$sha  $STAGE/$name" | sha256sum -c --quiet
  echo "  $name: ${urls%% *} (SHA-256 $sha)" >> "$STAGE/SOURCES.txt"
done

cat >> "$STAGE/SOURCES.txt" <<'EOF'

The other libraries in the build are under permissive licences (see
licenses/mpv/README.md in ClearPlay) and are not included here.
EOF

echo "Packing $OUT"
tar --sort=name --mtime='2025-12-21 00:00Z' --owner=0 --group=0 --numeric-owner \
  -C "$WORK" -czf "$OUT" mpv-source
ls -lh "$OUT"
