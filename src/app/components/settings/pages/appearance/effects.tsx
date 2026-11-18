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
import { useEffectsStore } from '@/store/effects.store'

export function EffectsSettings() {
  const { t } = useTranslation()
  const { reduceEffects, setReduceEffects } = useEffectsStore()

  return (
    <Root>
      <Header>
        <HeaderTitle>{t('clearplay.effects.group')}</HeaderTitle>
        <HeaderDescription>
          {t('clearplay.effects.description')}
        </HeaderDescription>
      </Header>
      <Content>
        <ContentItem>
          <ContentItemTitle info={t('clearplay.reduceEffects.info')}>
            {t('clearplay.reduceEffects.label')}
          </ContentItemTitle>
          <ContentItemForm>
            <Switch
              checked={reduceEffects}
              onCheckedChange={setReduceEffects}
            />
          </ContentItemForm>
        </ContentItem>
      </Content>
      <ContentSeparator />
    </Root>
  )
}
