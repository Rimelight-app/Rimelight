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
import { useClearPlaySettings } from '@/store/clearplay-settings.store'

export function QueueSettings() {
  const { t } = useTranslation()
  const { syncQueue, autoDj, set } = useClearPlaySettings()
  const k = 'clearplay.queue'

  return (
    <Root>
      <Header>
        <HeaderTitle>{t(`${k}.group`)}</HeaderTitle>
        <HeaderDescription>{t(`${k}.description`)}</HeaderDescription>
      </Header>
      <Content>
        <ContentItem>
          <ContentItemTitle info={t(`${k}.sync.info`)}>
            {t(`${k}.sync.label`)}
          </ContentItemTitle>
          <ContentItemForm>
            <Switch
              checked={syncQueue}
              onCheckedChange={(v) => set({ syncQueue: v })}
            />
          </ContentItemForm>
        </ContentItem>
        <ContentItem>
          <ContentItemTitle info={t(`${k}.autoDj.info`)}>
            {t(`${k}.autoDj.label`)}
          </ContentItemTitle>
          <ContentItemForm>
            <Switch
              checked={autoDj}
              onCheckedChange={(v) => set({ autoDj: v })}
            />
          </ContentItemForm>
        </ContentItem>
      </Content>
      <ContentSeparator />
    </Root>
  )
}
