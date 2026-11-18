import clsx from 'clsx'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export interface LrcLine {
  time: number // ms
  text: string
}

const TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

/** Parses LRC text into time-sorted lines; metadata tags are skipped. */
export function parseLrc(lrc: string): LrcLine[] {
  const out: LrcLine[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(TIME)]
    if (!stamps.length) continue
    const text = raw.replace(TIME, '').trim()
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0
      out.push({
        time: Number(m[1]) * 60_000 + Number(m[2]) * 1000 + frac,
        text,
      })
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

interface SmoothLyricsProps {
  lrc: string
  getTime: () => number // seconds
  onSeek: (ms: number) => void
  lang?: string
  sizeClass: string
  compact?: boolean
}

/**
 * Synced lyrics that glide: the whole list moves with one GPU transform and
 * eases into place on each line change. The current line is full size and
 * bright; the rest are scaled down and dimmed by distance. Wheel/trackpad
 * scrolling lets you look around; it eases back to the current line after a
 * short pause.
 */
export function SmoothLyrics({
  lrc,
  getTime,
  onSeek,
  lang,
  sizeClass,
  compact = false,
}: SmoothLyricsProps) {
  const lines = useMemo(() => parseLrc(lrc), [lrc])
  const [active, setActive] = useState(-1)
  const [offset, setOffset] = useState(0)
  const [manual, setManual] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([])
  const manualTimer = useRef<number>()

  // Follow playback on animation frames; only re-render when the line changes.
  useEffect(() => {
    let last = -2
    const tick = () => {
      const ms = getTime() * 1000 + 150 // show a line a moment before it is sung
      let lo = 0
      let hi = lines.length - 1
      let idx = -1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (lines[mid].time <= ms) {
          idx = mid
          lo = mid + 1
        } else hi = mid - 1
      }
      if (idx !== last) {
        last = idx
        setActive(idx)
      }
    }
    tick()
    const id = window.setInterval(tick, 100)
    return () => window.clearInterval(id)
  }, [lines, getTime])

  const recenter = useCallback(() => {
    const box = boxRef.current
    const el = lineRefs.current[Math.max(0, active)]
    if (!box || !el) return
    const anchor = box.clientHeight * (compact ? 0.4 : 0.42)
    setOffset(anchor - (el.offsetTop + el.offsetHeight / 2))
  }, [active, compact])

  useLayoutEffect(() => {
    recenter()
  }, [recenter])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const ro = new ResizeObserver(recenter)
    ro.observe(box)
    return () => ro.disconnect()
  }, [recenter])

  // A new line ends manual browsing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on line change
  useEffect(() => {
    setManual(0)
  }, [active])

  const onWheel = (e: React.WheelEvent) => {
    setManual((m) => m - e.deltaY)
    window.clearTimeout(manualTimer.current)
    manualTimer.current = window.setTimeout(() => setManual(0), 2500)
  }

  if (!lines.length) return null

  return (
    <div
      ref={boxRef}
      onWheel={onWheel}
      className={clsx(
        'relative h-full w-full overflow-hidden px-2 maskImage-big-player-lyrics',
        'select-none text-left font-bold tracking-tight',
        sizeClass,
      )}
    >
      <div
        className="absolute inset-x-2 top-0 will-change-transform"
        style={{
          transform: `translate3d(0, ${offset + manual}px, 0)`,
          transition: manual
            ? 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)'
            : 'transform 1100ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {lines.map((line, i) => {
          const distance = active < 0 ? i + 1 : Math.abs(i - active)
          const isActive = i === active
          return (
            <p
              key={`${line.time}-${i}`}
              ref={(el) => {
                lineRefs.current[i] = el
              }}
              lang={lang}
              onClick={() => onSeek(line.time)}
              className={clsx(
                'origin-left cursor-pointer',
                compact ? 'py-2.5' : 'py-4',
                'transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
                'motion-reduce:transition-none',
                'text-white',
              )}
              style={{
                transform: `scale(${isActive ? 1 : compact ? 0.9 : 0.82})`,
                // Only transform + opacity change: both stay on the compositor.
                opacity: isActive ? 1 : Math.max(0.18, 0.42 - distance * 0.05),
              }}
            >
              {line.text || '♪'}
            </p>
          )
        })}
        <div className="h-[50vh]" aria-hidden />
      </div>
    </div>
  )
}
