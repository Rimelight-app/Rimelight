import clsx from 'clsx'
import { ListMusic, MicVocal, X } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { LyricsTab } from '@/app/components/fullscreen/lyrics'
import { FullscreenSongQueue } from '@/app/components/fullscreen/queue'
import {
  useLyricsState,
  useMainDrawerState,
  useQueueState,
} from '@/store/player.store'
import { QueueActions } from './queue-actions'

const MemoLyrics = memo(LyricsTab)
const MemoQueue = memo(FullscreenSongQueue)

/**
 * Right-hand frosted panel with lyrics or the queue, available on every page.
 * Driven by the existing player-bar lyrics/queue buttons.
 */
export function SidePanel() {
  const { t } = useTranslation()
  const { mainDrawerState, closeDrawer } = useMainDrawerState()
  const { lyricsState, setLyricsState } = useLyricsState()
  const { queueState, setQueueState } = useQueueState()
  const open = mainDrawerState && (lyricsState || queueState)

  const show = (tab: 'lyrics' | 'queue') => {
    setLyricsState(tab === 'lyrics')
    setQueueState(tab === 'queue')
  }

  const tab = (
    id: 'lyrics' | 'queue',
    label: string,
    Icon: typeof MicVocal,
  ) => {
    const active = id === 'lyrics' ? lyricsState : queueState
    return (
      <button
        type="button"
        onClick={() => show(id)}
        aria-pressed={active}
        data-testid={`side-panel-${id}`}
        className={clsx(
          'inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors',
          active
            ? 'bg-white/[0.14] text-white'
            : 'text-white/55 hover:text-white/90',
        )}
      >
        <Icon className="size-4" strokeWidth={1.75} />
        {label}
      </button>
    )
  }

  return (
    <aside
      aria-hidden={!open}
      className={clsx(
        'glass-panel fixed right-3 z-30 flex w-[--side-panel-width] flex-col rounded-[20px]',
        'top-[--header-height] bottom-[--player-height]',
        'transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        open
          ? 'translate-x-0 opacity-100'
          : 'pointer-events-none translate-x-6 opacity-0',
      )}
    >
      <div className="flex items-center justify-between p-2.5 pb-1">
        <div className="glass-chip flex items-center gap-0.5 rounded-full p-0.5">
          {tab('lyrics', t('fullscreen.lyrics'), MicVocal)}
          {tab('queue', t('fullscreen.queue'), ListMusic)}
        </div>
        <button
          type="button"
          onClick={closeDrawer}
          aria-label={t('clearplay.close')}
          className="flex size-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 px-2 pb-2">
        {open && lyricsState && (
          <div className="h-full px-2">
            <MemoLyrics compact />
          </div>
        )}
        {open && queueState && (
          <div className="flex h-full flex-col">
            <QueueActions />
            <div className="min-h-0 flex-1">
              <MemoQueue />
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
