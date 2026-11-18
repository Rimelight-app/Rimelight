import {
  House,
  LibraryBig,
  type LucideIcon,
  Search,
  Settings,
} from 'lucide-react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import CommandMenu from '@/app/components/command/command-menu'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/routesList'
import { useAppSettings, useAppStore } from '@/store/app.store'

const iconProps = { className: 'size-[19px]', strokeWidth: 1.6 }

function RailButton({
  icon: Icon,
  label,
  active = false,
  to,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  to?: string
  onClick?: () => void
}) {
  const className = cn(
    'relative flex size-10 items-center justify-center rounded-[10px]',
    'text-white/55 transition-[color,background-color,transform] duration-200 ease-out',
    'hover:text-white/90 hover:bg-white/[0.07] active:scale-95',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40',
    active && 'text-white bg-white/[0.11]',
  )

  const content = (
    <>
      <Icon {...iconProps} />
      <span className="sr-only">{label}</span>
    </>
  )

  return (
    <SimpleTooltip text={label} side="right" delay={300}>
      {to ? (
        <Link
          to={to}
          className={className}
          aria-current={active ? 'page' : undefined}
        >
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={className}>
          {content}
        </button>
      )}
    </SimpleTooltip>
  )
}

export function NavRail() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const setCommandOpen = useAppStore((state) => state.command.setOpen)
  const { openDialog, setOpenDialog } = useAppSettings()

  useHotkeys('mod+comma', () => setOpenDialog(!openDialog))

  const isHome = pathname === ROUTES.LIBRARY.HOME
  const isLibrary = pathname.startsWith('/library')

  return (
    <nav
      className={cn(
        'glass-panel fixed z-30 left-3 w-[--rail-width] rounded-xl',
        'top-[--header-height] bottom-[--player-height]',
        'flex flex-col items-center justify-between py-2',
      )}
    >
      <div className="flex flex-col items-center gap-1">
        <RailButton
          icon={House}
          label={t('sidebar.home')}
          to={ROUTES.LIBRARY.HOME}
          active={isHome}
        />
        <RailButton
          icon={Search}
          label={t('sidebar.search')}
          onClick={() => setCommandOpen(true)}
        />
        <RailButton
          icon={LibraryBig}
          label={t('sidebar.library')}
          to={ROUTES.LIBRARY.ALBUMS}
          active={isLibrary}
        />
      </div>
      <RailButton
        icon={Settings}
        label={t('settings.label')}
        onClick={() => setOpenDialog(true)}
      />

      {/* Search dialog lives here; its own trigger is hidden. */}
      <CommandMenu showTrigger={false} />
    </nav>
  )
}
