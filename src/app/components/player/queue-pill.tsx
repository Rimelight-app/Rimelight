import { ListEnd, ListStart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { create } from 'zustand'
import { cn } from '@/lib/utils'

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

  if (!shown) return null
  const Icon = shown.kind === 'next' ? ListStart : ListEnd

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[104px] z-[60] flex justify-center"
      aria-live="polite"
    >
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
    </div>
  )
}
