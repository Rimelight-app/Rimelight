import clsx from 'clsx'
import { useState } from 'react'
import { LazyLoadImage } from 'react-lazy-load-image-component'
import { AnimatedCoverVideo } from '@/app/components/album/animated-cover-video'
import {
  AlbumArtistInfo,
  AlbumMultipleArtistsInfo,
} from '@/app/components/album/artists'
import { AlbumHeaderFallback } from '@/app/components/fallbacks/album-fallbacks'
import { BadgesData, HeaderInfoGenerator } from '@/app/components/header-info'
import { ImageLoader } from '@/app/components/image-loader'
import { CustomLightBox } from '@/app/components/lightbox'
import { CoverArt } from '@/types/coverArtType'
import { IFeaturedArtist } from '@/types/responses/artist'
import { getTextSizeClass } from '@/utils/getTextSizeClass'

interface ImageHeaderProps {
  type: string
  title: string
  subtitle?: string
  artistId?: string
  artists?: IFeaturedArtist[]
  coverArtId?: string
  coverArtType: CoverArt
  coverArtSize: string
  coverArtAlt: string
  animatedArtworkArtist?: string
  animatedArtworkAlbum?: string
  badges: BadgesData
  isPlaylist?: boolean
}

/**
 * Page header for albums, playlists, artists and genres: cover on the left,
 * then a small type label, a large title, artist line and frosted info chips.
 * It sits directly on the window backdrop; no colour block of its own.
 */
export default function ImageHeader({
  type,
  title,
  subtitle,
  artistId,
  artists,
  coverArtId,
  coverArtType,
  coverArtSize,
  coverArtAlt,
  animatedArtworkArtist,
  animatedArtworkAlbum,
  badges,
  isPlaylist = false,
}: ImageHeaderProps) {
  const [open, setOpen] = useState(false)
  const hasMultipleArtists = artists ? artists.length > 1 : false

  return (
    <ImageLoader id={coverArtId} type={coverArtType} size={coverArtSize}>
      {(src, isLoading) => (
        <div
          id="image-header-container"
          className="relative w-full px-8 pt-8 pb-5"
          key={`header-${coverArtId}`}
        >
          {isLoading && (
            <div className="absolute inset-0 z-20">
              <AlbumHeaderFallback />
            </div>
          )}

          <div className="flex items-end gap-7">
            <div
              className={clsx(
                'relative shrink-0 overflow-hidden rounded-[20px] bg-white/5',
                'size-[200px] 2xl:size-[232px]',
                'shadow-[0_28px_60px_-24px_rgb(0_0_0/0.75)] ring-1 ring-white/10',
                'transition-transform duration-300 ease-out hover:scale-[1.015]',
              )}
            >
              <LazyLoadImage
                key={coverArtId}
                effect="opacity"
                crossOrigin="anonymous"
                id="cover-art-image"
                src={src}
                alt={coverArtAlt}
                className="aspect-square h-full w-full cursor-pointer object-cover"
                width="100%"
                height="100%"
                onClick={() => setOpen(true)}
              />
              <AnimatedCoverVideo
                artist={animatedArtworkArtist}
                album={animatedArtworkAlbum}
                screen="album"
              />
            </div>

            <div className="flex min-w-0 flex-col gap-3 pb-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                {type}
              </p>
              <h1
                className={clsx(
                  'max-w-full break-words font-bold leading-[1.05] tracking-tight text-white line-clamp-2',
                  getTextSizeClass(title),
                )}
              >
                {title}
              </h1>

              {!isPlaylist && artists && hasMultipleArtists && (
                <AlbumMultipleArtistsInfo artists={artists} />
              )}
              {!isPlaylist &&
                subtitle &&
                !hasMultipleArtists &&
                (artistId ? (
                  <AlbumArtistInfo id={artistId} name={subtitle} />
                ) : (
                  <p className="text-[15px] font-medium text-white/75">
                    {subtitle}
                  </p>
                ))}
              {isPlaylist && subtitle && (
                <p className="text-sm text-white/65 line-clamp-2">{subtitle}</p>
              )}

              <HeaderInfoGenerator badges={badges} />
            </div>
          </div>

          <CustomLightBox
            open={open}
            close={setOpen}
            src={src ?? ''}
            alt={coverArtAlt}
          />
        </div>
      )}
    </ImageLoader>
  )
}
