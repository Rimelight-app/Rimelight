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

Source code: https://github.com/mpv-player/mpv/tree/v0.41.0 . The build
script that produced the binaries is `ci/build-mingw64.sh` in that tree; it
fetches the libraries below from their projects' repositories.

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
