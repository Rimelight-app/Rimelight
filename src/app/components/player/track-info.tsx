import randomCSSHexColor from '@chriscodesthings/random-css-hex-color'
import { AudioLines, Maximize2 } from 'lucide-react'
import { useCallback } from 'react'
import { Fragment } from 'react/jsx-runtime'
import { useTranslation } from 'react-i18next'
import { LazyLoadImage } from 'react-lazy-load-image-component'
import { Link } from 'react-router-dom'
import { AnimatedCoverVideo } from '@/app/components/album/animated-cover-video'
import { MarqueeTitle } from '@/app/components/fullscreen/marquee-title'
import { ImageLoader } from '@/app/components/image-loader'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/routesList'
import { useClearPlaySettings } from '@/store/clearplay-settings.store'
import { usePlayerFullscreen, useSongColor } from '@/store/player.store'
import { ISong } from '@/types/responses/song'
import { getAudioQuality } from '@/utils/audioQuality'
import { getAverageColor } from '@/utils/getAverageColor'
import { logger } from '@/utils/logger'
import { ALBUM_ARTISTS_MAX_NUMBER } from '@/utils/multipleArtists'

export function TrackInfo({ song }: { song: ISong | undefined }) {
  const { t } = useTranslation()
  const { setCurrentSongColor, currentSongColor } = useSongColor()
  const { setIsFullscreen } = usePlayerFullscreen()

  const getImageElement = useCallback(() => {
    return document.getElementById('track-song-image') as HTMLImageElement
  }, [])

  const getImageColor = useCallback(async () => {
    const img = getImageElement()
    if (!img) return

    let color = randomCSSHexColor(true)

    try {
      color = (await getAverageColor(img)).hex
      logger.info('[TrackInfo] - Getting Image Average Color', {
        color,
      })
    } catch {
      logger.error('[TrackInfo] - Unable to get image average color.')
    }

    if (color !== currentSongColor) {
      setCurrentSongColor(color)
    }
  }, [currentSongColor, setCurrentSongColor, getImageElement])

  function handleError() {
    const img = getImageElement()
    if (!img) return

    img.crossOrigin = null
  }

  if (!song) {
    return (
      <Fragment>
        <div className="size-[54px] flex justify-center items-center bg-white/[0.06] rounded-[14px] text-white/50">
          <AudioLines data-testid="song-no-playing-icon" />
        </div>
        <div className="flex flex-col justify-center">
          <span
            className="text-sm font-medium"
            data-testid="song-no-playing-label"
          >
            {t('player.noSongPlaying')}
          </span>
        </div>
      </Fragment>
    )
  }

  return (
    <Fragment>
      <button
        type="button"
        className="group relative shrink-0 cursor-pointer rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        onClick={() => setIsFullscreen(true)}
        aria-label={t('clearplay.openNowPlaying')}
        title={t('clearplay.openNowPlaying')}
      >
        <div className="min-w-[54px] max-w-[54px] aspect-square bg-cover bg-center bg-white/5 rounded-[14px] overflow-hidden shadow-[0_8px_20px_-8px_rgb(0_0_0/0.6)] relative">
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all duration-200 group-hover:bg-black/45 group-hover:opacity-100">
            <Maximize2 className="size-4" strokeWidth={2} />
          </div>
          <ImageLoader id={song.coverArt} type="song" size={400}>
            {(src) => (
              <LazyLoadImage
                key={song.id}
                id="track-song-image"
                src={src}
                width="100%"
                height="100%"
                crossOrigin="anonymous"
                effect="opacity"
                className="aspect-square object-cover w-full h-full bg-skeleton text-transparent"
                data-testid="track-image"
                alt={`${song.artist} - ${song.title}`}
                onLoad={getImageColor}
                onError={handleError}
              />
            )}
          </ImageLoader>

          <AnimatedCoverVideo
            artist={song.artist}
            album={song.album}
            screen="playerBar"
          />
        </div>
      </button>
      <div className="flex flex-col justify-center w-full overflow-hidden">
        <MarqueeTitle gap="mr-2">
          <Link to={ROUTES.ALBUM.PAGE(song.albumId)} tabIndex={-1}>
            <span
              className="text-sm font-medium hover:underline cursor-pointer"
              data-testid="track-title"
            >
              {song.title}
            </span>
          </Link>
        </MarqueeTitle>
        <TrackInfoArtistsLinks song={song} />
        <TrackQuality song={song} />
      </div>
    </Fragment>
  )
}

function TrackQuality({ song }: { song: ISong }) {
  const { format, details, lossless, hiRes } = getAudioQuality(song)
  const { showQuality, maxBitRate, streamFormat } = useClearPlaySettings()
  if (!showQuality) return null
  const limit = Number(maxBitRate)
  const converted = limit > 0 && (song.bitRate ?? 0) > limit

  return (
    <div
      className="mt-1 flex items-center gap-1.5 text-[11px] leading-none text-white/50 whitespace-nowrap"
      data-testid="track-quality"
    >
      <span
        className={cn(
          'rounded-full px-1.5 py-[3px] text-[10px] font-semibold tracking-wide',
          hiRes
            ? 'bg-white/90 text-[#121216]'
            : lossless
              ? 'bg-white/[0.16] text-white/90'
              : 'bg-white/[0.08] text-white/70',
        )}
      >
        {hiRes ? `${format} · HI-RES` : format}
      </span>
      <span className="truncate tabular-nums">
        {details.join(' · ')}
        {converted && (
          <span className="text-white/70">
            {' '}
            → {streamFormat.toUpperCase()} {limit} kbps
          </span>
        )}
      </span>
    </div>
  )
}

type TrackInfoArtistsLinksProps = {
  song: ISong
}

function TrackInfoArtistsLinks({ song }: TrackInfoArtistsLinksProps) {
  const { artists, artistId, artist } = song

  if (artists && artists.length > 1) {
    const reducedArtists = artists.slice(0, ALBUM_ARTISTS_MAX_NUMBER)

    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground w-full maskImage-marquee-fade-finished">
        {reducedArtists.map(({ id, name }, index) => (
          <div key={id} className="flex items-center">
            <ArtistLink id={id} name={name} />
            {index < reducedArtists.length - 1 && ','}
          </div>
        ))}
      </div>
    )
  }

  return <ArtistLink id={artistId} name={artist} />
}

type ArtistLinkProps = {
  id?: string
  name: string
}

function ArtistLink({ id, name }: ArtistLinkProps) {
  return (
    <Link
      to={ROUTES.ARTIST.PAGE(id ?? '')}
      className={cn('w-fit inline-flex', !id && 'pointer-events-none')}
      data-testid="track-artist-url"
    >
      <span
        className={cn(
          'text-xs text-muted-foreground text-nowrap',
          id && 'hover:underline hover:text-foreground',
        )}
      >
        {name}
      </span>
    </Link>
  )
}
