import { httpClient } from '@/api/httpClient'
import { ISong } from '@/types/responses/song'
import { SubsonicResponse } from '@/types/responses/subsonicResponse'
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
 * run in parallel). onProgress reports how many songs have arrived.
 */
async function getAllSongs(onProgress?: (loaded: number) => void) {
  const all: ISong[] = []
  let offset = 0
  let done = false
  const parallel = 4

  while (!done) {
    const batch = await Promise.all(
      Array.from({ length: parallel }, (_, i) =>
        search.get({
          query: '',
          artistCount: 0,
          albumCount: 0,
          songCount: PAGE,
          songOffset: offset + i * PAGE,
        }),
      ),
    )
    for (const result of batch) {
      const songs = result?.song ?? []
      all.push(...songs)
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
