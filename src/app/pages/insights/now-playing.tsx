import { useQuery } from '@tanstack/react-query'
import { Radio, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/routesList'
import { stats } from '@/service/stats'
import { getAudioQuality } from '@/utils/audioQuality'

/** Who is listening on the server right now (all users and players). */
export default function NowPlayingPage() {
  const { t } = useTranslation()
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['clearplay-now-playing'],
    queryFn: stats.getNowPlaying,
    refetchInterval: 15_000,
  })

  return (
    <div className="w-full px-8 pb-8 pt-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
            {t('clearplay.nowPlaying.kicker')}
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">
            {t('clearplay.nowPlaying.title')}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="glass-chip inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] text-white/80 transition-colors hover:bg-white/[0.14] hover:text-white"
        >
          <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
          {t('clearplay.stats.refresh')}
        </button>
      </div>

      {!isLoading && (!data || data.length === 0) ? (
        <div className="glass-panel flex h-48 flex-col items-center justify-center gap-3 rounded-[20px] text-white/55">
          <span className="flex size-11 items-center justify-center rounded-full bg-white/[0.08]">
            <Radio className="size-5" />
          </span>
          <p className="text-sm">{t('clearplay.nowPlaying.empty')}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {(data ?? []).map((entry) => {
            const q = getAudioQuality(entry)
            return (
              <div
                key={`${entry.username}-${entry.playerId ?? ''}-${entry.id}`}
                className="glass-panel flex gap-4 rounded-[20px] p-4"
              >
                <Link
                  to={ROUTES.ALBUM.PAGE(entry.albumId)}
                  className="shrink-0"
                >
                  <img
                    src={getSimpleCoverArtUrl(entry.coverArt, 'song', '300')}
                    alt=""
                    className="size-24 rounded-2xl object-cover shadow-[0_16px_36px_-18px_rgb(0_0_0/0.7)] ring-1 ring-white/[0.06]"
                  />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold">
                      {entry.title}
                    </p>
                    <p className="truncate text-[13px] text-white/60">
                      {entry.artist} · {entry.album}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white/90 px-2.5 font-semibold text-[#121216]">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {entry.username}
                    </span>
                    {entry.playerName && (
                      <span className="glass-chip inline-flex h-6 items-center rounded-full px-2.5 text-white/75">
                        {entry.playerName}
                      </span>
                    )}
                    <span className="glass-chip inline-flex h-6 items-center rounded-full px-2.5 text-white/75">
                      {entry.minutesAgo === 0
                        ? t('clearplay.nowPlaying.justNow')
                        : t('clearplay.nowPlaying.minutesAgo', {
                            count: entry.minutesAgo,
                          })}
                    </span>
                    <span className="glass-chip inline-flex h-6 items-center rounded-full px-2.5 text-white/60">
                      {[q.format, ...q.details].join(' · ')}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
