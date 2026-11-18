import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/routesList'

const tabs = [
  { label: 'sidebar.albums', route: ROUTES.LIBRARY.ALBUMS },
  { label: 'sidebar.artists', route: ROUTES.LIBRARY.ARTISTS },
  { label: 'sidebar.songs', route: ROUTES.LIBRARY.SONGS },
  { label: 'sidebar.playlists', route: ROUTES.LIBRARY.PLAYLISTS },
  { label: 'sidebar.favorites', route: ROUTES.LIBRARY.FAVORITES },
  { label: 'sidebar.genres', route: ROUTES.LIBRARY.GENRES },
]

/** Segmented control shown in the header on library pages. */
export function LibraryTabs() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  if (!pathname.startsWith('/library')) return null

  return (
    <div className="glass-chip electron-no-drag flex items-center gap-0.5 rounded-[10px] p-0.5">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.route)
        return (
          <Link
            key={tab.route}
            to={tab.route}
            className={cn(
              'px-3.5 h-7 inline-flex items-center rounded-full text-[13px] font-medium',
              'text-white/55 transition-colors duration-200 hover:text-white/90',
              active && 'bg-white/[0.12] text-white',
            )}
          >
            {t(tab.label)}
          </Link>
        )
      })}
    </div>
  )
}
