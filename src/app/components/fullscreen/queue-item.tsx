import clsx from 'clsx'
import { ComponentPropsWithRef } from 'react'
import { LazyLoadImage } from 'react-lazy-load-image-component'
import { EqualizerBars } from '@/app/components/icons/equalizer-bars'
import { ImageLoader } from '@/app/components/image-loader'
import { ISong } from '@/types/responses/song'
import { convertSecondsToTime } from '@/utils/convertSecondsToTime'
import { ALBUM_ARTISTS_MAX_NUMBER } from '@/utils/multipleArtists'

type QueueItemProps = ComponentPropsWithRef<'div'> & {
  song: ISong
  index: number
  isPlaying: boolean
}

export function QueueItem({
  song,
  isPlaying,
  index,
  style,
  ...props
}: QueueItemProps) {
  return (
    <div
      className={clsx([
        'flex items-center w-[calc(100%-10px)] h-16 text-sm rounded-2xl cursor-pointer',
        'text-white/85 transition-colors duration-200 hover:bg-white/[0.08]',
        'data-[state=active]:bg-white/[0.14] data-[state=active]:text-white data-[state=active]:ring-1 data-[state=active]:ring-white/10',
      ])}
      style={{
        backfaceVisibility: 'visible',
        willChange: 'background-color',
        ...style,
      }}
      {...props}
    >
      <div className="w-[54px] h-full flex items-center justify-center text-center font-medium">
        {isPlaying ? (
          <div className="w-6 flex items-center">
            <div className="w-6 h-6 flex items-center justify-center">
              <EqualizerBars size={20} className="text-white mb-1" />
            </div>
          </div>
        ) : (
          <div className="w-6 h-6 text-center flex justify-center items-center text-shadow-lg">
            <p>{index + 1}</p>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center">
        <div className="w-10 h-10 bg-white/5 rounded-[10px] overflow-hidden mr-3 shrink-0">
          <ImageLoader id={song.coverArt} type="song" size={100}>
            {(src) => (
              <LazyLoadImage
                src={src}
                effect="opacity"
                className="w-10 h-10 rounded-[10px] object-cover text-transparent"
                alt={`${song.title} - ${song.artist}`}
              />
            )}
          </ImageLoader>
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{song.title}</span>
          <QueueArtists song={song} />
        </div>
      </div>
      <div className="w-[84px] shrink-0 text-center text-white/55 tabular-nums">
        {convertSecondsToTime(song.duration)}
      </div>
    </div>
  )
}

function QueueArtists({ song }: { song: ISong }) {
  const { artist, artists } = song

  if (artists && artists.length > 1) {
    const data = artists.slice(0, ALBUM_ARTISTS_MAX_NUMBER)

    return (
      <div className="flex items-center gap-1 font-normal opacity-70">
        {data.map(({ id, name }, index) => (
          <div key={id} className="flex items-center text-sm">
            <p>{name}</p>
            {index < data.length - 1 && ','}
          </div>
        ))}
      </div>
    )
  }

  return <p className="font-normal text-sm opacity-70">{artist}</p>
}
