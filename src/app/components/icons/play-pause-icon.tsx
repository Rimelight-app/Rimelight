import clsx from 'clsx'
import { CSSProperties } from 'react'

/*
 * Play and pause as two shapes that morph into each other. The play
 * triangle is cut down the middle into two halves; each half has the same
 * four points as one pause bar, so the browser can tween the paths (CSS `d`
 * transition, see .cp-playpause in index.css). Coordinates are stroke
 * centrelines on a 24×24 grid; a round-joined stroke of the same colour
 * gives the soft corners.
 */
const shapes = {
  pause: ['M6 4L10 4L10 20L6 20Z', 'M14 4L18 4L18 20L14 20Z'],
  play: ['M6.5 4L13.25 8L13.25 16L6.5 20Z', 'M13.25 8L20 12L20 12L13.25 16Z'],
} as const

interface PlayPauseIconProps {
  /** true shows the pause bars, false the play triangle. */
  playing: boolean
  className?: string
  strokeWidth?: number
}

export function PlayPauseIcon({
  playing,
  className,
  strokeWidth = 2,
}: PlayPauseIconProps) {
  const [left, right] = playing ? shapes.pause : shapes.play

  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      aria-hidden="true"
      className={clsx('cp-playpause', className)}
      data-state={playing ? 'playing' : 'paused'}
    >
      {/* Same two elements in both states, so they tween instead of being
          replaced. The attribute is a fallback; the style animates. */}
      <path d={left} style={pathStyle(left)} />
      <path d={right} style={pathStyle(right)} />
    </svg>
  )
}

function pathStyle(d: string) {
  return { d: `path('${d}')` } as CSSProperties
}
