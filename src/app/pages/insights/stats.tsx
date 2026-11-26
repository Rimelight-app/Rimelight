import { useQuery } from '@tanstack/react-query'
import { Clock, Disc3, Headphones, Library, RefreshCw } from 'lucide-react'
import { ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/routesList'
import { stats as statsService } from '@/service/stats'
import {
  computeStats,
  fmtBytes,
  fmtHours,
  fmtInt,
  Ranked,
} from '@/utils/libraryStats'

function Tile({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode
  label: string
  value: string
  note?: string
}) {
  return (
    <div className="glass-panel rounded-[20px] p-5">
      <div className="flex items-center gap-2 text-[12px] font-medium text-white/55">
        <span className="flex size-7 items-center justify-center rounded-full bg-white/[0.08] text-white/80 [&_svg]:size-[15px]">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums">
        {value}
      </p>
      {note && <p className="mt-1 text-[12px] text-white/50">{note}</p>}
    </div>
  )
}

function Section({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('glass-panel rounded-[20px] p-5', className)}>
      <h2 className="mb-4 text-[15px] font-semibold text-white/90">{title}</h2>
      {children}
    </section>
  )
}

/** Single-series horizontal bars: one hue, values in text, rounded ends. */
function BarList({
  items,
  metric,
  link,
}: {
  items: Ranked[]
  metric: 'plays' | 'seconds'
  link?: (r: Ranked) => string | undefined
}) {
  const { t } = useTranslation()
  if (items.length === 0)
    return <p className="text-sm text-white/45">{t('rimelight.stats.empty')}</p>
  const max = Math.max(...items.map((i) => i[metric]), 1)

  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const value =
          metric === 'plays'
            ? t('rimelight.stats.playsCount', {
                count: item.plays,
                n: fmtInt(item.plays),
              })
            : fmtHours(item.seconds)
        const to = link?.(item)
        const label = (
          <span className="truncate text-[13px] text-white/85">
            {item.label}
          </span>
        )
        return (
          <li
            key={item.key}
            className="group"
            title={`${item.label}: ${value} · ${t('rimelight.stats.playsCount', { count: item.plays, n: fmtInt(item.plays) })}`}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              {to ? (
                <Link to={to} className="min-w-0 truncate hover:text-white">
                  {label}
                </Link>
              ) : (
                label
              )}
              <span className="shrink-0 text-[12px] tabular-nums text-white/55">
                {value}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-white/75 transition-[width] duration-700 ease-out group-hover:bg-white"
                style={{ width: `${Math.max(2, (item[metric] / max) * 100)}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default function StatsPage() {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState(0)

  const { data, isLoading, isFetching, isError, refetch, dataUpdatedAt } =
    useQuery({
      queryKey: ['rimelight-stats'],
      // signal: leaving the page stops the download.
      queryFn: async ({ signal }) =>
        computeStats(await statsService.getAllSongs(setLoaded, signal)),
      staleTime: 10 * 60 * 1000,
      // A retry downloads the whole library again: Refresh does it instead.
      retry: false,
    })

  return (
    <div className="w-full px-8 pb-8 pt-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
            {t('rimelight.stats.kicker')}
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">
            {t('rimelight.stats.title')}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="glass-chip inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] text-white/80 transition-colors hover:bg-white/[0.14] hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
          {t('rimelight.stats.refresh')}
        </button>
      </div>

      {isError && !data && !isFetching ? (
        <div
          data-testid="stats-error"
          className="glass-panel flex h-48 flex-col items-center justify-center gap-2 rounded-[20px] text-white/60"
        >
          <p className="text-sm">{t('rimelight.stats.error')}</p>
        </div>
      ) : isLoading || !data ? (
        <div className="glass-panel flex h-48 flex-col items-center justify-center gap-2 rounded-[20px] text-white/60">
          <RefreshCw className="size-5 animate-spin" />
          <p className="text-sm tabular-nums">
            {t('rimelight.stats.loading', { n: fmtInt(loaded) })}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Tile
              icon={<Clock />}
              label={t('rimelight.stats.hours')}
              value={fmtHours(data.listenSeconds)}
              note={t('rimelight.stats.hoursNote', {
                days: (data.listenSeconds / 86400).toFixed(1),
              })}
            />
            <Tile
              icon={<Headphones />}
              label={t('rimelight.stats.plays')}
              value={fmtInt(data.plays)}
              note={t('rimelight.stats.playsNote', {
                avg: data.songsPlayed
                  ? (data.plays / data.songsPlayed).toFixed(1)
                  : '0',
              })}
            />
            <Tile
              icon={<Disc3 />}
              label={t('rimelight.stats.discovered')}
              value={`${data.songs ? Math.round((data.songsPlayed / data.songs) * 100) : 0}%`}
              note={t('rimelight.stats.discoveredNote', {
                played: fmtInt(data.songsPlayed),
                total: fmtInt(data.songs),
              })}
            />
            <Tile
              icon={<Library />}
              label={t('rimelight.stats.library')}
              value={fmtHours(data.librarySeconds)}
              note={t('rimelight.stats.libraryNote', {
                albums: fmtInt(data.albums),
                artists: fmtInt(data.artists),
                size: fmtBytes(data.libraryBytes),
              })}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Section title={t('rimelight.stats.topArtists')}>
              <BarList
                items={data.topArtists}
                metric="seconds"
                link={(r) => (r.id ? ROUTES.ARTIST.PAGE(r.id) : undefined)}
              />
            </Section>
            <Section title={t('rimelight.stats.topGenres')}>
              <BarList
                items={data.topGenres}
                metric="seconds"
                link={(r) => ROUTES.ALBUMS.GENRE(r.label)}
              />
            </Section>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Section title={t('rimelight.stats.topSongs')}>
              {data.topSongs.length === 0 ? (
                <p className="text-sm text-white/45">
                  {t('rimelight.stats.empty')}
                </p>
              ) : (
                <ol className="space-y-1">
                  {data.topSongs.map((s, i) => (
                    <li
                      key={s.key}
                      className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.06]"
                    >
                      <span className="w-5 text-right text-[12px] tabular-nums text-white/40">
                        {i + 1}
                      </span>
                      <img
                        src={getSimpleCoverArtUrl(s.coverArt, 'song', '80')}
                        alt=""
                        loading="lazy"
                        className="size-9 rounded-[10px] object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">
                          {s.label}
                        </p>
                        <p className="truncate text-[12px] text-white/50">
                          {s.sublabel}
                        </p>
                      </div>
                      <span className="text-[12px] tabular-nums text-white/60">
                        {t('rimelight.stats.playsCount', {
                          count: s.plays,
                          n: fmtInt(s.plays),
                        })}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
            <div className="space-y-4">
              <Section title={t('rimelight.stats.decades')}>
                <BarList items={data.decades} metric="seconds" />
              </Section>
              <Section title={t('rimelight.stats.formats')}>
                <div className="flex flex-wrap gap-1.5">
                  {data.formats.map((f) => (
                    <span
                      key={f.label}
                      className="glass-chip inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] text-white/80"
                    >
                      <span className="font-semibold">{f.label}</span>
                      <span className="tabular-nums text-white/50">
                        {fmtInt(f.count)}
                      </span>
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-[12px] text-white/50">
                  {t('rimelight.stats.lossless', {
                    pct: Math.round(data.losslessShare * 100),
                  })}
                </p>
              </Section>
            </div>
          </div>

          {data.topAlbums.length > 0 && (
            <Section title={t('rimelight.stats.topAlbums')}>
              <div className="grid grid-cols-3 gap-4 lg:grid-cols-6">
                {data.topAlbums.map((a) => (
                  <Link
                    key={a.key}
                    to={ROUTES.ALBUM.PAGE(a.key)}
                    className="group min-w-0"
                  >
                    <img
                      src={getSimpleCoverArtUrl(a.coverArt, 'album', '300')}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full rounded-2xl object-cover shadow-[0_16px_36px_-18px_rgb(0_0_0/0.7)] ring-1 ring-white/[0.06] transition-transform duration-300 group-hover:-translate-y-0.5"
                    />
                    <p className="mt-2 truncate text-[13px] font-medium">
                      {a.label}
                    </p>
                    <p className="truncate text-[12px] text-white/50">
                      {t('rimelight.stats.playsCount', {
                        count: a.plays,
                        n: fmtInt(a.plays),
                      })}
                    </p>
                  </Link>
                ))}
              </div>
            </Section>
          )}

          <p className="pt-2 text-center text-[11px] text-white/35">
            {t('rimelight.stats.footnote')}
            {dataUpdatedAt
              ? ` · ${new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </p>
        </div>
      )}
    </div>
  )
}
