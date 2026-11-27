import clsx from 'clsx'
import { ChevronDown, ListMusic, MicVocal } from 'lucide-react'
import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { songArtworkArtists } from '@/api/artworkArtists'
import { AnimatedCoverVideo } from '@/app/components/album/animated-cover-video'
import { ImageLoader } from '@/app/components/image-loader'
import { SongRating } from '@/app/components/rating/song-rating'
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
  // Keep the player mounted while the sheet slides down, so closing does not
  // show an empty gradient. Unmounted once the close animation is over.
  const [showContent, setShowContent] = useState(isFullscreen)
  // True once the sheet has finished sliding in. Its glass blur is then
  // switched off (themes.css): the opaque backdrop covers it completely, yet
  // the compositor redrew it for every backdrop frame. While the sheet moves,
  // its anti-aliased top edge lets the blurred page through, so the blur
  // stays on for the open and close animations and nothing looks different.
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (isFullscreen) {
      setShowContent(true)
      return
    }
    setSettled(false)
    const timer = window.setTimeout(() => setShowContent(false), 700)
    return () => window.clearTimeout(timer)
  }, [isFullscreen])

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
        onAnimationEnd={(event) => {
          handleDrawerAnimationEnd(event)
          if (event.target === event.currentTarget) {
            setSettled(event.currentTarget.dataset.state === 'open')
          }
        }}
        data-cp-settled={settled && isFullscreen ? '' : undefined}
        className="cp-fullscreen-drawer h-screen w-screen rounded-t-none border-none select-none cursor-default mt-0 bg-transparent"
        showHandle={false}
        aria-describedby={undefined}
      >
        <MemoBackdrop />
        <FullscreenDragHandler />
        {showContent && <NowPlaying onClose={() => setIsFullscreen(false)} />}
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
        <TopButton label={t('rimelight.close')} onClick={onClose}>
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
          <div
            className="relative aspect-square w-full overflow-hidden rounded-[24px] bg-white/5 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)] ring-1 ring-white/10"
            data-testid="fullscreen-cover"
          >
            <ImageLoader id={song.coverArt} type="song" size={800}>
              {(src) => (
                <img
                  key={song.id}
                  src={src}
                  alt={`${song.artist} - ${song.title}`}
                  className="h-full w-full object-cover animate-in fade-in duration-300"
                />
              )}
            </ImageLoader>
            {/* Live cover over the static one once it has a frame; the same
                shared player as the album page and player bar. */}
            <AnimatedCoverVideo
              artists={songArtworkArtists(song)}
              album={song.album}
              screen="fullscreen"
            />
          </div>

          <div>
            <div className="flex items-start justify-between gap-4">
              <h2 className="min-w-0 flex-1 truncate text-3xl font-bold tracking-tight 2xl:text-4xl">
                {song.title}
              </h2>
              {!hideFavorites && <LikeButton />}
            </div>
            {/* Full width under the title and heart: the stars end at the
                cover's right edge and leave the rest to artist and album. */}
            <div className="cp-fs-title mt-1.5 flex min-w-0 items-center gap-3">
              <p className="min-w-0 truncate text-[17px] text-white/65">
                {song.artist}
                {song.album ? ` · ${song.album}` : ''}
              </p>
              <SongRating
                song={song}
                size="md"
                className="cp-fs-stars ml-auto shrink-0"
              />
            </div>
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
