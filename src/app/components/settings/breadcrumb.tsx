import { useTranslation } from 'react-i18next'
import { useAppSettings } from '@/store/app.store'

/** "SETTINGS" above the page's name, like the app's other page headers. */
export function SettingsBreadcrumb() {
  const { t } = useTranslation()
  const { currentPage } = useAppSettings()

  return (
    <header className="flex shrink-0 flex-col gap-1.5 px-6 pb-4 pt-6 pr-14">
      <p className="hidden text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-muted-foreground md:block">
        {t('settings.label')}
      </p>
      <h2 className="truncate text-2xl font-bold leading-tight tracking-tight text-foreground">
        {t(`settings.options.${currentPage}`)}
      </h2>
    </header>
  )
}
