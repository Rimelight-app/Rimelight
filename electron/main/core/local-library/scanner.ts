import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseFile } from 'music-metadata'

/** One audio file in the local library. */
export interface LocalTrack {
  id: string
  path: string
  folder: string
  mtime: number
  size: number
  title: string
  artist: string
  artists: string[]
  albumArtist: string
  album: string
  track?: number
  disc?: number
  year?: number
  genres: string[]
  duration: number
  bitRate?: number
  sampleRate?: number
  bitDepth?: number
  channels?: number
  suffix: string
  hasEmbeddedLyrics: boolean
  replayGain?: {
    trackGain?: number
    albumGain?: number
    trackPeak?: number
    albumPeak?: number
  }
  addedAt: number
}

export const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'flac',
  'ogg',
  'oga',
  'opus',
  'm4a',
  'aac',
  'mp4',
  'wav',
  'aif',
  'aiff',
  'wma',
  'webm',
  'ape',
  'wv',
])

export const hashId = (prefix: string, value: string) =>
  `${prefix}-${createHash('sha1').update(value).digest('hex').slice(0, 16)}`

/** All audio files under `root` (follows no symlinks to avoid loops). */
export async function listAudioFiles(root: string): Promise<string[]> {
  const out: string[] = []
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop() as string
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase()
        if (AUDIO_EXTENSIONS.has(ext)) out.push(full)
      }
    }
  }
  return out
}

// "AC/DC" is one artist, so only ";" and "feat." separate artists.
const splitArtists = (value: string) =>
  value
    .split(/\s*(?:;|\bfeat\.|\bft\.)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)

const splitGenres = (value: string) =>
  value
    .split(/\s*[;/,]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)

/** Reads tags and audio details of one file. */
export async function readTrack(
  file: string,
  folder: string,
  stat: { mtimeMs: number; size: number },
  addedAt: number,
): Promise<LocalTrack> {
  const ext = path.extname(file).slice(1).toLowerCase()
  const base = path.basename(file, path.extname(file))
  let meta: Awaited<ReturnType<typeof parseFile>> | null = null
  try {
    // Covers are read later, only when one is shown.
    meta = await parseFile(file, { duration: true, skipCovers: true })
  } catch {
    meta = null
  }
  const common = meta?.common
  const format = meta?.format
  const artist =
    common?.artist || common?.artists?.join(', ') || 'Unknown Artist'
  const artists = common?.artists?.length
    ? common.artists.flatMap(splitArtists)
    : splitArtists(artist)
  const rg = (v?: { dB?: number; ratio?: number }) =>
    typeof v?.dB === 'number' ? v.dB : undefined
  const peak = (v?: { ratio?: number }) =>
    typeof v?.ratio === 'number' ? v.ratio : undefined

  return {
    id: hashId('tr', file),
    path: file,
    folder,
    mtime: stat.mtimeMs,
    size: stat.size,
    title: common?.title || base,
    artist,
    artists: artists.length ? artists : ['Unknown Artist'],
    albumArtist: common?.albumartist || artists[0] || artist,
    album: common?.album || path.basename(path.dirname(file)),
    track: common?.track?.no ?? undefined,
    disc: common?.disk?.no ?? undefined,
    year: common?.year ?? undefined,
    genres: (common?.genre ?? []).flatMap(splitGenres),
    duration: Math.round(format?.duration ?? 0),
    bitRate: format?.bitrate ? Math.round(format.bitrate / 1000) : undefined,
    sampleRate: format?.sampleRate,
    bitDepth: format?.bitsPerSample,
    channels: format?.numberOfChannels,
    suffix: ext,
    hasEmbeddedLyrics: Boolean(
      common?.lyrics?.some((l) => l.text || l.syncText?.length),
    ),
    replayGain: {
      trackGain: rg(common?.replaygain_track_gain),
      albumGain: rg(common?.replaygain_album_gain),
      trackPeak: peak(common?.replaygain_track_peak),
      albumPeak: peak(common?.replaygain_album_peak),
    },
    addedAt,
  }
}

/**
 * Scans the folders, re-reading only files that are new or changed since the
 * last scan. Calls onProgress with the number of files handled so far.
 */
export async function scanFolders(
  folders: string[],
  previous: Map<string, LocalTrack>,
  onProgress: (done: number, total: number) => void,
): Promise<LocalTrack[]> {
  const files: { file: string; folder: string }[] = []
  for (const folder of folders) {
    for (const file of await listAudioFiles(folder))
      files.push({ file, folder })
  }
  const result: LocalTrack[] = new Array(files.length)
  let done = 0
  let next = 0
  const now = Date.now()

  async function worker() {
    while (next < files.length) {
      const i = next++
      const { file, folder } = files[i]
      try {
        const stat = await fs.stat(file)
        const old = previous.get(file)
        result[i] =
          old && old.mtime === stat.mtimeMs && old.size === stat.size
            ? { ...old, folder }
            : await readTrack(file, folder, stat, old?.addedAt ?? now)
      } catch {
        // Unreadable file: skip it.
      }
      done++
      if (done % 25 === 0 || done === files.length) {
        onProgress(done, files.length)
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  onProgress(files.length, files.length)
  return result.filter(Boolean)
}
