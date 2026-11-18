import { Moon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/app/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'
import { cn } from '@/lib/utils'
import { useSleepTimer } from '@/store/audio-fx.store'

function useRemaining(until: number | 'track' | null) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (typeof until !== 'number') return
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [until])
  if (typeof until !== 'number') return null
  const s = Math.max(0, Math.round((until - Date.now()) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function SleepTimerButton() {
  const { t } = useTranslation()
  const { until, set } = useSleepTimer()
  const remaining = useRemaining(until)
  const active = until !== null
  const minutes = [15, 30, 45, 60, 90]

  return (
    <DropdownMenu>
      <SimpleTooltip text={t('clearplay.sleep.title')}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              'relative h-10 rounded-full p-2 text-secondary-foreground',
              active ? 'w-auto gap-1.5 px-3 player-button-active' : 'w-10',
            )}
            data-testid="sleep-timer-button"
          >
            <Moon className={cn('h-4 w-4', active && 'fill-current')} />
            {remaining && (
              <span className="text-[11px] tabular-nums">{remaining}</span>
            )}
          </Button>
        </DropdownMenuTrigger>
      </SimpleTooltip>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>{t('clearplay.sleep.title')}</DropdownMenuLabel>
        {minutes.map((m) => (
          <DropdownMenuItem
            key={m}
            onClick={() => set(Date.now() + m * 60_000)}
          >
            {t('clearplay.sleep.minutes', { count: m })}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={() => set('track')}>
          {t('clearplay.sleep.endOfTrack')}
        </DropdownMenuItem>
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => set(null)}>
              {t('clearplay.sleep.off')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
