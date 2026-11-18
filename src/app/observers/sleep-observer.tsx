import { useEffect, useRef } from 'react'
import { useSleepTimer } from '@/store/audio-fx.store'
import { usePlayerStore } from '@/store/player.store'

/** Pauses playback when the sleep timer runs out (or after the current song). */
export function SleepObserver() {
  const until = useSleepTimer((s) => s.until)
  const songAtStart = useRef<string | null>(null)

  useEffect(() => {
    if (until === null) return
    songAtStart.current =
      usePlayerStore.getState().songlist.currentSong?.id ?? null
    const id = window.setInterval(() => {
      const state = usePlayerStore.getState()
      const songId = state.songlist.currentSong?.id ?? null
      const done =
        until === 'track' ? songId !== songAtStart.current : Date.now() >= until
      if (done) {
        state.actions.setPlayingState(false)
        useSleepTimer.getState().set(null)
      }
    }, 500)
    return () => window.clearInterval(id)
  }, [until])

  return null
}
