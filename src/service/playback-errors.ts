import { showMessagePill } from '@/app/components/player/queue-pill'
import i18n from '@/i18n'
import { usePlayerStore } from '@/store/player.store'
import { LoopState } from '@/types/playerContext'
import { logger } from '@/utils/logger'
import { markUnreachable, serverAnswers } from './connection'
import { isUsingLocalLibrary } from './local-library'
import { isLocalSongId } from './queue-sync'
import { decideOnError } from './playback-errors-rules'

/**
 * The one error path for songs that can't be played, used by both audio
 * engines (HTML audio's `error` event, mpv's load failure or `end-file` with
 * an error). Rules in playback-errors-rules.ts:
 *  - server unreachable: pause on the song with "Can't reach <server>"
 *  - first failure: load the same song once more
 *  - again: "Couldn't play <title>", next song (playbackError is set until
 *    the next song plays)
 *  - 3 songs in a row, or the last song: stop (the queue stays)
 */

const retried = new Set<string>()
let failuresInARow = 0
let handling: string | null = null

const t = (key: string, opts?: Record<string, unknown>) =>
  i18n.t(`rimelight.playbackErrors.${key}`, opts)

/** Songs from "Music on this computer" don't depend on the server. */
function isLocalSong(songId: string) {
  return isUsingLocalLibrary() || isLocalSongId(songId)
}

/**
 * Call when the current song failed to load or play.
 * @param songId the song that failed (ignored if it is no longer current)
 * @param retry loads the same song again in the engine
 */
export async function handleSongError(songId: string, retry: () => void) {
  const store = usePlayerStore.getState()
  const current = store.songlist.currentList[store.songlist.currentSongIndex]
  if (!current || current.id !== songId) return
  if (handling === songId) return
  handling = songId
  try {
    const reachable = isLocalSong(songId) || (await serverAnswers())
    const { loopState } = usePlayerStore.getState().playerState
    const decision = decideOnError({
      reachable,
      retries: retried.has(songId) ? 1 : 0,
      failuresInARow,
      hasNext:
        usePlayerStore.getState().actions.hasNextSong() ||
        loopState === LoopState.All,
    })
    logger.info('[playback] song failed', { songId, decision })
    const { actions } = usePlayerStore.getState()
    // The user may have moved on while the server was asked.
    const now = usePlayerStore.getState().songlist
    if (now.currentList[now.currentSongIndex]?.id !== songId) return

    switch (decision) {
      case 'offline':
        actions.setPlayingState(false)
        // "Can't reach <server>" stays until the server answers again.
        markUnreachable('playback')
        return
      case 'retry':
        retried.add(songId)
        retry()
        return
      default:
        break
    }

    retried.delete(songId)
    failuresInARow++
    actions.setPlaybackError({ songId, title: current.title })
    if (decision === 'stopLimit') {
      failuresInARow = 0
      actions.setPlayingState(false)
      showMessagePill(t('stoppedInARow', { count: 3 }), { kind: 'error' })
      return
    }
    showMessagePill(t('couldNotPlay', { title: current.title }), {
      kind: 'error',
    })
    if (decision === 'stopAtEnd') {
      actions.stopAtEnd()
      return
    }
    actions.playNextSong()
    actions.setPlayingState(true)
  } finally {
    handling = null
  }
}

/** A song is really playing: the failure streak is over. */
export function notePlaybackProgress(songId: string) {
  retried.delete(songId)
  failuresInARow = 0
  const { playbackError } = usePlayerStore.getState().playerState
  if (playbackError && playbackError.songId !== songId) {
    usePlayerStore.getState().actions.setPlaybackError(null)
  }
}
