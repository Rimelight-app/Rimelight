import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Content,
  ContentItem,
  ContentItemForm,
  ContentItemTitle,
  ContentSeparator,
  Header,
  HeaderDescription,
  HeaderTitle,
  Root,
} from '@/app/components/settings/section'
import { Switch } from '@/app/components/ui/switch'
import { cn } from '@/lib/utils'
import { scrobble } from '@/service/scrobble'
import { useScrobbleStore } from '@/store/scrobble.store'

export function ScrobblingSettings() {
  const { t } = useTranslation()
  const { enabled, setEnabled, log, pending } = useScrobbleStore()
  const [retrying, setRetrying] = useState(false)

  return (
    <Root>
      <Header>
        <HeaderTitle>{t('rimelight.settings.scrobbling.group')}</HeaderTitle>
        <HeaderDescription>
          {t('rimelight.settings.scrobbling.description')}
        </HeaderDescription>
      </Header>
      <Content>
        <ContentItem>
          <ContentItemTitle
            info={t('rimelight.settings.scrobbling.enabled.info')}
          >
            {t('rimelight.settings.scrobbling.enabled.label')}
          </ContentItemTitle>
          <ContentItemForm>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </ContentItemForm>
        </ContentItem>
        <ContentItem>
          <ContentItemTitle>
            {t('rimelight.settings.scrobbling.pending', {
              count: pending.length,
            })}
          </ContentItemTitle>
          <ContentItemForm>
            <button
              type="button"
              disabled={!pending.length || retrying}
              onClick={async () => {
                setRetrying(true)
                await scrobble.flush()
                setRetrying(false)
              }}
              className="glass-chip h-8 rounded-full px-4 text-[13px] text-white/80 transition-colors hover:bg-white/[0.14] disabled:opacity-40"
            >
              {t('rimelight.settings.scrobbling.retry')}
            </button>
          </ContentItemForm>
        </ContentItem>
        <div className="rounded-2xl bg-white/[0.04] p-2">
          <p className="px-2 pb-1 pt-1 text-[12px] font-medium text-white/60">
            {t('rimelight.settings.scrobbling.recent')}
          </p>
          {log.length === 0 ? (
            <p className="px-2 pb-2 text-[13px] text-white/60">
              {t('rimelight.settings.scrobbling.none')}
            </p>
          ) : (
            <ul>
              {log.slice(0, 8).map((e) => (
                <li
                  key={`${e.at}-${e.id}-${e.kind}`}
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-[13px]"
                >
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      e.status === 'sent' && 'bg-emerald-400',
                      e.status === 'queued' && 'bg-amber-400',
                      e.status === 'failed' && 'bg-rose-400',
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {e.title || e.id}
                    {e.artist && (
                      <span className="text-white/60"> · {e.artist}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[12px] text-white/60">
                    {t(`rimelight.settings.scrobbling.kind.${e.kind}`)} ·{' '}
                    {t(`rimelight.settings.scrobbling.status.${e.status}`)} ·{' '}
                    {new Date(e.at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-[12px] text-white/60">
          {t('rimelight.settings.scrobbling.hint')}
        </p>
      </Content>
      <ContentSeparator />
    </Root>
  )
}
