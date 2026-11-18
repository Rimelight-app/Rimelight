import { Pause, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LazyLoadImage } from 'react-lazy-load-image-component'
import { Link } from 'react-router-dom'
import { EqualizerBars } from '@/app/components/icons/equalizer-bars'
import { ImageLoader } from '@/app/components/image-loader'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { ROUTES } from '@/routes/routesList'
import { subsonic } from '@/service/subsonic'
import { useIsAlbumPlaying, usePlayerActions } from '@/store/player.store'
import { ISong } from '@/types/responses/song'
import { convertSecondsToTime } from '@/utils/convertSecondsToTime'

export function HeaderItem({ song }: { song: ISong }) {
  const { t } = useTranslation()
  const { setSongList, togglePlayPause } = usePlayerActions()
  const { isAlbumActive, isAlbumPlaying } = useIsAlbumPlaying(song.albumId)

  async function handlePlaySongAlbum() {
    const album = await subsonic.albums.getOne(song.albumId)

    if (!album) return

    const songIndex = album.song.findIndex((item) => item.id === song.id)

    setSongList(album.song, songIndex, false, {
      id: album.id,
      name: album.name,
      type: 'album',
    })
  }

  function handlePlayButton() {
    if (isAlbumActive) {
      togglePlayPause()
    } else {
      handlePlaySongAlbum()
    }
  }

  const dataTestId = isAlbumPlaying
    ? 'header-pause-button'
    : 'header-play-button'

  return (
    <div className="w-full h-[212px] 2xl:h-[252px] relative">
      <ImageLoader id={song.coverArt} type="song" size={400}>
        {(src) => (
          <>
            <div className="w-full h-full absolute z-10">
              <div className="flex h-full p-5 gap-6">
                <div
                  className="h-full aspect-square relative group bg-white/5 rounded-lg shadow-[0_20px_40px_-20px_rgb(0_0_0/0.7)]"
                  data-testid="header-image-container"
                >
                  <LazyLoadImage
                    src={src}
                    alt={song.title}
                    effect="opacity"
                    width="100%"
                    height="100%"
                    className="aspect-square rounded-lg object-cover bg-center absolute inset-0 z-0"
                    data-testid="header-image"
                  />
                  <div className="w-full h-full flex items-center justify-center rounded-lg bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-colors duration-300 absolute inset-0 z-10">
                    <Button
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full size-12 bg-white/90 text-[#121216] hover:bg-white"
                      variant="default"
                      onClick={handlePlayButton}
                      data-testid={dataTestId}
                    >
                      {isAlbumPlaying ? (
                        <Pause className="size-4 fill-current" />
                      ) : (
                        <Play className="size-4 fill-current" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-1 h-full flex-col justify-end gap-1 pb-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50 mb-1">
                    {t('clearplay.featured')}
                  </p>
                  <div className="flex items-center gap-2">
                    {isAlbumPlaying && (
                      <EqualizerBars
                        size={24}
                        className="text-foreground mb-1"
                      />
                    )}
                    <Link
                      to={ROUTES.ALBUM.PAGE(song.albumId)}
                      className="w-fit"
                    >
                      <h1
                        data-testid="header-title"
                        className="w-full text-3xl 2xl:text-4xl font-bold tracking-tight text-white"
                      >
                        {song.title}
                      </h1>
                    </Link>
                  </div>
                  {!song.artistId ? (
                    <h4
                      data-testid="header-artist"
                      className="text-[15px] font-medium text-white/70"
                    >
                      {song.artist}
                    </h4>
                  ) : (
                    <Link
                      to={ROUTES.ARTIST.PAGE(song.artistId)}
                      className="w-fit"
                    >
                      <h4
                        data-testid="header-artist"
                        className="text-[15px] font-medium text-white/70 transition-colors hover:text-white"
                      >
                        {song.artist}
                      </h4>
                    </Link>
                  )}
                  <div className="flex gap-1.5 mt-2">
                    {song.genre !== undefined && (
                      <Link
                        to={ROUTES.ALBUMS.GENRE(song.genre)}
                        className="flex"
                      >
                        <Badge
                          variant="neutral"
                          className="glass-chip h-6 rounded-md border-0 px-2 text-[12px] font-medium text-white/75"
                          data-testid="header-genre"
                        >
                          {song.genre}
                        </Badge>
                      </Link>
                    )}
                    {song.year && (
                      <Badge
                        variant="neutral"
                        className="glass-chip h-6 rounded-md border-0 px-2 text-[12px] font-medium text-white/75"
                        data-testid="header-year"
                      >
                        {song.year}
                      </Badge>
                    )}
                    <Badge
                      variant="neutral"
                      className="glass-chip h-6 rounded-md border-0 px-2 text-[12px] font-medium text-white/75"
                      data-testid="header-duration"
                    >
                      {convertSecondsToTime(song.duration)}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </ImageLoader>
    </div>
  )
}
