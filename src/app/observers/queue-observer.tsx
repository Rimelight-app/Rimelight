import { useEffect } from 'react'
import {
  checkLeftBehind,
  closeLeftBehind,
  played as handoffPlayed,
  publishEvent,
  takePauseHere,
} from '@/service/handoff'
import {
  isLibraryShuffle,
  topUpLibraryShuffle,
} from '@/service/library-shuffle'
import { isNaturalEnd, isQueueCleared } from '@/service/queue-handoff'
import { queueSync } from '@/service/queue-sync'
import { usePlayerStore } from '@/store/player.store'
import { useRimelightSettings } from '@/store/rimelight-settings.store'
import { logger } from '@/utils/logger'

/**
 * - Continue on other devices: saves the queue to the server 4 s after the
 *   song changes or the queue is edited, and 0.5 s after a pause (see
 *   service/handoff.ts). Clearing the queue doesn't save.
 * - AutoDJ: when the last song in the queue starts, appends similar songs.
 * - Library shuffle: when its last song starts, appends more random songs.
 */
export function QueueObserver() {
  useEffect(() => {
    let autoDjFor: string | null = null
    /** AutoDJ / shuffle top-ups on their way: their additions aren't the user's. */
    let autoEdits = 0

    const unsub = usePlayerStore.subscribe((state, prev) => {
      const { autoDj } = useRimelightSettings.getState()
      const song = state.songlist.currentSong
      const list = state.songlist.currentList
      const prevList = prev.songlist.currentList
      const index = state.songlist.currentSongIndex
      const prevIndex = prev.songlist.currentSongIndex
      const prevSong = prevList[prevIndex]
      const isSong = state.playerState.mediaType === 'song'
      const listChanged = list !== prevList
      // Also a skip to the same song further on (it's in the queue twice).
      const songChanged =
        list[index]?.id !== prevSong?.id ||
        (!listChanged && index !== prevIndex)
      const paused = prev.playerState.isPlaying && !state.playerState.isPlaying
      const played = !prev.playerState.isPlaying && state.playerState.isPlaying
      // "Clear queue" keeps only the playing song.
      const cleared =
        listChanged &&
        isQueueCleared(
          prevList.map((s) => s.id),
          list.map((s) => s.id),
          prevSong?.id ?? null,
        )
      // The previous song played to its end (not a skip).
      const endedNaturally = isNaturalEnd(
        prev.playerProgress.progress,
        prev.playerState.currentDuration || prevSong?.duration || 0,
      )
      const autoEdit = autoEdits > 0 && !songChanged

      if (isSong && list.length) {
        if (songChanged) {
          if (!endedNaturally) closeLeftBehind()
          // Left behind first, then this change's save (if any).
          checkLeftBehind()
            .catch(() => {})
            .finally(() => publishEvent('songChange'))
        } else if (listChanged && !cleared) {
          if (!autoEdit) closeLeftBehind()
          publishEvent('queueEdit')
        }
        if (paused) {
          // A pause from "Pause here" doesn't save.
          const fromPauseHere = takePauseHere()
          if (!songChanged && !fromPauseHere) publishEvent('pause')
        }
      }
      if (played) handoffPlayed()

      const { currentList, currentSongIndex } = state.songlist
      const isLast =
        currentList.length > 0 && currentSongIndex === currentList.length - 1
      const looping = state.playerState.loopState !== 0
      if (
        song?.id &&
        isLast &&
        !looping &&
        state.playerState.mediaType === 'song' &&
        autoDjFor !== song.id &&
        isLibraryShuffle()
      ) {
        autoDjFor = song.id
        autoEdits++
        topUpLibraryShuffle()
          .catch((e) => logger.error('Shuffle top-up', e))
          .finally(() => autoEdits--)
        return
      }
      if (
        autoDj &&
        song?.id &&
        isLast &&
        !looping &&
        state.playerState.mediaType === 'song' &&
        autoDjFor !== song.id
      ) {
        autoDjFor = song.id
        const exclude = new Set(currentList.map((s) => s.id))
        autoEdits++
        queueSync
          .similarTo(song, exclude)
          .then((songs) => {
            if (songs.length)
              usePlayerStore.getState().actions.setLastOnQueue(songs)
          })
          .catch((e) => logger.error('AutoDJ', e))
          .finally(() => autoEdits--)
      }
    })
    return unsub
  }, [])
  return null
}
