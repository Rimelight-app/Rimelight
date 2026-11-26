import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Play, Search as SearchIcon, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { useDebounce } from 'use-debounce'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { EqualizerBars } from '@/app/components/icons/equalizer-bars'
import { SongMenuOptions } from '@/app/components/song/menu-options'
import { ContextMenuProvider } from '@/app/components/table/context-menu'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/routesList'
import { search } from '@/service/search'
import {
  usePlayerActions,
  usePlayerCurrentSong,
  usePlayerIsPlaying,
} from '@/store/player.store'
import { ISong } from '@/types/responses/song'
import { convertSecondsToTime } from '@/utils/convertSecondsToTime'

const SONGS = 60
const ALBUMS = 18
const ARTISTS = 12

function SongRow({
  song,
  index,
  onPlay,
}: {
  song: ISong
  index: number
  onPlay: () => void
}) {
  const current = usePlayerCurrentSong()
  const isPlaying = usePlayerIsPlaying()
  const active = current?.id === song.id
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <ContextMenuProvider
      onOpenChange={setMenuOpen}
      options={<SongMenuOptions variant="context" song={song} index={index} />}
    >
      <button
        type="button"
        onDoubleClick={onPlay}
        onKeyDown={(e) => e.key === 'Enter' && onPlay()}
        className={cn(
          'group flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]',
          active && 'bg-white/[0.08]',
          menuOpen && 'bg-white/[0.06]',
        )}
      >
        <span className="relative size-10 shrink-0 overflow-hidden rounded-[10px] bg-white/5">
          <img
            src={getSimpleCoverArtUrl(song.coverArt, 'song', '100')}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
          <span
            onClick={(e) => {
              e.stopPropagation()
              onPlay()
            }}
            className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Play className="size-4 fill-white text-white" />
          </span>
          {active && isPlaying && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 group-hover:opacity-0">
              <EqualizerBars size={16} className="text-white" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">
            {song.title}
          </span>
          <span className="block truncate text-[12px] text-white/50">
            {song.artist} · {song.album}
          </span>
        </span>
        <span className="text-[12px] tabular-nums text-white/45">
          {convertSecondsToTime(song.duration)}
        </span>
        <span className="sr-only">{index}</span>
      </button>
    </ContextMenuProvider>
  )
}

export default function SearchPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const [value, setValue] = useState(params.get('q') ?? '')
  const [query] = useDebounce(value.trim(), 200)
  const inputRef = useRef<HTMLInputElement>(null)
  const { setSongList } = usePlayerActions()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setParams(query ? { q: query } : {}, { replace: true })
  }, [query, setParams])

  const { data, isFetching } = useQuery({
    queryKey: ['rimelight-search', query],
    queryFn: () =>
      search.get({
        query,
        songCount: SONGS,
        albumCount: ALBUMS,
        artistCount: ARTISTS,
      }),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })

  const songs = query ? (data?.song ?? []) : []
  const albums = query ? (data?.album ?? []) : []
  const artists = query ? (data?.artist ?? []) : []
  const nothing =
    query && !isFetching && !songs.length && !albums.length && !artists.length

  const playFrom = (index: number) => setSongList(songs, index)

  return (
    <div className="w-full px-8 pb-8 pt-6">
      <div className="glass-panel flex h-14 items-center gap-3 rounded-full px-5">
        <SearchIcon
          className={cn('size-5 text-white/60', isFetching && 'animate-pulse')}
        />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('rimelight.search.placeholder')}
          spellCheck={false}
          autoCorrect="off"
          className="h-full flex-1 bg-transparent text-[16px] outline-none placeholder:text-white/40"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              setValue('')
              inputRef.current?.focus()
            }}
            className="flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
            aria-label={t('rimelight.close')}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {!query && (
        <p className="mt-16 text-center text-sm text-white/45">
          {t('rimelight.search.hint')}
        </p>
      )}
      {nothing && (
        <p className="mt-16 text-center text-sm text-white/45">
          {t('rimelight.search.none', { query })}
        </p>
      )}

      {artists.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-semibold tracking-tight">
            {t('sidebar.artists')}
          </h2>
          <div className="flex gap-5 overflow-x-auto pb-2">
            {artists.map((a) => (
              <Link
                key={a.id}
                to={ROUTES.ARTIST.PAGE(a.id)}
                className="group w-28 shrink-0 text-center"
              >
                <img
                  src={getSimpleCoverArtUrl(
                    a.coverArt ?? a.id,
                    'artist',
                    '200',
                  )}
                  alt=""
                  loading="lazy"
                  className="size-28 rounded-full object-cover ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <p className="mt-2 truncate text-[13px] font-medium">
                  {a.name}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {songs.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-xl font-semibold tracking-tight">
              {t('sidebar.songs')}
              <span className="ml-2 text-[13px] font-normal text-white/45">
                {songs.length}
                {songs.length === SONGS ? '+' : ''}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => playFrom(0)}
              className="inline-flex h-8 items-center gap-2 rounded-full bg-white/90 px-4 text-[13px] font-semibold text-[#121216] hover:bg-white"
            >
              <Play className="size-3.5 fill-current" />
              {t('rimelight.playAll')}
            </button>
          </div>
          <div className="glass-panel grid gap-x-4 rounded-[20px] p-2 xl:grid-cols-2">
            {songs.map((song, i) => (
              <SongRow
                key={song.id}
                song={song}
                index={i}
                onPlay={() => playFrom(i)}
              />
            ))}
          </div>
        </section>
      )}

      {albums.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-semibold tracking-tight">
            {t('sidebar.albums')}
          </h2>
          <div className="grid grid-cols-3 gap-5 lg:grid-cols-4 xl:grid-cols-6">
            {albums.map((album) => (
              <Link
                key={album.id}
                to={ROUTES.ALBUM.PAGE(album.id)}
                className="group min-w-0"
              >
                <img
                  src={getSimpleCoverArtUrl(album.coverArt, 'album', '300')}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full rounded-2xl object-cover shadow-[0_16px_36px_-18px_rgb(0_0_0/0.7)] ring-1 ring-white/[0.06] transition-transform duration-300 group-hover:-translate-y-0.5"
                />
                <p className="mt-2 truncate text-[13px] font-medium">
                  {album.name}
                </p>
                <p className="truncate text-[12px] text-white/50">
                  {album.artist}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
