import { httpClient } from '@/api/httpClient'
import { ISong } from '@/types/responses/song'
import { SubsonicResponse } from '@/types/responses/subsonicResponse'
import { StatsSong, statsFields } from '@/utils/libraryStats'
import { search } from './search'

export type NowPlayingEntry = ISong & {
  username: string
  minutesAgo: number
  playerId?: number
  playerName?: string
  /** playbackReport servers: starting, playing or paused. */
  state?: string
  /** playbackReport servers; the server already moves it on while playing. */
  positionMs?: number
}

type NowPlayingResponse = SubsonicResponse<{
  nowPlaying: { entry?: NowPlayingEntry[] }
}>

type ScanStatusResponse = SubsonicResponse<{
  scanStatus: {
    scanning: boolean
    count?: number
    folderCount?: number
    lastScan?: string
  }
}>

async function getNowPlaying() {
  const response = await httpClient<NowPlayingResponse>('/getNowPlaying', {
    method: 'GET',
  })
  return response?.data.nowPlaying.entry ?? []
}

async function getScanStatus() {
  const response = await httpClient<ScanStatusResponse>('/getScanStatus', {
    method: 'GET',
  })
  return response?.data.scanStatus
}

const PAGE = 500

/**
 * Fetches every song in the library through search3 paging (a few requests
 * run in parallel), keeping only the fields Stats uses. onProgress reports
 * how many songs have arrived. Stops when `signal` aborts (the page was left).
 * A page that fails makes the whole load fail: partial numbers would look
 * final.
 */
async function getAllSongs(
  onProgress?: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<StatsSong[]> {
  const all: StatsSong[] = []
  let offset = 0
  let done = false
  const parallel = 4

  while (!done) {
    signal?.throwIfAborted()
    const batch = await Promise.all(
      Array.from({ length: parallel }, (_, i) =>
        search.get({
          query: '',
          artistCount: 0,
          albumCount: 0,
          songCount: PAGE,
          songOffset: offset + i * PAGE,
          signal,
        }),
      ),
    )
    signal?.throwIfAborted()
    for (const result of batch) {
      if (!result) throw new Error('Stats: a page of songs could not be loaded')
      const songs = result.song ?? []
      for (const song of songs) all.push(statsFields(song))
      if (songs.length < PAGE) done = true
    }
    offset += parallel * PAGE
    onProgress?.(all.length)
    if (offset > 400_000) break
  }

  // Parallel pages can overlap only if the library changed mid-fetch.
  const seen = new Set<string>()
  return all.filter((s) => {
    if (seen.has(s.id)) return false
    seen.add(s.id)
    return true
  })
}

export const stats = {
  getNowPlaying,
  getScanStatus,
  getAllSongs,
}
