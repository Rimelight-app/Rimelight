/**
 * "Start radio": which request finds the similar songs for a seed, and the
 * queue that comes out of it. Pure, no imports
 * (tools/dev-rig/radio-unit.mjs runs it in Node).
 */

export type RadioSeed =
  | { kind: 'song'; id: string; name: string }
  | { kind: 'album'; id: string; name: string }
  | { kind: 'artist'; id: string; name: string }

export type RadioRequest = {
  path: '/getSimilarSongs' | '/getSimilarSongs2'
  query: Record<string, string>
  /** Where the songs are in the answer. */
  key: 'similarSongs' | 'similarSongs2'
}

/** Songs asked for; the queue keeps refilling after them. */
export const RADIO_COUNT = 50

/** "Music on this computer" song ids (electron local-library hashId). */
const isLocalSongId = (id: string) => /^tr-[0-9a-f]{16}$/.test(id)

/**
 * The request for a seed, or null when Start radio isn't offered: songs
 * from "Music on this computer", or while Rimelight is connected to it (it
 * has no similar-songs data).
 * Navidrome 0.64.2 takes song, album and artist ids in getSimilarSongs; an
 * artist uses getSimilarSongs2 (the artist's songs and similar artists').
 */
export function radioRequest(
  seed: RadioSeed,
  usingLocalLibrary = false,
): RadioRequest | null {
  if (usingLocalLibrary || !seed.id) return null
  if (seed.kind === 'song' && isLocalSongId(seed.id)) return null
  const query = { id: seed.id, count: String(RADIO_COUNT) }
  if (seed.kind === 'artist')
    return { path: '/getSimilarSongs2', query, key: 'similarSongs2' }
  return { path: '/getSimilarSongs', query, key: 'similarSongs' }
}

/**
 * The radio's queue: the seed song first (song seeds only), then the
 * similar songs, each song once. Empty when nothing similar came back.
 */
export function radioQueue<T extends { id: string }>(
  seedSong: T | null,
  similar: T[],
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const s of [...(seedSong ? [seedSong] : []), ...similar]) {
    if (!s?.id || seen.has(s.id)) continue
    seen.add(s.id)
    out.push(s)
  }
  // Only the seed: nothing similar was found.
  if (seedSong && out.length === 1) return []
  return out
}
