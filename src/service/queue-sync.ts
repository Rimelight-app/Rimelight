import { httpClient } from '@/api/httpClient'
import { usePlayerStore } from '@/store/player.store'
import { ISong } from '@/types/responses/song'
import { SubsonicResponse } from '@/types/responses/subsonicResponse'

type PlayQueueResponse = SubsonicResponse<{
  playQueue?: {
    entry?: ISong[]
    current?: string
    position?: number
    changed?: string
    changedBy?: string
  }
}>

type SongListResponse = SubsonicResponse<{
  similarSongs2?: { song?: ISong[] }
  similarSongs?: { song?: ISong[] }
  randomSongs?: { song?: ISong[] }
}>

/** POST with a form body so long queues don't hit URL length limits. */
async function post<T>(path: string, params: [string, string][]) {
  const body = new URLSearchParams(params)
  return httpClient<T>(path, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

/** Saves the current queue, track and position to the server (savePlayQueue). */
async function saveToServer() {
  const { songlist, playerState } = usePlayerStore.getState()
  const list = songlist.currentList.slice(0, 1000)
  if (!list.length) return false
  const current = songlist.currentSong?.id
  const position = Math.round(
    (playerState.audioPlayerRef?.currentTime ?? 0) * 1000,
  )
  const params: [string, string][] = list.map((s) => ['id', s.id])
  if (current) params.push(['current', current], ['position', String(position)])
  const res = await post<SubsonicResponse>('/savePlayQueue', params)
  return res?.data?.status === 'ok'
}

/** Loads the queue saved on the server (by any client, e.g. Symfonium). */
async function getFromServer() {
  const res = await httpClient<PlayQueueResponse>('/getPlayQueue', {
    method: 'GET',
  })
  return res?.data?.playQueue ?? null
}

/** Replaces the local queue with the server's and resumes at its position. */
async function restoreFromServer() {
  const queue = await getFromServer()
  const entries = queue?.entry ?? []
  if (!entries.length) return false
  const index = Math.max(
    0,
    entries.findIndex((s) => s.id === queue?.current),
  )
  const { actions } = usePlayerStore.getState()
  actions.setSongList(entries, index, false)
  const seconds = (queue?.position ?? 0) / 1000
  if (seconds > 1) {
    // Seek once the new track is loaded.
    const start = Date.now()
    const timer = window.setInterval(() => {
      const audio = usePlayerStore.getState().playerState.audioPlayerRef
      if (audio && audio.readyState >= 1) {
        audio.currentTime = seconds
        window.clearInterval(timer)
      } else if (Date.now() - start > 8000) window.clearInterval(timer)
    }, 150)
  }
  return true
}

/** Creates a server playlist from the current queue. */
async function saveAsPlaylist(name: string) {
  const list = usePlayerStore.getState().songlist.currentList.slice(0, 2000)
  if (!list.length) return false
  const res = await post<SubsonicResponse>('/createPlaylist', [
    ['name', name],
    ...list.map((s) => ['songId', s.id] as [string, string]),
  ])
  return res?.data?.status === 'ok'
}

/**
 * Songs to keep the music going after the queue ends: similar songs from the
 * server (needs Last.fm in Navidrome), falling back to random songs of the
 * same genre, then any random songs.
 */
async function similarTo(song: ISong, exclude: Set<string>) {
  const tries: [
    string,
    Record<string, string>,
    keyof NonNullable<SongListResponse>,
  ][] = []
  if (song.artistId)
    tries.push([
      '/getSimilarSongs2',
      { id: song.artistId, count: '40' },
      'similarSongs2',
    ])
  tries.push(['/getSimilarSongs', { id: song.id, count: '40' }, 'similarSongs'])
  if (song.genre)
    tries.push([
      '/getRandomSongs',
      { size: '30', genre: song.genre },
      'randomSongs',
    ])
  tries.push(['/getRandomSongs', { size: '30' }, 'randomSongs'])

  for (const [path, query, key] of tries) {
    const res = await httpClient<SongListResponse>(path, {
      method: 'GET',
      query,
    })
    const box = res?.data?.[key] as { song?: ISong[] } | undefined
    const songs = (box?.song ?? []).filter((s) => !exclude.has(s.id))
    if (songs.length >= 5) return songs.slice(0, 25)
  }
  return []
}

export const queueSync = {
  saveToServer,
  getFromServer,
  restoreFromServer,
  saveAsPlaylist,
  similarTo,
}
