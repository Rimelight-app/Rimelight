import clsx from 'clsx'
import { ChevronDown, ListMusic, MicVocal } from 'lucide-react'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageLoader } from '@/app/components/image-loader'
import { Drawer, DrawerContent, DrawerTitle } from '@/app/components/ui/drawer'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'
import { useAppWindow } from '@/app/hooks/use-app-window'
import { useAppStore } from '@/store/app.store'
import { usePlayerCurrentSong, usePlayerFullscreen } from '@/store/player.store'
import { isLinux, isWindows } from '@/utils/desktop'
import { FullscreenControls } from './controls'
import { FullscreenDragHandler } from './drag-handler'
import { GradientBackdrop } from './gradient-backdrop'
import { LikeButton } from './like-button'
import { LyricsTab } from './lyrics'
import { FullscreenProgress } from './progress'
import { FullscreenSongQueue } from './queue'
import { VolumeContainer } from './volume-container'

const MemoBackdrop = memo(GradientBackdrop)
const MemoLyrics = memo(LyricsTab)
const MemoQueue = memo(FullscreenSongQueue)

type Panel = 'lyrics' | 'queue' | 'none'

export function FullscreenMode() {
  const { handleDrawerAnimationEnd } = useAppWindow()
  const { isFullscreen, setIsFullscreen } = usePlayerFullscreen()

  return (
    <Drawer
      open={isFullscreen}
      onOpenChange={setIsFullscreen}
      fixed={true}
      handleOnly={true}
      disablePreventScroll={true}
      dismissible={true}
      modal={false}
    >
      <DrawerTitle className="sr-only">Now playing</DrawerTitle>
      <DrawerContent
        onAnimationEnd={handleDrawerAnimationEnd}
        className="h-screen w-screen rounded-t-none border-none select-none cursor-default mt-0 bg-transparent"
        showHandle={false}
        aria-describedby={undefined}
      >
        <MemoBackdrop />
        <FullscreenDragHandler />
        {isFullscreen && <NowPlaying onClose={() => setIsFullscreen(false)} />}
      </DrawerContent>
    </Drawer>
  )
}

function TopButton({
  label,
  active,
  onClick,
  children,
  testId,
}: {
  testId?: string
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <SimpleTooltip text={label} side="bottom" delay={300}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        data-testid={testId}
        className={clsx(
          'electron-no-drag inline-flex size-9 items-center justify-center rounded-full',
          'text-white/70 transition-colors duration-200 hover:text-white hover:bg-white/10',
          active && 'bg-white/[0.16] text-white',
        )}
      >
        {children}
        <span className="sr-only">{label}</span>
      </button>
    </SimpleTooltip>
  )
}

function NowPlaying({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [panel, setPanel] = useState<Panel>('lyrics')
  const song = usePlayerCurrentSong()
  const hideFavorites = useAppStore().pages.hideFavoritesSection
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? 'none' : p))
  const hasPanel = panel !== 'none'

  return (
    <div className="absolute inset-0 z-10 flex flex-col text-white">
      {/* Top bar */}
      <div
        className={clsx(
          'electron-drag flex h-[--header-height] shrink-0 items-center justify-between pl-4 pt-1',
          isLinux && 'pr-[118px]',
          isWindows && 'pr-[146px]',
          !isLinux && !isWindows && 'pr-4',
        )}
      >
        <TopButton label={t('clearplay.close')} onClick={onClose}>
          <ChevronDown className="size-5" strokeWidth={1.75} />
        </TopButton>
        <div className="glass-chip electron-no-drag flex items-center gap-0.5 rounded-full p-0.5">
          <TopButton
            label={t('fullscreen.lyrics')}
            active={panel === 'lyrics'}
            onClick={() => toggle('lyrics')}
          >
            <MicVocal className="size-[17px]" strokeWidth={1.75} />
          </TopButton>
          <TopButton
            label={t('fullscreen.queue')}
            active={panel === 'queue'}
            onClick={() => toggle('queue')}
            testId="fs-queue-toggle"
          >
            <ListMusic className="size-[17px]" strokeWidth={1.75} />
          </TopButton>
        </div>
      </div>

      {/* Body */}
      <div
        className={clsx(
          'grid min-h-0 flex-1 items-center gap-12 px-12 2xl:gap-20 2xl:px-20',
          'pb-10',
          hasPanel
            ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'
            : 'grid-cols-1',
        )}
      >
        {/* Player column */}
        <div className="mx-auto flex w-full max-w-[min(540px,45vh)] flex-col gap-5">
          <div className="aspect-square w-full overflow-hidden rounded-[24px] bg-white/5 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)] ring-1 ring-white/10">
            <ImageLoader id={song.coverArt} type="song" size={800}>
              {(src) => (
                <img
                  key={song.id}
                  src={src}
                  alt={`${song.artist} - ${song.title}`}
                  className="h-full w-full object-cover animate-in fade-in duration-700"
                />
              )}
            </ImageLoader>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-3xl font-bold tracking-tight 2xl:text-4xl">
                {song.title}
              </h2>
              <p className="mt-1.5 truncate text-[17px] text-white/65">
                {song.artist}
                {song.album ? ` · ${song.album}` : ''}
              </p>
            </div>
            {!hideFavorites && <LikeButton />}
          </div>

          <FullscreenProgress />

          <div className="flex items-center justify-center gap-3">
            <FullscreenControls />
          </div>

          <div className="mx-auto w-full max-w-[340px]">
            <VolumeContainer />
          </div>
        </div>

        {/* Lyrics / queue column */}
        {hasPanel && (
          <div className="h-full min-h-0 py-4">
            {panel === 'lyrics' ? <MemoLyrics /> : <MemoQueue />}
          </div>
        )}
      </div>
    </div>
  )
}
