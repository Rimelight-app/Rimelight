import { useQuery } from '@tanstack/react-query'
import {
  ExternalLink,
  Headphones,
  Heart,
  Maximize2,
  MicVocal,
  Radio,
} from 'lucide-react'
import { ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { EqualizerBars } from '@/app/components/icons/equalizer-bars'
import { useGetAlbum, useGetArtistAlbums } from '@/app/hooks/use-album'
import { useGetArtistInfo } from '@/app/hooks/use-artist'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/routesList'
import { stats } from '@/service/stats'
import {
  useLyricsState,
  usePlayerActions,
  usePlayerCurrentSong,
  usePlayerFullscreen,
  usePlayerIsPlaying,
  usePlayerSongStarred,
} from '@/store/player.store'
import { getAudioQuality } from '@/utils/audioQuality'
import {
  convertSecondsToHumanRead,
  convertSecondsToTime,
} from '@/utils/convertSecondsToTime'

const chip =
  'glass-chip inline-flex h-7 items-center rounded-full px-3 text-[12px] font-medium text-white/80'

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('glass-panel rounded-[20px] p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-[12px] text-white/55 transition-colors hover:text-white"
    >
      {children}
      <ExternalLink className="size-3" />
    </Link>
  )
}

const stripHtml = (html?: string) =>
  (html ?? '')
    .replace(/<a [^>]*>.*?<\/a>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

function timeAgo(
  iso: string | undefined,
  t: (k: string, o?: object) => string,
) {
  if (!iso) return null
  const days = (Date.now() - Date.parse(iso)) / 86_400_000
  if (Number.isNaN(days)) return null
  if (days < 1) return t('clearplay.np.today')
  if (days < 30) return t('clearplay.np.daysAgo', { count: Math.floor(days) })
  if (days < 365)
    return t('clearplay.np.monthsAgo', { count: Math.floor(days / 30) })
  return t('clearplay.np.yearsAgo', { count: Math.floor(days / 365) })
}

function Hero() {
  const { t } = useTranslation()
  const song = usePlayerCurrentSong()
  const starred = usePlayerSongStarred()
  const { starCurrentSong } = usePlayerActions()
  const { toggleLyricsAction } = useLyricsState()
  const { setIsFullscreen } = usePlayerFullscreen()
  const q = getAudioQuality(song)
  const artists = song.artists?.length
    ? song.artists
    : [{ id: song.artistId ?? '', name: song.artist }]
  const added = timeAgo(song.created, t)

  const iconBtn =
    'glass-chip flex size-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/[0.14] hover:text-white'

  return (
    <section className="glass-panel flex gap-7 rounded-[24px] p-6">
      <button
        type="button"
        onClick={() => setIsFullscreen(true)}
        className="group relative size-[220px] shrink-0 overflow-hidden rounded-[20px] shadow-[0_28px_60px_-24px_rgb(0_0_0/0.75)] ring-1 ring-white/10 2xl:size-[260px]"
      >
        <img
          key={song.id}
          src={getSimpleCoverArtUrl(song.coverArt, 'song', '500')}
          alt=""
          className="size-full object-cover animate-in fade-in duration-500"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
          <Maximize2 className="size-6" />
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
          {t('clearplay.np.kicker')}
        </p>
        <h1 className="truncate text-4xl font-bold tracking-tight 2xl:text-5xl">
          {song.title}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 text-[15px] text-white/70">
          {artists.map((a, i) => (
            <span key={`${a.id}-${a.name}`}>
              {a.id ? (
                <Link
                  to={ROUTES.ARTIST.PAGE(a.id)}
                  className="hover:text-white"
                >
                  {a.name}
                </Link>
              ) : (
                a.name
              )}
              {i < artists.length - 1 && ','}
            </span>
          ))}
          <span className="text-white/35">·</span>
          <Link
            to={ROUTES.ALBUM.PAGE(song.albumId)}
            className="hover:text-white"
          >
            {song.album}
          </Link>
          {song.year ? (
            <>
              <span className="text-white/35">·</span>
              <span>{song.year}</span>
            </>
          ) : null}
          {added && (
            <span className="italic text-white/45">
              · {t('clearplay.np.added', { when: added })}
            </span>
          )}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {song.genre && (
            <Link
              to={ROUTES.ALBUMS.GENRE(song.genre)}
              className={cn(chip, 'hover:text-white')}
            >
              {song.genre}
            </Link>
          )}
          <span className={cn(chip, q.hiRes && 'bg-white/90 text-[#121216]')}>
            {q.hiRes ? `${q.format} · HI-RES` : q.format}
          </span>
          {q.details.map((d) => (
            <span key={d} className={chip}>
              {d}
            </span>
          ))}
          <span className={chip}>{convertSecondsToTime(song.duration)}</span>
          {song.bpm > 0 && <span className={chip}>{song.bpm} BPM</span>}
        </div>

        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={starCurrentSong}
            className={iconBtn}
            aria-label={t('clearplay.np.like')}
          >
            <Heart
              className={cn(
                'size-[18px]',
                starred && 'fill-rose-400 text-rose-400',
              )}
            />
          </button>
          <button
            type="button"
            onClick={toggleLyricsAction}
            className={iconBtn}
            aria-label={t('fullscreen.lyrics')}
          >
            <MicVocal className="size-[18px]" />
          </button>
          <span className="ml-2 inline-flex items-center gap-1.5 text-[13px] text-white/55">
            <Headphones className="size-4" />
            {t('clearplay.stats.playsCount', {
              count: song.playCount ?? 0,
              n: song.playCount ?? 0,
            })}
          </span>
        </div>
      </div>
    </section>
  )
}

function FromThisAlbum() {
  const { t } = useTranslation()
  const song = usePlayerCurrentSong()
  const isPlaying = usePlayerIsPlaying()
  const { setSongList } = usePlayerActions()
  const { data: album } = useGetAlbum(song.albumId)
  if (!album) return null
  const index = album.song.findIndex((s) => s.id === song.id)

  return (
    <Panel
      title={t('clearplay.np.fromAlbum')}
      action={
        <PanelLink to={ROUTES.ALBUM.PAGE(album.id)}>
          {t('clearplay.np.viewAlbum')}
        </PanelLink>
      }
    >
      <p className="mb-3 text-[13px] text-white/60">
        <span className="font-semibold text-white">{album.name}</span>
        {album.year ? ` · ${album.year}` : ''}
        {index >= 0 &&
          ` · ${t('clearplay.np.trackOf', { n: index + 1, total: album.song.length })}`}
        {album.duration
          ? ` · ${convertSecondsToHumanRead(album.duration)}`
          : ''}
      </p>
      <ol className="max-h-[360px] space-y-0.5 overflow-y-auto pr-1">
        {album.song.map((s, i) => {
          const active = s.id === song.id
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() =>
                  setSongList(album.song, i, false, {
                    id: album.id,
                    name: album.name,
                    type: 'album',
                  })
                }
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/[0.06]',
                  active && 'bg-white/[0.1]',
                )}
              >
                <span className="flex w-5 justify-end text-white/45 tabular-nums">
                  {active && isPlaying ? (
                    <EqualizerBars size={14} className="text-white" />
                  ) : (
                    (s.track ?? i + 1)
                  )}
                </span>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate',
                    active ? 'font-semibold text-white' : 'text-white/85',
                  )}
                >
                  {s.title}
                </span>
                <span className="tabular-nums text-white/45">
                  {convertSecondsToTime(s.duration)}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}

