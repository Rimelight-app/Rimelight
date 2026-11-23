import { httpClient } from '@/api/httpClient'
import { useAppStore } from '@/store/app.store'
import { useAudioFx } from '@/store/audio-fx.store'
import { isMpvSession } from '@/store/bitperfect.store'
import { usePlayerStore } from '@/store/player.store'
import { useScrobbleStore } from '@/store/scrobble.store'
import { SubsonicResponse } from '@/types/responses/subsonicResponse'
import { isDesktop } from '@/utils/desktop'
import { logger } from '@/utils/logger'
import { getServerExtensions } from '@/utils/servers'
import {
  createPlaybackReportLogic,
  PlaybackReport,
  PlayerSnapshot,
} from './playback-report'

/**
 * Tells the server what the player is doing with reportPlayback, so its Now
 * Playing shows playing, paused or nothing. Fed from the player store, which
 * every pause and play goes through (player bar, space bar, media keys,
 * Windows media controls, MPRIS, the engine itself), with either engine.
 *
 * On only when the server lists the playbackReport extension and "Scrobble
 * plays" is on. Otherwise the old scrobble?submission=false "now playing"
 * call is used, as before.
 */

let started = false
let sink: (r: PlaybackReport) => void = enqueue
const logic = createPlaybackReportLogic((r) => sink(r))
let chain: Promise<unknown> = Promise.resolve()
let serverKey = ''
let timer: number | undefined

const currentServerKey = () => {
  const { url, username } = useAppStore.getState().data
  return `${username}@${url}`
}

const reportingOn = () =>
  useScrobbleStore.getState().enabled &&
  getServerExtensions().playbackReportEnabled

function snapshot(): PlayerSnapshot {
  const { songlist, playerState, playerProgress, listenTime } =
    usePlayerStore.getState()
  const song =
    playerState.mediaType === 'song'
      ? songlist.currentList[songlist.currentSongIndex]
      : undefined
  return {
    songId: song?.id || null,
    isPlaying: playerState.isPlaying,
    position: playerProgress.progress,
    listened: listenTime.accumulated,
    // Playback speed only applies to songs on the built-in engine.
    playbackRate: isMpvSession() ? 1 : useAudioFx.getState().speed || 1,
  }
}

async function post(r: PlaybackReport, keepalive = false) {
  // Live state only: nothing is kept for later when offline.
  if (navigator.onLine === false) return false
  try {
    const response = await httpClient<SubsonicResponse>('/reportPlayback', {
      method: 'GET',
      keepalive,
      signal: AbortSignal.timeout(8000),
      query: {
        mediaId: r.mediaId,
        mediaType: 'song',
        positionMs: r.positionMs,
        state: r.state,
        playbackRate: r.playbackRate,
        ignoreScrobble: 'true',
      },
    })
    return response?.data?.status === 'ok'
  } catch {
    return false
  }
}

/** Sends reports one after another, in order. Failures are dropped. */
function enqueue(r: PlaybackReport) {
  logger.info(`[reportPlayback] ${r.state}`, {
    id: r.mediaId,
    positionMs: r.positionMs,
  })
  chain = chain.then(async () => {
    const ok = await post(r)
    if (r.state === 'starting') logNowPlaying(r.mediaId, ok)
  })
}

/** Keeps the "now playing" line in Settings → Scrobbling's activity log. */
function logNowPlaying(id: string, ok: boolean) {
  const song = usePlayerStore
    .getState()
    .songlist.currentList.find((s) => s.id === id)
  useScrobbleStore.getState().addLog({
    id,
    title: song?.title ?? '',
    artist: song?.artist ?? '',
    kind: 'nowPlaying',
    status: ok ? 'sent' : 'failed',
    at: Date.now(),
  })
}

function reconcile() {
  timer = undefined
  const key = currentServerKey()
  if (key !== serverKey) {
    // Another server (or signed out): the old one lets the session expire.
    logic.drop()
    serverKey = key
  }
  if (!reportingOn()) {
    if (logic.active) logic.stop()
    return
  }
  logic.update(snapshot())
}

/**
 * Runs after the current task: when a song ends, the built-in engine sends
 * "pause" and then "ended" in one go, and that is not a pause.
 */
function schedule() {
  if (timer !== undefined) return
  timer = window.setTimeout(reconcile, 0)
}

function flushPending() {
  if (timer === undefined) return
  window.clearTimeout(timer)
  reconcile()
}

/** Sends "stopped" for the playing song now (app quitting). */
export async function finishPlaybackReport() {
  flushPending()
  if (!logic.active) return
  let last = null as PlaybackReport | null
  sink = (r) => {
    last = r
  }
  logic.stop()
  sink = enqueue
  if (!last) return
  const stopped: PlaybackReport = last
  logger.info('[reportPlayback] stopped (closing)', { id: stopped.mediaId })
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  // Reports still on their way go first, so "stopped" is the last word.
  await Promise.race([chain, wait(500)])
  await Promise.race([post(stopped, true), wait(900)])
}

export function startPlaybackReporter() {
  if (started) return
  started = true
  serverKey = currentServerKey()
  usePlayerStore.subscribe(schedule)
  useScrobbleStore.subscribe(schedule)
  useAppStore.subscribe(schedule)
  useAudioFx.subscribe(schedule)
  schedule()

  if (isDesktop()) window.api?.onFinishPlayback?.(finishPlaybackReport)
  // Reload (e.g. after switching server, which is handled above) or a
  // browser tab closing.
  window.addEventListener('pagehide', () => {
    finishPlaybackReport()
  })
}
