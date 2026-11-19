import { clsx } from 'clsx'
import { Heart } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { usePop } from '@/app/hooks/use-pop'
import { usePlayerActions, usePlayerSongStarred } from '@/store/player.store'
import { buttonsStyle } from './controls'

export function LikeButton() {
  const { starCurrentSong } = usePlayerActions()
  const isSongStarred = usePlayerSongStarred()
  const { popping, trigger } = usePop()

  return (
    <Button
      size="icon"
      variant="ghost"
      className={buttonsStyle.secondary}
      onClick={() => {
        if (!isSongStarred) trigger()
        starCurrentSong()
      }}
      style={{ ...buttonsStyle.style }}
    >
      <Heart
        className={clsx(
          buttonsStyle.secondaryIcon,
          isSongStarred && 'text-red-500 fill-red-500',
          popping && 'cp-heart-pop',
        )}
      />
    </Button>
  )
}
