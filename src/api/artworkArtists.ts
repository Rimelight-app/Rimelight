import type { SingleAlbum } from '@/types/responses/album'
import type { ISong } from '@/types/responses/song'

/** At most this many artist names are tried per album. */
export const MAX_ARTWORK_ARTISTS = 3

/**
 * The live-cover service matches one artist name, so "Kanye West • Ye"
 * finds nothing where "Kanye West" does. Names in order, trimmed, without
 * empty ones or repeats (case-insensitive), at most MAX_ARTWORK_ARTISTS.
 */
function candidates(names: Array<string | null | undefined>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of names) {
    const name = typeof raw === 'string' ? raw.trim() : ''
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    out.push(name)
    if (out.length === MAX_ARTWORK_ARTISTS) break
  }
  return out
}

/**
 * Artist names to look an album's live cover up with, from the album page:
 * each album artist, then the album's artist string. For a one-artist album
 * the first name is the album's artist, as before.
 */
export function albumArtworkArtists(
  album: Pick<SingleAlbum, 'artist' | 'artists'> | null | undefined,
): string[] {
  if (!album) return []
  return candidates([
    ...(album.artists ?? []).map((a) => a?.name),
    album.artist,
  ])
}

/**
 * The same question from a song (the player bar): the album
 * artists of its album first, so every song of an album asks what its album
 * page asks. Then the song's own artist, for local songs and servers without
 * the OpenSubsonic fields.
 */
export function songArtworkArtists(
  song:
    | Pick<ISong, 'artist' | 'albumArtists' | 'displayAlbumArtist'>
    | null
    | undefined,
): string[] {
  if (!song) return []
  return candidates([
    ...(song.albumArtists ?? []).map((a) => a?.name),
    song.displayAlbumArtist,
    song.artist,
  ])
}
