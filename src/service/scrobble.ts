import { httpClient } from '@/api/httpClient'
import { useScrobbleStore } from '@/store/scrobble.store'
import { SubsonicResponse } from '@/types/responses/subsonicResponse'
import dateTime from '@/utils/dateTime'
import { logger } from '@/utils/logger'
import { getServerExtensions } from '@/utils/servers'

type SongRef = { id: string; title?: string; artist?: string }

async function post(id: string, submission: boolean, time: number) {
  const response = await httpClient<SubsonicResponse>('/scrobble', {
    method: 'GET',
    query: {
      id,
      submission: submission ? 'true' : 'false',
      time: time.toString(),
    },
  })
  return response?.data?.status === 'ok'
}

/**
 * Reports playback to the server, which forwards it to Last.fm/ListenBrainz
 * when those are linked in Navidrome. Listens that fail (offline, server
 * restarting, VPN hiccup) are kept and retried with their original time, so
 * they still land in the right place in your history.
 */
async function send(song: SongRef | string, submission = true) {
  const ref = typeof song === 'string' ? { id: song } : song
  const store = useScrobbleStore.getState()
  if (!store.enabled) return
  // Servers with reportPlayback get "now playing" from playback-reporter.ts,
  // which can also say paused and stopped. Listens are still sent here.
  if (!submission && getServerExtensions().playbackReportEnabled) return

  const time = dateTime().valueOf()
  logger.info(`${submission ? 'Scrobbling' : 'Now playing'}`, { id: ref.id })

  let ok = false
  try {
    ok = await post(ref.id, submission, time)
  } catch {
    ok = false
  }

  const base = {
    id: ref.id,
    title: ref.title ?? '',
    artist: ref.artist ?? '',
    at: time,
  }

  if (!submission) {
    store.addLog({
      ...base,
      kind: 'nowPlaying',
      status: ok ? 'sent' : 'failed',
    })
    return
  }

  if (ok) {
    store.addLog({ ...base, kind: 'listen', status: 'sent' })
    flush()
    return
  }

  store.addLog({ ...base, kind: 'listen', status: 'queued' })
  store.setPending([
    ...store.pending,
    { id: ref.id, title: base.title, artist: base.artist, time, attempts: 1 },
  ])
}

let flushing = false

/** Re-sends queued listens, oldest first. */
async function flush() {
  if (flushing) return
  flushing = true
  try {
    const { pending, setPending, addLog } = useScrobbleStore.getState()
    const remaining = []
    for (const item of pending) {
      let ok = false
      try {
        ok = await post(item.id, true, item.time)
      } catch {
        ok = false
      }
      if (ok) {
        addLog({
          id: item.id,
          title: item.title,
          artist: item.artist,
          kind: 'listen',
          status: 'sent',
          at: item.time,
        })
      } else if (item.attempts < 50) {
        remaining.push({ ...item, attempts: item.attempts + 1 })
      }
    }
    setPending(remaining)
  } finally {
    flushing = false
  }
}

let started = false

/** Retries queued listens every minute and when the network comes back. */
function startRetryLoop() {
  if (started) return
  started = true
  window.setInterval(() => {
    if (useScrobbleStore.getState().pending.length) flush()
  }, 60_000)
  window.addEventListener('online', () => flush())
  window.setTimeout(() => flush(), 5_000)
}

export const scrobble = {
  send,
  flush,
  startRetryLoop,
}
