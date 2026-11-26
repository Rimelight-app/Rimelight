import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ComponentPropsWithoutRef, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ScrollArea,
  scrollAreaViewportSelector,
} from '@/app/components/ui/scroll-area'
import { subsonic } from '@/service/subsonic'
import { useLang } from '@/store/lang.store'
import { usePlayerRef, usePlayerSonglist } from '@/store/player.store'
import { useRimelightSettings } from '@/store/rimelight-settings.store'
import { ILyric } from '@/types/responses/song'
import { queryKeys } from '@/utils/queryKeys'
import { SmoothLyrics } from './smooth-lyrics'

// disambiguates chinese language code to the user's locale if set
function resolveLyricsLang(
  lyricsLang: string | undefined,
  appLocale: string,
): string | undefined {
  if (!lyricsLang || lyricsLang !== 'zh') return lyricsLang
  if (appLocale === 'yue-Hant') return 'zh-Hant'
  return 'zh-Hans'
}

interface LyricProps {
  lyrics: ILyric
  compact?: boolean
}

/** compact: smaller type for the side panel. */
export function LyricsTab({ compact = false }: { compact?: boolean }) {
  const { currentSong } = usePlayerSonglist()
  const { t } = useTranslation()

  const { id, artist, title, duration } = currentSong

  const { data: lyrics, isLoading } = useQuery({
    queryKey: [queryKeys.song.lyrics, artist, title, duration],
    queryFn: () =>
      subsonic.lyrics.getLyrics({
        id,
        artist,
        title,
        duration,
      }),
  })

  const noLyricsFound = t('fullscreen.noLyrics')
  const loadingLyrics = t('fullscreen.loadingLyrics')

  if (isLoading) {
    return <CenteredMessage>{loadingLyrics}</CenteredMessage>
  } else if (lyrics && lyrics.value) {
    return areLyricsSynced(lyrics) ? (
      <SyncedLyrics lyrics={lyrics} compact={compact} />
    ) : (
      <UnsyncedLyrics lyrics={lyrics} compact={compact} />
    )
  } else {
    return <CenteredMessage>{noLyricsFound}</CenteredMessage>
  }
}

const LYRICS_SIZES = {
  s: 'text-[26px] leading-tight 2xl:text-[32px]',
  m: 'text-[32px] leading-tight 2xl:text-[40px]',
  l: 'text-[38px] leading-tight 2xl:text-[48px]',
}

function SyncedLyrics({ lyrics, compact }: LyricProps) {
  const lyricsSize = useRimelightSettings((s) => s.lyricsSize)
  const playerRef = usePlayerRef()
  const { langCode } = useLang()
  const resolvedLang = resolveLyricsLang(lyrics.lang, langCode)

  const getTime = useCallback(() => playerRef?.currentTime ?? 0, [playerRef])
  const onSeek = useCallback(
    (ms: number) => {
      if (playerRef) playerRef.currentTime = ms / 1000
    },
    [playerRef],
  )

  return (
    <SmoothLyrics
      lrc={lyrics.value ?? ''}
      getTime={getTime}
      onSeek={onSeek}
      lang={resolvedLang}
      compact={compact}
      sizeClass={
        compact ? 'text-[20px] leading-snug' : LYRICS_SIZES[lyricsSize]
      }
    />
  )
}

function UnsyncedLyrics({ lyrics, compact }: LyricProps) {
  const { currentSong } = usePlayerSonglist()
  const { langCode } = useLang()
  const lyricsBoxRef = useRef<HTMLDivElement>(null)
  const resolvedLang = resolveLyricsLang(lyrics.lang, langCode)

  const lines = lyrics.value!.split('\n')

  // biome-ignore lint/correctness/useExhaustiveDependencies: recomputed when song changes
  useEffect(() => {
    if (lyricsBoxRef.current) {
      const scrollArea = lyricsBoxRef.current.querySelector(
        scrollAreaViewportSelector,
      ) as HTMLDivElement

      scrollArea.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    }
  }, [currentSong])

  return (
    <ScrollArea
      type="always"
      className={clsx(
        'w-full h-full overflow-y-auto text-left font-semibold px-2 scroll-smooth maskImage-unsynced-lyrics text-white/80 cp-lyrics',
        compact ? 'text-base' : 'text-xl 2xl:text-2xl',
      )}
      thumbClassName="secondary-thumb-bar"
      ref={lyricsBoxRef}
    >
      {lines.map((line, index) => (
        <p
          key={index}
          className={clsx(
            'leading-10 text-shadow-lg text-balance',
            index === 0 && 'mt-4',
            index === lines.length - 1 && 'mb-16',
          )}
          lang={resolvedLang}
        >
          {line}
        </p>
      ))}
    </ScrollArea>
  )
}

type CenteredMessageProps = ComponentPropsWithoutRef<'p'>

function CenteredMessage({ children }: CenteredMessageProps) {
  return (
    <div className="w-full h-full flex justify-center items-center">
      <p className="leading-10 text-center font-medium text-lg text-white/50">
        {children}
      </p>
    </div>
  )
}

function areLyricsSynced(lyrics: ILyric) {
  // Most LRC files start with the string "[00:" or "[01:" indicating synced lyrics
  const lyric = lyrics.value?.trim() ?? ''
  return (
    lyric.startsWith('[00:') ||
    lyric.startsWith('[01:') ||
    lyric.startsWith('[02:')
  )
}
