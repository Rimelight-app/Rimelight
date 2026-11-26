import type { ISong } from '@/types/responses/song'

/** The song fields computeStats reads; Stats keeps only these per song. */
export type StatsSong = Pick<
  ISong,
  | 'id'
  | 'title'
  | 'artist'
  | 'artistId'
  | 'album'
  | 'albumId'
  | 'coverArt'
  | 'duration'
  | 'size'
  | 'suffix'
  | 'genre'
  | 'year'
  | 'playCount'
  | 'played'
>

/**
 * Drops everything else from a song (Navidrome sends about 40 fields, with
 * arrays), so a whole library in memory stays small. The numbers Stats
 * shows don't change.
 */
export function statsFields(s: ISong): StatsSong {
  return {
    id: s.id,
    title: s.title,
    artist: s.artist,
    artistId: s.artistId,
    album: s.album,
    albumId: s.albumId,
    coverArt: s.coverArt,
    duration: s.duration,
    size: s.size,
    suffix: s.suffix,
    genre: s.genre,
    year: s.year,
    playCount: s.playCount,
    played: s.played,
  }
}

export interface Ranked {
  key: string
  label: string
  sublabel?: string
  coverArt?: string
  id?: string
  plays: number
  seconds: number
}

export interface LibraryStats {
  songs: number
  albums: number
  artists: number
  librarySeconds: number
  libraryBytes: number
  plays: number
  listenSeconds: number
  songsPlayed: number
  losslessShare: number
  formats: { label: string; count: number }[]
  topSongs: Ranked[]
  topArtists: Ranked[]
  topAlbums: Ranked[]
  topGenres: Ranked[]
  decades: Ranked[]
  recent: (StatsSong & { playedAt: number })[]
}

const LOSSLESS = new Set([
  'flac',
  'alac',
  'wav',
  'aiff',
  'aif',
  'ape',
  'wv',
  'dsf',
  'dff',
])

function bump(
  map: Map<string, Ranked>,
  key: string,
  init: Omit<Ranked, 'plays' | 'seconds'>,
  plays: number,
  seconds: number,
) {
  const entry = map.get(key) ?? { ...init, plays: 0, seconds: 0 }
  entry.plays += plays
  entry.seconds += seconds
  map.set(key, entry)
}

const top = (
  map: Map<string, Ranked>,
  n: number,
  by: 'plays' | 'seconds' = 'seconds',
) =>
  [...map.values()]
    .filter((r) => r.plays > 0)
    .sort((a, b) => b[by] - a[by])
    .slice(0, n)

/** Aggregates per-song play counts into listening statistics. */
export function computeStats(songs: StatsSong[]): LibraryStats {
  const albums = new Set<string>()
  const artists = new Set<string>()
  const formats = new Map<string, number>()
  const artistMap = new Map<string, Ranked>()
  const albumMap = new Map<string, Ranked>()
  const genreMap = new Map<string, Ranked>()
  const decadeMap = new Map<string, Ranked>()

  let librarySeconds = 0
  let libraryBytes = 0
  let plays = 0
  let listenSeconds = 0
  let songsPlayed = 0
  let lossless = 0

  for (const s of songs) {
    const count = s.playCount ?? 0
    const secs = (s.duration ?? 0) * count
    librarySeconds += s.duration ?? 0
    libraryBytes += s.size ?? 0
    if (s.albumId) albums.add(s.albumId)
    if (s.artistId) artists.add(s.artistId)
    const fmt = (s.suffix ?? '?').toUpperCase()
    formats.set(fmt, (formats.get(fmt) ?? 0) + 1)
    if (LOSSLESS.has((s.suffix ?? '').toLowerCase())) lossless++
    if (count === 0) continue

    plays += count
    listenSeconds += secs
    songsPlayed++
    bump(
      artistMap,
      s.artistId ?? s.artist,
      { key: s.artistId ?? s.artist, label: s.artist, id: s.artistId },
      count,
      secs,
    )
    bump(
      albumMap,
      s.albumId,
      {
        key: s.albumId,
        label: s.album,
        sublabel: s.artist,
        coverArt: s.coverArt,
        id: s.albumId,
      },
      count,
      secs,
    )
    if (s.genre)
      bump(genreMap, s.genre, { key: s.genre, label: s.genre }, count, secs)
    if (s.year) {
      const decade = `${Math.floor(s.year / 10) * 10}s`
      bump(decadeMap, decade, { key: decade, label: decade }, count, secs)
    }
  }

  const topSongs: Ranked[] = songs
    .filter((s) => (s.playCount ?? 0) > 0)
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
    .slice(0, 10)
    .map((s) => ({
      key: s.id,
      id: s.id,
      label: s.title,
      sublabel: s.artist,
      coverArt: s.coverArt,
      plays: s.playCount ?? 0,
      seconds: (s.playCount ?? 0) * (s.duration ?? 0),
    }))

  const recent = songs
    .filter((s) => s.played)
    .map((s) => ({ ...s, playedAt: Date.parse(s.played as string) }))
    .filter((s) => !Number.isNaN(s.playedAt))
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, 8)

  return {
    songs: songs.length,
    albums: albums.size,
    artists: artists.size,
    librarySeconds,
    libraryBytes,
    plays,
    listenSeconds,
    songsPlayed,
    losslessShare: songs.length ? lossless / songs.length : 0,
    formats: [...formats.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    topSongs,
    topArtists: top(artistMap, 8),
    topAlbums: top(albumMap, 6, 'plays'),
    topGenres: top(genreMap, 8),
    decades: [...decadeMap.values()].sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
    recent,
  }
}

/** 12 345 style grouping (space as thousands separator). */
export const fmtInt = (n: number) =>
  Math.round(n).toLocaleString('en-US').replace(/,/g, ' ')

/** "1.8 h", "312 h", or "26 min" for less than an hour. */
export function fmtHours(seconds: number) {
  const h = seconds / 3600
  if (h >= 100) return `${fmtInt(h)} h`
  if (h >= 1) return `${h.toFixed(1)} h`
  return `${Math.round(seconds / 60)} min`
}

export function fmtBytes(bytes: number) {
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
}
