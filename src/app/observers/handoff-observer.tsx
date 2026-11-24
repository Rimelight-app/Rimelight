import { useEffect } from 'react'
import {
  checkLeftBehind,
  look,
  lookOnFocus,
  saveNow,
  stopLooking,
} from '@/service/handoff'
import { setBeforeFinishPlayback } from '@/service/playback-reporter'
import { useAppStore } from '@/store/app.store'
import { usePlayerStore } from '@/store/player.store'
import { isDesktop } from '@/utils/desktop'

const LEFT_BEHIND_EVERY_MS = 60_000

/**
 * "Continue on other devices":
 * - Looks at the server's saved queue (always, even with saving off): on
 *   start, when the window gets focus (at most once per 30 s) and when the
 *   server answers again. Shows the Continue pill when the rules say so.
 * - While playing here with saving on, checks every minute (and on each song
 *   change, from QueueObserver) whether the phone continued this queue.
 * - Saves right away on quit (inside the quit handshake), sleep and lock.
 */
export function HandoffObserver() {
  const url = useAppStore((s) => s.data.url)
  const username = useAppStore((s) => s.data.username)

  // biome-ignore lint/correctness/useExhaustiveDependencies: look again for another server or user
  useEffect(() => {
    look()
    const onFocus = () => lookOnFocus()
    const onVisible = () => {
      if (document.visibilityState === 'visible') lookOnFocus()
    }
    const onOnline = () => look()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      stopLooking()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [url, username])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (usePlayerStore.getState().playerState.isPlaying)
        checkLeftBehind().catch(() => {})
    }, LEFT_BEHIND_EVERY_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    // Quitting: save first, then report "stopped" (same 1.5 s budget).
    setBeforeFinishPlayback(() => saveNow('quit'))
    if (!isDesktop()) return
    window.api?.onSaveQueueNow?.((reason) =>
      saveNow(reason === 'lock' ? 'lock' : 'sleep'),
    )
  }, [])

  return null
}
