import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { rateSong, useRatingsStore } from '@/store/ratings.store'
import { ISong } from '@/types/responses/song'
import { StarRating } from './star-rating'

/**
 * A row for song context/dropdown menus: "Rating" with five stars. It is not
 * a menu item, so choosing a star leaves the menu open and shows the change.
 * With several songs selected it rates them all; the stars show their rating
 * when they share one.
 */
export function MenuRatingRow({ songs }: { songs: ISong[] }) {
  const { t } = useTranslation()
  const value = useRatingsStore((state) => {
    const values = songs.map(
      (song) => state.overrides[song.id] ?? song.userRating ?? 0,
    )
    return values.length && values.every((v) => v === values[0]) ? values[0] : 0
  })

  return (
    <div
      className="flex select-none items-center justify-between gap-6 rounded-sm px-2 py-1.5 text-sm"
      data-testid="menu-rating-row"
    >
      <span className="flex items-center">
        <Star className="mr-2 h-4 w-4" />
        {t('clearplay.rating.label')}
      </span>
      <StarRating
        value={value}
        size="sm"
        disabled={!songs.length}
        onChange={(next) => {
          for (const song of songs) rateSong(song, next)
        }}
      />
    </div>
  )
}
