import { useEffect } from 'react'
import {
  isLibraryShuffle,
  topUpLibraryShuffle,
} from '@/service/library-shuffle'
import { queueSync } from '@/service/queue-sync'
import { useClearPlaySettings } from '@/store/clearplay-settings.store'
import { usePlayerStore } from '@/store/player.store'
import { logger } from '@/utils/logger'

/**
 * - Queue sync: saves the queue to the server a few seconds after the track
 *   changes, and on pause.
 * - AutoDJ: when the last song in the queue starts, appends similar songs.
 * - Library shuffle: when its last song starts, appends more random songs.
 */
export function QueueObserver() {
  useEffect(() => {
    let saveTimer: number | undefined
    let autoDjFor: string | null = null

    const unsub = usePlayerStore.subscribe((state, prev) => {
      const { syncQueue, autoDj } = useClearPlaySettings.getState()
      const song = state.songlist.currentSong
      const songChanged = song?.id !== prev.songlist.currentSong?.id
      const paused = prev.playerState.isPlaying && !state.playerState.isPlaying

      if (syncQueue && song?.id && (songChanged || paused)) {
        window.clearTimeout(saveTimer)
        saveTimer = window.setTimeout(
          () => {
            queueSync
              .saveToServer()
              .catch((e) => logger.error('savePlayQueue', e))
          },
          songChanged ? 4000 : 500,
        )
      }

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
        topUpLibraryShuffle().catch((e) => logger.error('Shuffle top-up', e))
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
        queueSync
          .similarTo(song, exclude)
          .then((songs) => {
            if (songs.length)
              usePlayerStore.getState().actions.setLastOnQueue(songs)
          })
          .catch((e) => logger.error('AutoDJ', e))
      }
    })
    return () => {
      unsub()
      window.clearTimeout(saveTimer)
    }
  }, [])
  return null
}