function AboutArtist() {
  const { t } = useTranslation()
  const song = usePlayerCurrentSong()
  const artists = useMemo(
    () =>
      song.artists?.length
        ? song.artists.filter((a) => a.id)
        : song.artistId
          ? [{ id: song.artistId, name: song.artist }]
          : [],
    [song],
  )
  const [selected, setSelected] = useState(0)
  const artist = artists[Math.min(selected, artists.length - 1)]
  const { data: info } = useGetArtistInfo(artist?.id ?? '')
  const { data: full } = useGetArtistAlbums(artist?.id ?? '')
  const [expanded, setExpanded] = useState(false)
  if (!artist) return null

  const bio = stripHtml(info?.biography)
  const albums = [...(full?.album ?? [])].sort(
    (a, b) => (b.year ?? 0) - (a.year ?? 0),
  )

  return (
    <div className="space-y-4">
      <Panel
        title={t('clearplay.np.aboutArtist')}
        action={
          <PanelLink to={ROUTES.ARTIST.PAGE(artist.id)}>
            {t('clearplay.np.goToArtist')}
          </PanelLink>
        }
      >
        {artists.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {artists.map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setSelected(i)
                  setExpanded(false)
                }}
                className={cn(
                  chip,
                  'transition-colors',
                  i === selected
                    ? 'bg-white/[0.2] text-white'
                    : 'hover:text-white',
                )}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-4">
          <img
            src={
              info?.largeImageUrl ||
              getSimpleCoverArtUrl(artist.id, 'artist', '300')
            }
            alt=""
            className="size-28 shrink-0 rounded-2xl object-cover ring-1 ring-white/10"
          />
          <div className="min-w-0">
            <p className="text-lg font-semibold">{artist.name}</p>
            {bio ? (
              <>
                <p
                  className={cn(
                    'mt-1 text-[13px] leading-relaxed text-white/65',
                    !expanded && 'line-clamp-4',
                  )}
                >
                  {bio}
                </p>
                {bio.length > 260 && (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-1 text-[12px] text-white/55 hover:text-white"
                  >
                    {expanded ? t('clearplay.np.less') : t('clearplay.np.more')}
                  </button>
                )}
              </>
            ) : (
              <p className="mt-1 text-[13px] text-white/45">
                {t('clearplay.np.noBio')}
              </p>
            )}
          </div>
        </div>
        {info?.similarArtist && info.similarArtist.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[12px] text-white/45">
              {t('clearplay.np.similar')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {info.similarArtist.slice(0, 10).map((s) =>
                s.id ? (
                  <Link
                    key={s.id}
                    to={ROUTES.ARTIST.PAGE(s.id)}
                    className={cn(chip, 'hover:text-white')}
                  >
                    {s.name}
                  </Link>
                ) : (
                  <span key={s.name} className={cn(chip, 'text-white/50')}>
                    {s.name}
                  </span>
                ),
              )}
            </div>
          </div>
        )}
      </Panel>

      {albums.length > 0 && (
        <Panel
          title={t('clearplay.np.discography')}
          action={
            <PanelLink to={ROUTES.ARTIST.PAGE(artist.id)}>
              {t('clearplay.np.goToArtist')}
            </PanelLink>
          }
        >
          <div className="flex gap-3 overflow-x-auto pb-1">
            {albums.map((a) => (
              <Link
                key={a.id}
                to={ROUTES.ALBUM.PAGE(a.id)}
                className="group w-24 shrink-0"
                title={a.name}
              >
                <img
                  src={getSimpleCoverArtUrl(a.coverArt, 'album', '200')}
                  alt=""
                  loading="lazy"
                  className={cn(
                    'size-24 rounded-xl object-cover ring-1 ring-white/10 transition-transform duration-300 group-hover:-translate-y-0.5',
                    a.id === song.albumId && 'ring-2 ring-white/80',
                  )}
                />
                <p className="mt-1.5 truncate text-[12px] text-white/75">
                  {a.name}
                </p>
                {a.year ? (
                  <p className="text-[11px] text-white/40">{a.year}</p>
                ) : null}
              </Link>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

function ServerListeners() {
  const { t } = useTranslation()
  const { data } = useQuery({
    queryKey: ['clearplay-now-playing'],
    queryFn: stats.getNowPlaying,
    refetchInterval: 15_000,
  })

  return (
    <Panel title={t('clearplay.nowPlaying.kicker')}>
      {!data || data.length === 0 ? (
        <p className="flex items-center gap-2 text-[13px] text-white/45">
          <Radio className="size-4" />
          {t('clearplay.nowPlaying.empty')}
        </p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {data.map((e) => (
            <li
              key={`${e.username}-${e.playerId ?? ''}-${e.id}`}
              className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5"
            >
              <img
                src={getSimpleCoverArtUrl(e.coverArt, 'song', '100')}
                alt=""
                className="size-11 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{e.title}</p>
                <p className="truncate text-[12px] text-white/50">{e.artist}</p>
              </div>
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white/90 px-2.5 text-[11px] font-semibold text-[#121216]">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {e.username}
              </span>
              <span className="text-[11px] text-white/45">
                {e.playerName}
                {' · '}
                {e.minutesAgo === 0
                  ? t('clearplay.nowPlaying.justNow')
                  : t('clearplay.nowPlaying.minutesAgo', {
                      count: e.minutesAgo,
                    })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Details about the current track, its album and artist, and server activity. */
export default function NowPlayingPage() {
  const { t } = useTranslation()
  const song = usePlayerCurrentSong()
  const hasSong = Boolean(song?.id)

  return (
    <div className="w-full space-y-4 px-8 pb-8 pt-6">
      {hasSong ? (
        <>
          <Hero />
          <div className="grid gap-4 xl:grid-cols-2">
            <FromThisAlbum />
            <AboutArtist />
          </div>
        </>
      ) : (
        <div className="glass-panel flex h-48 flex-col items-center justify-center gap-3 rounded-[24px] text-white/55">
          <Headphones className="size-6" />
          <p className="text-sm">{t('clearplay.np.nothing')}</p>
        </div>
      )}
      <ServerListeners />
    </div>
  )
}
