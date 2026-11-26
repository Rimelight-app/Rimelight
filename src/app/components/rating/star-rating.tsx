import clsx from 'clsx'
import { Star } from 'lucide-react'
import { KeyboardEvent, MouseEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const sizes = {
  xs: 'size-[11px]',
  sm: 'size-[13px]',
  md: 'size-[15px]',
} as const

interface StarRatingProps {
  value: number
  onChange: (value: number) => void
  size?: keyof typeof sizes
  className?: string
  disabled?: boolean
}

/**
 * Five quiet white stars. Hovering previews the rating, clicking sets it and
 * clicking the current rating again clears it. Filled stars are soft white,
 * empty ones a faint outline, so the row stays in the background until used.
 */
export function StarRating({
  value,
  onChange,
  size = 'sm',
  className,
  disabled = false,
}: StarRatingProps) {
  const { t } = useTranslation()
  const [hover, setHover] = useState(0)
  const [pop, setPop] = useState<[number, number]>([0, 0])
  const popTimer = useRef<number>()

  useEffect(() => () => window.clearTimeout(popTimer.current), [])

  // Briefly pop the stars a click just filled (only on a click, so moving to
  // another song with a different rating stays still).
  function popFilled(from: number, to: number) {
    window.clearTimeout(popTimer.current)
    setPop([from, to])
    popTimer.current = window.setTimeout(() => setPop([0, 0]), 420)
  }

  const shown = hover || value

  function select(e: MouseEvent, star: number) {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    const next = star === value ? 0 : star
    if (next > value) popFilled(value, next)
    // Show the saved value straight away, not the hover preview.
    setHover(0)
    onChange(next)
  }

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      onChange(Math.min(5, value + 1))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      onChange(Math.max(0, value - 1))
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={t('rimelight.rating.label')}
      aria-disabled={disabled}
      className={clsx(
        'group/rating inline-flex shrink-0 items-center',
        disabled && 'pointer-events-none opacity-40',
        className,
      )}
      onMouseLeave={() => setHover(0)}
      onKeyDown={handleKey}
      data-testid="star-rating"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= shown
        const previewing = hover > 0
        const popping = star > pop[0] && star <= pop[1]
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={star === value}
            aria-label={t('rimelight.rating.star', { count: star })}
            title={t('rimelight.rating.star', { count: star })}
            tabIndex={star === (value || 1) ? 0 : -1}
            onMouseEnter={() => setHover(star)}
            onClick={(e) => select(e, star)}
            onPointerDown={(e) => e.stopPropagation()}
            className={clsx(
              'flex items-center justify-center rounded-full px-[1.5px] py-0.5 outline-none',
              'transition-transform duration-150 ease-out active:scale-90',
              'focus-visible:ring-1 focus-visible:ring-white/40',
              hover === star && 'scale-[1.18]',
            )}
          >
            <Star
              strokeWidth={1.75}
              className={clsx(
                sizes[size],
                'transition-[color,fill,opacity] duration-150 ease-out',
                filled
                  ? previewing
                    ? 'fill-white text-white'
                    : 'fill-white/80 text-white/80'
                  : 'fill-transparent text-white/25 group-hover/rating:text-white/40',
                popping && 'cp-star-pop',
              )}
              style={
                popping
                  ? { animationDelay: `${(star - pop[0] - 1) * 30}ms` }
                  : undefined
              }
            />
          </button>
        )
      })}
    </div>
  )
}
