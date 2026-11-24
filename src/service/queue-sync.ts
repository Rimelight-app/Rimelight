import { httpClient } from '@/api/httpClient'
import { useAppStore } from '@/store/app.store'
import { isMpvSession } from '@/store/bitperfect.store'
import { usePlayerStore } from '@/store/player.store'
import { ISong } from '@/types/responses/song'
import { SubsonicResponse } from '@/types/responses/subsonicResponse'
import { getServerExtensions } from '@/utils/servers'
import { isUsingLocalLibrary } from './local-library'
import { liveMpvElement } from './mpv-player'
import {
  DESKTOP_APP,
  NowPlaying,
  QueueSong,
  SavedQueue,
  saveWindow,
  startPoint,
} from './queue-handoff'
import { stats } from './stats'

type PlayQueue = {
  entry?: ISong[]
  current?: string
  currentIndex?: number
  position?: number
  changed?: string
  changedBy?: string
}

type PlayQueueResponse = SubsonicResponse<{
  playQueue?: PlayQueue
  playQueueByIndex?: PlayQueue
}>

type SongListResponse = SubsonicResponse<{
  similarSongs2?: { song?: ISong[] }
  similarSongs?: { song?: ISong[] }
  randomSongs?: { song?: ISong[] }
}>

/** POST with a form body so long queues don't hit URL length limits. */
async function post<T>(
  path: string,
  params: [string, string][],
  init: RequestInit = {},
) {
  const body = new URLSearchParams(params)
  return httpClient<T>(path, {
    ...init,
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

/**
 * Songs from "Music on this computer" (the built-in local library server,
 * ids from electron/main/core/local-library/scanner.ts hashId). Navidrome's
 * ids never look like this.
 */
export function isLocalSongId(id: string) {
  return /^tr-[0-9a-f]{16}$/.test(id)
}

/** The song element of the engine in use (not radio or podcast). */
function songElement(): {
  src: string
  currentTime: number
  readyState: number
} | null {
  if (isMpvSession()) return liveMpvElement()
  return (
    document.querySelector<HTMLAudioElement>(
      'audio[data-testid="player-song-audio"]',
    ) ?? usePlayerStore.getState().playerState.audioPlayerRef
  )
}

/** The `id` the element streams, or null. */
function streamedId(src: string | undefined) {
  if (!src) return null
  try {
    return new URL(src).searchParams.get('id')
  } catch {
    return null
  }
}

/** Where the current song is, in ms. */
function currentPositionMs() {
  const { songlist, playerProgress } = usePlayerStore.getState()
  const song = songlist.currentList[songlist.currentSongIndex]
  const el = songElement()
  const live =
    el && song && streamedId(el.src) === song.id ? el.currentTime : Number.NaN
  const seconds = Number.isFinite(live) ? live : playerProgress.progress
  return Math.max(0, Math.round((seconds || 0) * 1000))
}

/**
 * The local queue as the handoff rules see it. "Only on this device" is
 * relative to the server in use: when that is "Music on this computer"
 * itself, its songs are on it, and the queue panel's Save stores them there.
 */
export function localQueue() {
  const { songlist, playerState } = usePlayerStore.getState()
  const isSong = playerState.mediaType === 'song'
  const onLocalServer = isUsingLocalLibrary()
  const songs: QueueSong[] = isSong
    ? songlist.currentList.map((s) => ({
        id: s.id,
        local: !onLocalServer && isLocalSongId(s.id),
      }))
    : []
  return { songs, currentIndex: songlist.currentSongIndex }
}

/**
 * Saves the queue around the current song (at most 1 000 songs, local songs
 * left out) with the current position. Uses savePlayQueueByIndex when the
 * server has indexBasedQueue, so a song that is in the queue twice keeps its
 * place. Returns false when there was nothing to save or the server said no.
 */
async function saveToServer(options: { keepalive?: boolean } = {}) {
  const { songs, currentIndex } = localQueue()
  const window = saveWindow(songs, currentIndex)
  if (!window) return false
  const position = String(currentPositionMs())
  const params: [string, string][] = window.ids.map((id) => ['id', id])
  const init: RequestInit = {
    keepalive: options.keepalive,
    signal: AbortSignal.timeout(8000),
  }
  const res = getServerExtensions().indexBasedQueueEnabled
    ? await post<SubsonicResponse>(
        '/savePlayQueueByIndex',
        [
          ...params,
          ['currentIndex', String(window.currentIndex)],
          ['position', position],
        ],
        init,
      )
    : await post<SubsonicResponse>(
        '/savePlayQueue',
        [
          ...params,
          ['current', window.ids[window.currentIndex]],
          ['position', position],
        ],
        init,
      )
  return res?.data?.status === 'ok'
}

/**
 * The queue saved on the server (by any client, e.g. Symfonium), with the
 * current song as an index. Null when the server couldn't be reached; an
 * empty queue has no entries.
 */
async function getFromServer(): Promise<SavedQueue<ISong> | null> {
  const byIndex = getServerExtensions().indexBasedQueueEnabled
  const res = await httpClient<PlayQueueResponse>(
    byIndex ? '/getPlayQueueByIndex' : '/getPlayQueue',
    { method: 'GET', signal: AbortSignal.timeout(8000) },
  )
  if (res?.data?.status !== 'ok') return null
  const q = (byIndex ? res.data.playQueueByIndex : res.data.playQueue) ?? {}
  const entries = q.entry ?? []
  const currentIndex = byIndex
    ? (q.currentIndex ?? 0)
    : Math.max(
        0,
        entries.findIndex((s) => s.id === q.current),
      )
  return {
    entries,
    currentIndex,
    positionMs: q.position ?? 0,
    changed: q.changed ?? '',
    changedBy: q.changedBy ?? '',
  }
}

/** getNowPlaying in the shape the handoff rules use (null if unreachable). */
async function getNowPlaying(): Promise<NowPlaying[] | null> {
  try {
    const list = await stats.getNowPlaying()
    return list.map((e) => ({
      username: e.username,
      playerName: e.playerName ?? '',
      state: e.state ?? '',
      positionMs: e.positionMs ?? 0,
      id: e.id,
    }))
  } catch {
    return null
  }
}

const SEEK_POLL_MS = 150
/** mpv may first open the device (Windows probes it with silence). */
const SEEK_GIVE_UP_MS = 20_000

/**
 * Replaces the queue, starts playing at `index` and `positionMs`. Works with
 * both engines: each starts a new source at the stored progress (the
 * built-in one in loadedmetadata, mpv in load), and once the new song is
 * really loaded the position is checked and set again, because the built-in
 * engine resets the progress to 0 while it swaps sources. Resolves true once
 * the song is loaded at the right spot, false if it never loaded.
 */
async function startQueueAt(
  entries: ISong[],
  index: number,
  positionMs: number,
) {
  const song = entries[index]
  if (!song) return false
  const seconds = Math.max(0, positionMs / 1000)
  const { actions } = usePlayerStore.getState()
  actions.setSongList(entries, index, false)
  actions.setProgress(seconds)

  const started = Date.now()
  return new Promise<boolean>((resolve) => {
    const tick = () => {
      const el = songElement()
      const loaded = el && streamedId(el.src) === song.id && el.readyState >= 1
      if (loaded) {
        if (Math.abs(el.currentTime - seconds) > 1.5) el.currentTime = seconds
        resolve(true)
        return
      }
      if (Date.now() - started > SEEK_GIVE_UP_MS) {
        resolve(false)
        return
      }
      window.setTimeout(tick, SEEK_POLL_MS)
    }
    tick()
  })
}

/**
 * Load button: replaces the local queue with the server's and starts where
 * ClearPlay on the phone is (playing or paused, from Now Playing), else at
 * the saved song and position.
 */
async function restoreFromServer() {
  const queue = await getFromServer()
  if (!queue?.entries.length) return false
  const { username } = useAppStore.getState().data
  const nowPlaying = (await getNowPlaying()) ?? []
  const start = startPoint(queue, DESKTOP_APP, username, nowPlaying)
  await startQueueAt(queue.entries, start.index, start.positionMs)
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
  getNowPlaying,
  startQueueAt,
  restoreFromServer,
  saveAsPlaylist,
  similarTo,
}
