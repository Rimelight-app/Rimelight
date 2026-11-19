import { toast } from 'react-toastify'
import { createWithEqualityFn } from 'zustand/traditional'
import i18n from '@/i18n'
import { subsonic } from '@/service/subsonic'
import { ISong } from '@/types/responses/song'
import { usePlayerStore } from './player.store'

interface RatingsState {
  /** Ratings changed in this session, by song id (0 = no rating). */
  overrides: Record<string, number>
}

/**
 * Session ratings. Songs come from many cached queries (albums, playlists,
 * search, the queue), so a changed rating is kept here and every view reads
 * it through useSongRating instead of refetching all of them.
 */
export const useRatingsStore = createWithEqualityFn<RatingsState>()(() => ({
  overrides: {},
}))

type RatedSong = Pick<ISong, 'id' | 'userRating'> | undefined

export function useSongRating(song: RatedSong) {
  return useRatingsStore((state) => {
    if (!song?.id) return 0
    return state.overrides[song.id] ?? song.userRating ?? 0
  })
}

function setOverride(id: string, value: number) {
  useRatingsStore.setState((state) => ({
    overrides: { ...state.overrides, [id]: value },
  }))
  usePlayerStore.getState().actions.setSongRatingInQueue(id, value)
}

/** Saves a rating (0 clears it). Updates the UI first, reverts on failure. */
export async function rateSong(song: NonNullable<RatedSong>, value: number) {
  const previous =
    useRatingsStore.getState().overrides[song.id] ?? song.userRating ?? 0
  if (previous === value) return

  setOverride(song.id, value)

  const ok = await subsonic.rating.setRating(song.id, value)
  if (!ok) {
    setOverride(song.id, previous)
    toast.error(i18n.t('clearplay.rating.failed'))
  }
}
