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
import {
  StreamFormat,
  useClearPlaySettings,
} from '@/store/clearplay-settings.store'
import { SettingSelect } from './controls'

export function StreamingSettings() {
  const { t } = useTranslation()
  const { maxBitRate, streamFormat, set } = useClearPlaySettings()

  return (
    <Root>
      <Header>
        <HeaderTitle>{t('clearplay.settings.streaming.group')}</HeaderTitle>
        <HeaderDescription>
          {t('clearplay.settings.streaming.description')}
        </HeaderDescription>
      </Header>
      <Content>
        <ContentItem>
          <ContentItemTitle
            info={t('clearplay.settings.streaming.quality.info')}
          >
            {t('clearplay.settings.streaming.quality.label')}
          </ContentItemTitle>
          <ContentItemForm>
            <SettingSelect
              value={maxBitRate}
              onChange={(v) => set({ maxBitRate: v })}
              options={[
                {
                  value: '0',
                  label: t('clearplay.settings.streaming.original'),
                },
                { value: '320', label: '320 kbps' },
                { value: '256', label: '256 kbps' },
                { value: '192', label: '192 kbps' },
                { value: '128', label: '128 kbps' },
                { value: '96', label: '96 kbps' },
              ]}
            />
          </ContentItemForm>
        </ContentItem>
        {maxBitRate !== '0' && (
          <ContentItem>
            <ContentItemTitle
              info={t('clearplay.settings.streaming.format.info')}
            >
              {t('clearplay.settings.streaming.format.label')}
            </ContentItemTitle>
            <ContentItemForm>
              <SettingSelect<StreamFormat>
                value={streamFormat}
                onChange={(v) => set({ streamFormat: v })}
                options={[
                  { value: 'opus', label: 'Opus' },
                  { value: 'mp3', label: 'MP3' },
                  { value: 'aac', label: 'AAC' },
                ]}
              />
            </ContentItemForm>
          </ContentItem>
        )}
      </Content>
      <ContentSeparator />
    </Root>
  )
}
