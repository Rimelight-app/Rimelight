/**
 * One player per live-cover stream, shared by every screen that shows it.
 *
 * Each stream URL gets one hidden, muted, looping <video> fed by one hls.js
 * instance. Screens don't play the stream themselves: they show this
 * player's picture through captureStream() as the srcObject of their own
 * <video>. So every screen showing an album (album page, player bar,
 * fullscreen player) shows
 * the same frame, and the stream is downloaded and decoded once.
 *
 * Screens acquire a player and release it; the last release destroys it
 * after RELEASE_DELAY_MS, so moving between pages doesn't restart the clip.
 */

export type CoverPlayerStatus = 'loading' | 'ready' | 'failed'

export interface CoverPlayer {
  readonly url: string
  /** The picture to show; null until the stream has its first frame. */
  readonly stream: MediaStream | null
  readonly status: CoverPlayerStatus
  /** Called when stream or status changes. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void
}

interface Entry extends CoverPlayer {
  stream: MediaStream | null
  status: CoverPlayerStatus
  source: HTMLVideoElement
  hls: { destroy: () => void } | null
  refs: number
  releaseTimer: ReturnType<typeof setTimeout> | null
  listeners: Set<() => void>
  destroyed: boolean
}

export const RELEASE_DELAY_MS = 2000

/** HTMLMediaElement.captureStream() (Chromium, Firefox); not in TS's DOM lib. */
type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream }

const players = new Map<string, Entry>()
let host: HTMLDivElement | null = null

/**
 * Whether this browser can share one player between screens. Electron
 * (Chromium) can; a browser without captureStream() plays one copy per
 * screen, as before.
 */
export function canShareCoverPlayers(): boolean {
  return (
    typeof HTMLVideoElement !== 'undefined' &&
    typeof (HTMLVideoElement.prototype as CapturableVideo).captureStream ===
      'function'
  )
}

/**
 * The hidden players live in the page (a 1 px, transparent, fixed box), so
 * Chromium keeps decoding and painting them like any visible video.
 */
function sourceHost(): HTMLDivElement {
  if (host?.isConnected) return host
  host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.dataset.liveCoverPlayers = ''
  Object.assign(host.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '-1',
  })
  document.body.append(host)
  return host
}

function notify(entry: Entry) {
  for (const listener of [...entry.listeners]) listener()
}

/**
 * A stream that can't play: stop loading it at once (screens show their
 * static cover). The entry stays until its screens let go, so they all see
 * the failure instead of starting it again.
 */
function fail(entry: Entry) {
  if (entry.destroyed || entry.status === 'failed') return
  entry.status = 'failed'
  stopLoading(entry)
  notify(entry)
}

function stopLoading(entry: Entry) {
  entry.hls?.destroy()
  entry.hls = null
  for (const track of entry.stream?.getTracks() ?? []) track.stop()
  entry.stream = null
  const video = entry.source
  video.pause()
  video.removeAttribute('src')
  video.load()
}

function start(entry: Entry) {
  const video = entry.source
  video.muted = true
  video.defaultMuted = true
  video.loop = true
  video.playsInline = true
  video.preload = 'auto'
  video.width = 1
  video.height = 1
  video.addEventListener('error', () => fail(entry))
  video.addEventListener('loadeddata', () => {
    if (entry.destroyed || entry.stream) return
    try {
      const stream = (video as CapturableVideo).captureStream?.()
      if (!stream) throw new Error('captureStream unavailable')
      entry.stream = stream
      entry.status = 'ready'
    } catch {
      entry.status = 'failed'
    }
    notify(entry)
  })
  sourceHost().append(video)

  import('hls.js')
    .then(({ default: Hls }) => {
      if (entry.destroyed) return
      if (!Hls.isSupported()) {
        fail(entry)
        return
      }

      const hls = new Hls()
      entry.hls = hls

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad()
          return
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError()
          return
        }
        fail(entry)
      })
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => fail(entry))
      })
      hls.loadSource(entry.url)
      hls.attachMedia(video)
    })
    .catch(() => fail(entry))
}

function destroy(entry: Entry) {
  entry.destroyed = true
  players.delete(entry.url)
  stopLoading(entry)
  entry.source.remove()
  entry.listeners.clear()
}

/** The shared player of `url`; call releaseCoverPlayer when done with it. */
export function acquireCoverPlayer(url: string): CoverPlayer {
  let entry = players.get(url)
  if (!entry) {
    const created: Entry = {
      url,
      stream: null,
      status: 'loading',
      source: document.createElement('video'),
      hls: null,
      refs: 0,
      releaseTimer: null,
      listeners: new Set(),
      destroyed: false,
      subscribe(listener) {
        created.listeners.add(listener)
        return () => {
          created.listeners.delete(listener)
        }
      },
    }
    entry = created
    players.set(url, entry)
    start(entry)
  }
  if (entry.releaseTimer) {
    clearTimeout(entry.releaseTimer)
    entry.releaseTimer = null
  }
  entry.refs++
  return entry
}

export function releaseCoverPlayer(player: CoverPlayer) {
  const entry = players.get(player.url)
  if (!entry || entry !== player) return
  entry.refs = Math.max(0, entry.refs - 1)
  if (entry.refs > 0 || entry.releaseTimer) return
  entry.releaseTimer = setTimeout(() => {
    entry.releaseTimer = null
    if (entry.refs === 0) destroy(entry)
  }, RELEASE_DELAY_MS)
}

/**
 * The browser may pause the hidden players while the window is minimized
 * or hidden. Start them again when it shows.
 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    for (const entry of players.values()) {
      if (entry.status !== 'failed' && entry.source.paused) {
        entry.source.play().catch(() => {})
      }
    }
  })
}
