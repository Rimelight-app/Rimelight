import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
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
import { Button } from '@/app/components/ui/button'
import { Switch } from '@/app/components/ui/switch'
import { clearAllCaches } from '@/cache/clearAll'
import { useAppCaches } from '@/store/app.store'

export function CachesContent() {
  const { t } = useTranslation()
  const {
    lyricsCacheEnabled,
    setLyricsCacheEnabled,
    mediaCacheEnabled,
    setMediaCacheEnabled,
  } = useAppCaches()
  const [isClearing, setIsClearing] = useState(false)

  async function handleClearAllCaches() {
    if (isClearing) return

    setIsClearing(true)
    try {
      await clearAllCaches()
      toast.success(t('settings.content.caches.clearAll.success'))
    } catch {
      toast.error(t('settings.content.caches.clearAll.error'))
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <Root>
      <Header>
        <HeaderTitle>{t('settings.content.caches.group')}</HeaderTitle>
        <HeaderDescription>
          {t('settings.content.caches.description')}
        </HeaderDescription>
      </Header>
      <Content>
        <ContentItem>
          <ContentItemTitle info={t('settings.content.caches.lyrics.info')}>
            {t('settings.content.caches.lyrics.label')}
          </ContentItemTitle>
          <ContentItemForm>
            <Switch
              checked={lyricsCacheEnabled}
              onCheckedChange={setLyricsCacheEnabled}
            />
          </ContentItemForm>
        </ContentItem>
        <ContentItem>
          <ContentItemTitle info={t('settings.content.caches.media.info')}>
            {t('settings.content.caches.media.label')}
          </ContentItemTitle>
          <ContentItemForm>
            <Switch
              checked={mediaCacheEnabled}
              onCheckedChange={setMediaCacheEnabled}
            />
          </ContentItemForm>
        </ContentItem>
        <ContentItem>
          <ContentItemTitle info={t('settings.content.caches.clearAll.info')}>
            {t('settings.content.caches.clearAll.label')}
          </ContentItemTitle>
          <ContentItemForm>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearAllCaches}
              disabled={isClearing}
            >
              {t('settings.content.caches.clearAll.button')}
            </Button>
          </ContentItemForm>
        </ContentItem>
      </Content>
      <ContentSeparator />
    </Root>
  )
}
