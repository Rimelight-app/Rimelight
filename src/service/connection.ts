import { create } from 'zustand'
import { queryClient } from '@/lib/queryClient'
import { useAppStore } from '@/store/app.store'
import { defaultServerName, useServersStore } from '@/store/servers.store'
import { logger } from '@/utils/logger'
import { retryDelayMs } from './playback-errors-rules'
import { ping } from './ping'

/**
 * Whether the signed-in server answers. When it doesn't (at start, or when a
 * song can't load), a pill says so and ClearPlay asks again after 5 s, 15 s,
 * 30 s, then every 60 s, and right away when the system comes back online.
 * Once it answers, the pill goes and the current page loads again. No
 * offline mode: local songs and the queue simply keep working meanwhile.
 */

type ConnectionState = {
  /** Set while the server can't be reached. */
  unreachable: null | { since: number; reason: 'startup' | 'playback' }
}

export const useConnectionStore = create<ConnectionState>()(() => ({
  unreachable: null,
}))

/** The name the user knows the server by. */
export function serverName(): string {
  const { url, username } = useAppStore.getState().data
  const saved = useServersStore
    .getState()
    .servers.find((s) => s.url === url && s.username === username)
  return saved?.name || defaultServerName(url)
}

/** One ping; false when there is no answer (network, 5xx, bad body). */
export async function serverAnswers(timeoutMs = 5000): Promise<boolean> {
  if (navigator.onLine === false) return false
  let timer: number | undefined
  try {
    const info = await Promise.race([
      ping.pingInfo(),
      new Promise<undefined>((resolve) => {
        timer = window.setTimeout(() => resolve(undefined), timeoutMs)
      }),
    ])
    // A "failed" answer (wrong login, …) still means the server is there.
    return info !== undefined
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
  }
}

let timer: number | undefined
let attempt = 0
let checking = false

async function check() {
  if (checking) return
  checking = true
  try {
    if (await serverAnswers()) {
      logger.info('[connection] server answers again')
      stopWatching()
      useConnectionStore.setState({ unreachable: null })
      // The page that failed meanwhile loads again.
      await queryClient.refetchQueries({ type: 'active' })
      return
    }
  } finally {
    checking = false
  }
  schedule()
}

function schedule() {
  window.clearTimeout(timer)
  timer = window.setTimeout(check, retryDelayMs(attempt))
  attempt++
}

const onOnline = () => {
  if (useConnectionStore.getState().unreachable) check()
}

function stopWatching() {
  window.clearTimeout(timer)
  timer = undefined
  attempt = 0
  window.removeEventListener('online', onOnline)
}

/** The server didn't answer: show the pill and start asking again. */
export function markUnreachable(reason: 'startup' | 'playback') {
  const current = useConnectionStore.getState().unreachable
  if (current) {
    // Already watching; a playback failure keeps the startup wording.
    return
  }
  logger.info(`[connection] server unreachable (${reason})`)
  useConnectionStore.setState({ unreachable: { since: Date.now(), reason } })
  attempt = 0
  window.addEventListener('online', onOnline)
  schedule()
}
