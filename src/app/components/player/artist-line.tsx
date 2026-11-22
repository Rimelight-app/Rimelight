import { TooltipPortal } from '@radix-ui/react-tooltip'
import {
  ArrowLeftRight,
  Blend,
  Bluetooth,
  CircleCheck,
  type LucideIcon,
  MoveRight,
  Volume1,
} from 'lucide-react'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/app/components/ui/tooltip'
import { useOutputLine } from '@/app/hooks/use-output-line'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/routesList'
import {
  useBitPerfect,
  useIsMpvSession,
  useMpvRuntime,
} from '@/store/bitperfect.store'
import { ISong } from '@/types/responses/song'
import type { OutputKind } from '@/utils/bitperfect'
import { ALBUM_ARTISTS_MAX_NUMBER } from '@/utils/multipleArtists'

/*
 * Artist line of the player bar: "Artist · Not bit-perfect: system mixer".
 * The song's own format and rate stay on the line below, next to the stars.
 *
 * The artist always shows in full. The output info after it steps down when
 * the line is too narrow, and is never cut mid-word:
 *   0  Not bit-perfect: system mixer
 *   1  Mixed
 *   2  status icon
 *   -  hidden (the full text stays in the tooltip)
 * Every step is laid out off-screen at its natural width, so the choice only
 * depends on the line's real width and never on the step shown.
 */

const SHORT_STATUS: Record<OutputKind, string> = {
  idle: '',
  bitperfect: 'Bit-perfect',
  converted: 'Converted',
  lossy: 'Direct',
  appvolume: 'App volume',
  busy: 'Mixed',
  refused: 'Mixed',
  shared: 'Mixed',
  bluetooth: 'Re-encoded',
}

const STATUS_ICON: Record<OutputKind, LucideIcon | null> = {
  idle: null,
  bitperfect: CircleCheck,
  converted: ArrowLeftRight,
  lossy: MoveRight,
  appvolume: Volume1,
  busy: Blend,
  refused: Blend,
  shared: Blend,
  bluetooth: Bluetooth,
}

const STEPS = [0, 1, 2]

/** Output status for the player bar, or null when it's switched off. */
function useStatus() {
  const mpv = useIsMpvSession()
  const show = useBitPerfect((s) => s.placement === 'player') && mpv
  const line = useOutputLine()
  const device = useMpvRuntime((s) => s.output?.deviceName ?? '')
  return useMemo(
    () => (show && line.short ? { ...line, device } : null),
    [show, line, device],
  )
}

type Status = NonNullable<ReturnType<typeof useStatus>>

const Dot = () => <span className="text-white/35">·</span>

/** One step of the output info, with its leading "·" separator. */
function StatusStep({ step, status }: { step: number; status: Status }) {
  const Icon = STATUS_ICON[status.kind]
  const tone = status.bitPerfect ? 'text-white/75' : 'text-white/60'
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Dot />
      {step === 2 && Icon ? (
        <Icon
          aria-label={SHORT_STATUS[status.kind]}
          className={cn('size-3 shrink-0', tone)}
          strokeWidth={2.25}
        />
      ) : (
        <span className={tone}>
          {step === 0 ? status.short : SHORT_STATUS[status.kind]}
        </span>
      )}
    </span>
  )
}

function ArtistNames({ song, plain }: { song: ISong; plain?: boolean }) {
  const { artists, artistId, artist } = song
  const list =
    artists && artists.length > 1
      ? artists.slice(0, ALBUM_ARTISTS_MAX_NUMBER)
      : [{ id: artistId, name: artist }]

  return (
    <>
      {list.map(({ id, name }, index) => (
        <span key={`${id ?? ''}-${index}`}>
          {plain ? name : <ArtistLink id={id} name={name} />}
          {index < list.length - 1 && ', '}
        </span>
      ))}
    </>
  )
}

function ArtistLink({ id, name }: { id?: string; name: string }) {
  return (
    <Link
      to={ROUTES.ARTIST.PAGE(id ?? '')}
      className={cn(
        id ? 'hover:underline hover:text-foreground' : 'pointer-events-none',
      )}
      data-testid="track-artist-url"
    >
      {name}
    </Link>
  )
}

function stepWidth(els: HTMLElement[], i: number) {
  return els[i]?.getBoundingClientRect().width ?? Number.POSITIVE_INFINITY
}

