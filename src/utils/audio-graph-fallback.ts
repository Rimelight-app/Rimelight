/**
 * When a song can't load with `crossOrigin` set (the server sends no CORS
 * headers), the player falls back to plain <audio> playback without the Web
 * Audio graph, so EQ, mono, ReplayGain and the visualizer are off.
 *
 * The fallback used to be saved for good, so one failed song (for example a
 * dropped connection) turned the EQ and the visualizer off on that computer
 * until ReplayGain was reset by hand. It now lasts only for the current app
 * session (sessionStorage survives the reload the fallback needs).
 */
const KEY = 'clearplay.audioGraphFallback'

export function isAudioGraphFallbackActive(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setAudioGraphFallback(active: boolean) {
  try {
    if (active) sessionStorage.setItem(KEY, '1')
    else sessionStorage.removeItem(KEY)
  } catch {
    // storage unavailable: the in-memory flag still applies until restart
  }
}

/**
 * True if the server answers a cross-origin request for this URL, i.e. the
 * load error was not caused by missing CORS headers. Only the first bytes
 * are requested and the request is aborted as soon as headers arrive.
 */
export async function serverAllowsCors(url: string): Promise<boolean> {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return true
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    await fetch(url, {
      mode: 'cors',
      headers: { Range: 'bytes=0-1' },
      signal: controller.signal,
    })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}
