import { httpClient } from '@/api/httpClient'
import { showMessagePill } from '@/app/components/player/queue-pill'
import i18n from '@/i18n'
import { useClearPlaySettings } from '@/store/clearplay-settings.store'
import { usePlayerStore } from '@/store/player.store'
import type { ISong } from '@/types/responses/song'
import { logger } from '@/utils/logger'
import { useConnectionStore } from './connection'
import { isUsingLocalLibrary } from './local-library'
import { RadioSeed, radioQueue, radioRequest } from './radio-rules'

type SimilarResponse = {
  similarSongs?: { song?: ISong[] }
  similarSongs2?: { song?: ISong[] }
}

/** Shown at all: not for "Music on this computer". */
export function radioAvailable(seed: RadioSeed) {
  return radioRequest(seed, isUsingLocalLibrary()) !== null
}

/** Usable right now: the server can be reached. */
export function radioOnline() {
  return (
    navigator.onLine !== false && !useConnectionStore.getState().unreachable
  )
}

/**
 * Start radio from a song, album or artist: replaces the queue with the seed
 * (songs) and similar songs from the server, turns on "Keep playing similar
 * music" and plays. Nothing found or no answer: the queue stays as it is and
 * a pill says so.
 */
export async function startRadio(seed: RadioSeed, seedSong?: ISong) {
  const request = radioRequest(seed, isUsingLocalLibrary())
  if (!request) return false
  let similar: ISong[] = []
  try {
    const res = await httpClient<SimilarResponse>(request.path, {
      method: 'GET',
      query: request.query,
    })
    similar = res?.data?.[request.key]?.song ?? []
  } catch (e) {
    logger.error('[radio] similar songs failed', e)
  }
  const queue = radioQueue(seedSong ?? null, similar)
  if (queue.length === 0) {
    showMessagePill(
      i18n.t('clearplay.radio.nothingFound', { name: seed.name }),
      { kind: 'error' },
    )
    return false
  }
  const { actions } = usePlayerStore.getState()
  actions.setSongList(queue, 0)
  useClearPlaySettings.getState().set({ autoDj: true })
  actions.setPlayingState(true)
  return true
}
