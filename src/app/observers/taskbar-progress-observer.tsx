import { useEffect } from 'react'
import {
  createProgressThrottle,
  TaskbarInput,
  taskbarProgress,
} from '@/service/taskbar-progress-rules'
import { useClearPlaySettings } from '@/store/clearplay-settings.store'
import { usePlayerStore } from '@/store/player.store'
import { isWindows } from '@/utils/desktop'

type PlayerState = ReturnType<typeof usePlayerStore.getState>

function inputOf(s: PlayerState): TaskbarInput & { songId: string | null } {
  const isSong = s.playerState.mediaType === 'song'
  const song = isSong
    ? s.songlist.currentList[s.songlist.currentSongIndex]
    : null
  const durationS = s.playerState.currentDuration || song?.duration || 0
  return {
    songId: song?.id ?? null,
    state: !song ? 'stopped' : s.playerState.isPlaying ? 'playing' : 'paused',
    positionMs: s.playerProgress.progress * 1000,
    durationMs: durationS * 1000,
    error: s.playerState.playbackError !== null,
  }
}

/**
 * Song progress on the taskbar button (Windows), from the player store, so
 * both audio engines behave the same. Its own IPC channel: the player-state
 * channel rebuilds the tray menu and writes to disk on every call.
 */
export function TaskbarProgressObserver() {
  const enabled = useClearPlaySettings((s) => s.taskbarProgress)

  useEffect(() => {
    if (!isWindows || !window.api?.setTaskbarProgress) return
    const send = window.api.setTaskbarProgress
    if (!enabled) {
      send(-1, 'none')
      return
    }
    const throttle = createProgressThrottle(
      (p) => send(p.progress, p.mode),
      () => Date.now(),
    )
    let prev = inputOf(usePlayerStore.getState())
    let prevAt = Date.now()
    throttle.update(taskbarProgress(prev), true)

    const unsub = usePlayerStore.subscribe((state) => {
      const next = inputOf(state)
      const at = Date.now()
      // A seek: the position jumped further than the time that passed.
      const expected =
        prev.state === 'playing'
          ? prev.positionMs + (at - prevAt)
          : prev.positionMs
      const seeked = Math.abs(next.positionMs - expected) > 1500
      const immediate =
        next.songId !== prev.songId ||
        next.state !== prev.state ||
        next.error !== prev.error ||
        seeked
      // The bar shows 0 at the start of each song before the first tick.
      if (next.songId !== prev.songId) throttle.reset()
      throttle.update(taskbarProgress(next), immediate)
      prev = next
      prevAt = at
    })
    return () => {
      unsub()
      send(-1, 'none')
    }
  }, [enabled])

  return null
}
