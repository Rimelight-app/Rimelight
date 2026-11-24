import { ListEnd, ListStart, MonitorSmartphone, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { create } from 'zustand'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { cn } from '@/lib/utils'
import {
  closeLeftBehind,
  continueOffer,
  dismissOffer,
  pauseHere,
} from '@/service/handoff'
import { ageText } from '@/service/queue-handoff'
import { useHandoffStore } from '@/store/handoff.store'

type Pill = { id: number; kind: 'next' | 'last'; count: number }

const usePillStore = create<{ pill: Pill | null }>()(() => ({ pill: null }))

let seq = 0

/** Confirms Play next / Add to queue with a short pill above the player bar. */
export function showQueuePill(kind: 'next' | 'last', count: number) {
  if (count < 1) return
  usePillStore.setState({ pill: { id: ++seq, kind, count } })
}

const VISIBLE_MS = 1800
const FADE_MS = 200

export function QueuePill() {
  const { t } = useTranslation()
  const pill = usePillStore((s) => s.pill)
  const [shown, setShown] = useState<Pill | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!pill) return
    setVisible(false)
    setShown(pill)
    // Next frame, so a new pill animates in even if one is showing.
    const raf = requestAnimationFrame(() => setVisible(true))
    const hide = window.setTimeout(() => setVisible(false), VISIBLE_MS)
    const clear = window.setTimeout(() => {
      setShown(null)
      usePillStore.setState({ pill: null })
    }, VISIBLE_MS + FADE_MS)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(hide)
      window.clearTimeout(clear)
    }
  }, [pill])

  const Icon = shown?.kind === 'next' ? ListStart : ListEnd

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[104px] z-[60] flex flex-col items-center gap-2"
      aria-live="polite"
    >
      {shown && (
        <div
          key={shown.id}
          data-testid="queue-pill"
          className={cn(
            'glass-chip glass-blur flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium text-white/90',
            'shadow-[0_10px_30px_-10px_rgb(0_0_0/0.6)] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
            visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
          )}
        >
          <Icon className="size-4 text-white/70" strokeWidth={2} />
          <span>
            {t(`clearplay.queuePill.${shown.kind}`, { count: shown.count })}
          </span>
        </div>
      )}
      <HandoffPill />
    </div>
  )
}

const pillButton =
  'h-7 shrink-0 rounded-full bg-white/90 px-3 text-[12px] font-semibold text-[#121216] transition-colors hover:bg-white disabled:opacity-60'
const closeButton =
  'flex size-7 shrink-0 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white'

/** "5 min ago" and so on; re-rendered every 30 s while it shows. */
function useAge(changed: string | undefined) {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!changed) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [changed])
  if (!changed) return ''
  const age = ageText(changed, now)
  const k = 'clearplay.handoff.age'
  switch (age.unit) {
    case 'justNow':
      return t(`${k}.justNow`)
    case 'minutes':
      return t(`${k}.minutes`, { count: age.count })
    case 'hours':
      return t(`${k}.hours`, { count: age.count })
    case 'yesterday':
      return t(`${k}.yesterday`)
    case 'date':
      return new Date(age.changed).toLocaleDateString(i18n.language)
  }
}

/**
 * "Continue on other devices": the Continue offer, or "Continued on
 * <device>". Stays until acted on (no auto-hide).
 */
function HandoffPill() {
  const { t } = useTranslation()
  const current = useHandoffStore((s) => s.offer)
  const left = useHandoffStore((s) => s.leftBehind)
  const [busy, setBusy] = useState(false)
  const age = useAge(
    current && current.offer.kind !== 'playing'
      ? current.offer.changed
      : undefined,
  )
  const k = 'clearplay.handoff'

  if (!current && !left) return null

  const chip = cn(
    'glass-chip glass-blur pointer-events-auto flex max-w-[min(640px,calc(100vw-32px))] items-center gap-3 rounded-full py-1.5 pl-1.5 pr-1.5 text-[13px] font-medium text-white/90',
    'shadow-[0_10px_30px_-10px_rgb(0_0_0/0.6)]',
  )

  if (current) {
    const { offer } = current
    const playing = offer.kind === 'playing'
    const lead = {
      playing: `${k}.playingOn`,
      paused: `${k}.pausedOn`,
      saved: `${k}.savedBy`,
    }[offer.kind]
    // The song Continue starts (offer.song), never another one.
    const parts = [
      t(lead, { device: offer.device }),
      offer.song.title,
      ...(playing ? [] : [age]),
    ]
    return (
      <div data-testid="handoff-pill" data-kind={offer.kind} className={chip}>
        <img
          src={getSimpleCoverArtUrl(offer.song.coverArt, 'song', '80')}
          alt=""
          className="size-8 shrink-0 rounded-full object-cover"
        />
        <span className="min-w-0 truncate">{parts.join(' · ')}</span>
        <button
          type="button"
          data-testid="handoff-continue"
          disabled={busy}
          className={pillButton}
          onClick={async () => {
            setBusy(true)
            await continueOffer().catch(() => false)
            setBusy(false)
          }}
        >
          {t(playing ? `${k}.continueHere` : `${k}.continue`)}
        </button>
        <button
          type="button"
          data-testid="handoff-dismiss"
          aria-label={t(`${k}.dismiss`)}
          className={closeButton}
          onClick={dismissOffer}
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  if (!left) return null
  return (
    <div data-testid="handoff-left-behind" className={chip}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10">
        <MonitorSmartphone className="size-4 text-white/70" strokeWidth={2} />
      </span>
      <span className="min-w-0 truncate">
        {t(`${k}.continuedOn`, { device: left.device })}
      </span>
      <button
        type="button"
        data-testid="handoff-pause-here"
        className={pillButton}
        onClick={pauseHere}
      >
        {t(`${k}.pauseHere`)}
      </button>
      <button
        type="button"
        aria-label={t(`${k}.dismiss`)}
        className={closeButton}
        onClick={closeLeftBehind}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
