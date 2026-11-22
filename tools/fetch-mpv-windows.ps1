# Downloads the official mpv build for Windows into resources/mpv, where the
# installer picks it up (electron-builder copies resources/ into the app).
# Used by .github/workflows/build.yml; run it by hand before `pnpm build:win`
# on a Windows machine. Pinned version + checksum: change both together, and
# update the sources in tools/fetch-mpv-source.sh (GPL source archive).
$ErrorActionPreference = 'Stop'
$version = 'v0.41.0'
$name = "mpv-$version-x86_64-w64-mingw32.zip"
$sha256 = 'a49811c0752c108b8260636f9c6f6fcb97406641c98b30f1e7b500dfb20177de'
$url = "https://github.com/mpv-player/mpv/releases/download/$version/$name"

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root 'resources\mpv'
$tmp = Join-Path ([IO.Path]::GetTempPath()) "clearplay-mpv-$PID"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$zip = Join-Path $tmp $name
Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
if ($hash -ne $sha256) { throw "mpv download checksum mismatch: $hash" }

# The release zip holds one more zip with the files.
Expand-Archive $zip -DestinationPath (Join-Path $tmp 'outer') -Force
$inner = Get-ChildItem (Join-Path $tmp 'outer') -Filter *.zip | Select-Object -First 1
if (-not $inner) { throw 'unexpected mpv archive layout' }
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Expand-Archive $inner.FullName -DestinationPath $dest -Force

# Not needed: shell registration helpers.
Remove-Item (Join-Path $dest 'mpv-register.bat'), (Join-Path $dest 'mpv-unregister.bat') -ErrorAction SilentlyContinue
# The licence travels with the binaries.
Copy-Item (Join-Path $root 'licenses\mpv\*') $dest -Force

if (-not (Test-Path (Join-Path $dest 'mpv.exe'))) { throw 'mpv.exe missing after extraction' }
Remove-Item $tmp -Recurse -Force
Write-Host "mpv $version is in $dest"
