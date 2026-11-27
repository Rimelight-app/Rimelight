import clsx from 'clsx'
import { useState } from 'react'
import { AnimatedCoverVideo } from '@/app/components/album/animated-cover-video'
import {
  AlbumArtistInfo,
  AlbumMultipleArtistsInfo,
} from '@/app/components/album/artists'
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
  animatedArtworkArtists?: string[]
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
  animatedArtworkArtists,
  animatedArtworkAlbum,
  badges,
  isPlaylist = false,
}: ImageHeaderProps) {
  const [open, setOpen] = useState(false)
  const hasMultipleArtists = artists ? artists.length > 1 : false

  return (
    <div
      id="image-header-container"
      className="relative w-full px-8 pt-8 pb-5"
      key={`header-${coverArtId}`}
    >
      <div className="flex items-end gap-7">
        <div
          className={clsx(
            'relative shrink-0 overflow-hidden rounded-[20px] bg-white/5',
            'size-[200px] 2xl:size-[232px]',
            'shadow-[0_28px_60px_-24px_rgb(0_0_0/0.75)] ring-1 ring-white/10',
            'transition-transform duration-300 ease-out hover:scale-[1.015]',
          )}
        >
          {/*
            The 300 px cover is usually already cached (album cards use it),
            so it shows at once; the sharp 700 px cover fades in over it.
            Nothing covers the header while it loads, so there is no flash.
          */}
          <ImageLoader id={coverArtId} type={coverArtType} size={300}>
            {(previewSrc) => (
              <HeaderCover
                src={previewSrc}
                alt=""
                className="absolute inset-0"
              />
            )}
          </ImageLoader>
          <ImageLoader id={coverArtId} type={coverArtType} size={coverArtSize}>
            {(src) => (
              <>
                <HeaderCover
                  id="cover-art-image"
                  src={src}
                  alt={coverArtAlt}
                  className="relative cursor-pointer"
                  onClick={() => setOpen(true)}
                />
                <CustomLightBox
                  open={open}
                  close={setOpen}
                  src={src ?? ''}
                  alt={coverArtAlt}
                />
              </>
            )}
          </ImageLoader>
          <AnimatedCoverVideo
            artists={animatedArtworkArtists ?? []}
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
    </div>
  )
}

interface HeaderCoverProps {
  id?: string
  src?: string
  alt: string
  className?: string
  onClick?: () => void
}

/** Cover image that stays invisible until decoded, then fades in. */
function HeaderCover({ id, src, alt, className, onClick }: HeaderCoverProps) {
  const [loadedSrc, setLoadedSrc] = useState<string>()
  const loaded = loadedSrc === src

  if (!src) return null

  return (
    <img
      id={id}
      src={src}
      alt={alt}
      crossOrigin="anonymous"
      decoding="async"
      draggable={false}
      onLoad={() => setLoadedSrc(src)}
      onClick={onClick}
      className={clsx(
        'aspect-square h-full w-full object-cover transition-opacity duration-200 ease-out motion-reduce:transition-none',
        loaded ? 'opacity-100' : 'opacity-0',
        className,
      )}
    />
  )
}
