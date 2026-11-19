import { rateSong, useSongRating } from '@/store/ratings.store'
import { ISong } from '@/types/responses/song'
import { StarRating } from './star-rating'

type SongRatingProps = {
  song: Pick<ISong, 'id' | 'userRating'> | undefined
  size?: 'xs' | 'sm' | 'md'
  className?: string
}

/** Star rating bound to a song: reads and saves through the ratings store. */
export function SongRating({ song, size, className }: SongRatingProps) {
  const value = useSongRating(song)

  return (
    <StarRating
      value={value}
      size={size}
      className={className}
      disabled={!song?.id}
      onChange={(next) => {
        if (song?.id) rateSong(song, next)
      }}
    />
  )
}
