import { toast } from 'react-toastify'
import i18n from '@/i18n'
import { usePlayerStore } from '@/store/player.store'
import { PlaybackSource } from '@/types/playerContext'
import { ISong } from '@/types/responses/song'
import { logger } from '@/utils/logger'
import { subsonic } from './subsonic'

/** Queue id used to recognise a whole-library shuffle (for topping it up). */
export const LIBRARY_SHUFFLE_ID = 'library-shuffle'

const FIRST_BATCH = 300
const TOP_UP_BATCH = 150

function source(): PlaybackSource {
  return {
    type: 'songs',
    id: LIBRARY_SHUFFLE_ID,
    name: i18n.t('rimelight.shuffleLibrary.label'),
  }
}

async function randomSongs(size: number, exclude?: Set<string>) {
  const songs = (await subsonic.songs.getRandomSongs({ size })) ?? []
  const seen = new Set(exclude)
  // The server can repeat songs between calls; keep each one once.
  return songs.filter((song: ISong) => {
    if (seen.has(song.id)) return false
    seen.add(song.id)
    return true
  })
}

/** Plays the whole library in random order. */
export async function shuffleLibrary() {
  try {
    const songs = await randomSongs(FIRST_BATCH)
    if (!songs.length) {
      toast.error(i18n.t('rimelight.shuffleLibrary.failed'))
      return false
    }
    usePlayerStore.getState().actions.setSongList(songs, 0, false, source())
    return true
  } catch (error) {
    logger.error('shuffleLibrary', error)
    toast.error(i18n.t('rimelight.shuffleLibrary.failed'))
    return false
  }
}

export function isLibraryShuffle() {
  const { source } = usePlayerStore.getState().playerState.playbackContext
  return source?.id === LIBRARY_SHUFFLE_ID
}

/** Adds more random songs when a library shuffle reaches its last song. */
export async function topUpLibraryShuffle() {
  const { currentList } = usePlayerStore.getState().songlist
  const songs = await randomSongs(
    TOP_UP_BATCH,
    new Set(currentList.map((song) => song.id)),
  )
  if (songs.length && isLibraryShuffle()) {
    usePlayerStore.getState().actions.setLastOnQueue(songs, true)
  }
}