export function ArtistLine({ song }: { song: ISong }) {
  const status = useStatus()

  const lineRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  // -1 = info hidden.
  const [shown, setShown] = useState<number>(-1)

  const pick = useCallback(
    (sync: boolean) => {
      const line = lineRef.current
      const box = measureRef.current
      if (!line || !box) return
      const avail = line.getBoundingClientRect().width
      const [artistEl, ...stepEls] = Array.from(box.children) as HTMLElement[]
      const artistW = artistEl?.getBoundingClientRect().width ?? 0
      let next = -1
      // 1px slack: fractional scaling rounds widths to device pixels.
      if (status && artistW <= avail - 1) {
        for (let i = 0; i < stepEls.length; i++) {
          if (artistW + stepWidth(stepEls, i) <= avail - 1) {
            next = STEPS[i]
            break
          }
        }
      }
      if (sync) flushSync(() => setShown(next))
      else setShown(next)
    },
    [status],
  )

  // Before paint on every change of content; ResizeObserver for size
  // changes (window, scaling, fonts). Its callback runs before paint too, and
  // flushSync applies the new step in the same frame: no jump.
  useLayoutEffect(() => {
    pick(false)
    const line = lineRef.current
    const box = measureRef.current
    if (!line || !box) return
    const ro = new ResizeObserver(() => pick(true))
    ro.observe(line)
    ro.observe(box)
    document.fonts?.ready.then(() => pick(false)).catch(() => {})
    return () => ro.disconnect()
  }, [pick])

  const hidden = !!status && shown < 0
  const tooltip = status
    ? [
        hidden &&
          (song.artists && song.artists.length > 1
            ? song.artists.map((a) => a.name).join(', ')
            : song.artist),
        status.text,
        status.device && `Output: ${status.device}`,
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  // One tooltip, always mounted so the line element never remounts. Its
  // trigger is the whole line; it only opens over the info, or anywhere on
  // the line when the info is hidden.
  const [open, setOpen] = useState(false)
  const overInfo = useRef(false)
  const timer = useRef<number>()
  useLayoutEffect(() => () => window.clearTimeout(timer.current), [])
  const canOpen = () => !!status && (hidden || overInfo.current)

  return (
    <TooltipProvider delayDuration={350}>
      <Tooltip
        open={open && canOpen()}
        onOpenChange={(next) => setOpen(next && canOpen())}
      >
        <TooltipTrigger asChild>
          <div
            ref={lineRef}
            className="relative flex h-4 w-full min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
            data-testid="track-artist-line"
          >
            <span
              className="max-w-full shrink-0 truncate"
              data-testid="track-artists"
            >
              <ArtistNames song={song} />
            </span>
            {status && shown >= 0 && (
              <span
                className="min-w-0 overflow-hidden text-[11px] text-white/50"
                data-testid="output-line"
                data-step={shown}
                data-output={status.short}
                onPointerEnter={() => {
                  overInfo.current = true
                  window.clearTimeout(timer.current)
                  timer.current = window.setTimeout(() => setOpen(true), 350)
                }}
                onPointerLeave={() => {
                  overInfo.current = false
                  window.clearTimeout(timer.current)
                  setOpen(false)
                }}
              >
                <StatusStep step={shown} status={status} />
              </span>
            )}

            {/* Off-screen copies at natural width, for measuring only. */}
            <div
              ref={measureRef}
              aria-hidden
              className="pointer-events-none invisible absolute left-0 top-0 flex w-max flex-col items-start"
            >
              <span className="whitespace-nowrap text-xs">
                <ArtistNames song={song} plain />
              </span>
              {status &&
                STEPS.map((s) => (
                  <span key={s} className="flex pl-1.5 text-[11px]">
                    <StatusStep step={s} status={status} />
                  </span>
                ))}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            side="top"
            align="start"
            // Frosted like the app's other glass surfaces, not the solid
            // popover colour.
            className="glass-blur rounded-[14px] border-white/10 bg-[rgb(20_20_28/0.6)] px-3 py-2 text-white/90 shadow-[0_10px_40px_-12px_rgb(0_0_0/0.6)]"
          >
            <p
              className="whitespace-pre-line text-[12px] font-normal leading-5"
              data-testid="output-line-tooltip"
            >
              {tooltip}
            </p>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  )
}
