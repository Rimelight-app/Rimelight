# mpv (Windows builds only)

The Windows installer of ClearPlay includes **mpv v0.41.0**, the official
`mpv-v0.41.0-x86_64-w64-mingw32.zip` build from
https://github.com/mpv-player/mpv/releases/tag/v0.41.0
(SHA-256 of the download: `a49811c0752c108b8260636f9c6f6fcb97406641c98b30f1e7b500dfb20177de`).
It is downloaded unchanged by `tools/fetch-mpv-windows.ps1` and installed in
`resources/resources/mpv/`. The Linux packages do not include mpv; ClearPlay
uses the mpv installed on the system.

ClearPlay runs mpv as a separate program and talks to it through mpv's JSON
IPC interface. ClearPlay's own code does not use, copy or link any mpv code.

## Licence

mpv is licensed under the GNU General Public License, version 2 or later
(`LICENSE.GPL`); parts are LGPL 2.1 or later (`LICENSE.LGPL`). See `Copyright`
(from the mpv source) for details. This build is GPL as a whole: its FFmpeg is
configured with `--enable-gpl`.

## Source code

Every ClearPlay release on GitHub has an archive
`ClearPlay-vX.Y.Z-mpv-source.tar.gz` next to the installer, at
https://github.com/tonihk00/ClearPlay/releases . It holds the exact source of
this build: mpv, FFmpeg and the LGPL libraries (FriBidi, libiconv,
libplacebo), plus `SOURCES.txt` with where each part came from. The archive
is made by `tools/fetch-mpv-source.sh`, which also checks that the shipped
DLLs carry these versions.

The binaries were made by mpv's own CI with `ci/build-mingw64.sh` (in the
mpv source) on 2025-12-21. That script fetched FFmpeg and libplacebo from git
without pinning a commit, so the commits below were read from the DLLs'
version strings and the projects' history:

| Part | Version in the binaries | Exact source |
|---|---|---|
| mpv | v0.41.0-dev-g41f6a6450 | tag v0.41.0, commit `41f6a645068483470267271e1d09966ca3b9f413` |
| FFmpeg | git-2025-12-21-1fcb201 | commit `1fcb201ab10cbc98d931e340da6ace292e82b1e1` |
| libplacebo | v7.358.0 | commit `47587a2d47299f7261a01b77e989b74f80a99769` (the last one before the build) |
| GNU FriBidi | 1.0.16 | `fribidi-1.0.16.tar.xz` (release tarball) |
| GNU libiconv | 1.18 (pinned by the build script) | `libiconv-1.18.tar.gz` (release tarball) |

The libraries under permissive licences (table below) need no source offer
and are not in the archive. Their projects are linked from mpv's build
script.

## Libraries in the build (DLLs next to mpv.exe)

| Files | Project | Licence |
|---|---|---|
| avcodec, avdevice, avfilter, avformat, avutil, swresample, swscale | FFmpeg (https://ffmpeg.org) | GPL 2+ (built with --enable-gpl) |
| libass-9.dll | libass | ISC |
| libdav1d.dll | dav1d | BSD-2-Clause |
| libfreetype-6.dll | FreeType | FreeType License (FTL) / GPL 2 |
| libfribidi-0.dll | GNU FriBidi | LGPL 2.1+ |
| libharfbuzz-0.dll | HarfBuzz | MIT ("Old MIT") |
| libiconv-2.dll | GNU libiconv | LGPL 2.1+ |
| liblcms2.dll | Little CMS | MIT |
| libplacebo-358.dll | libplacebo | LGPL 2.1+ |
| libshaderc_shared.dll | shaderc | Apache 2.0 |
| libspirv-cross-c-shared.dll | SPIRV-Cross | Apache 2.0 |
| vulkan-1.dll | Vulkan Loader | Apache 2.0 |
| zlib1.dll | zlib | zlib |
| libgcc_s_seh-1.dll, libstdc++-6.dll, libssp-0.dll | GCC runtime | GPL 3 with the GCC Runtime Library Exception |
| libwinpthread-1.dll | mingw-w64 winpthreads | MIT / BSD |
