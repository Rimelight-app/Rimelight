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
  useRimelightSettings,
} from '@/store/rimelight-settings.store'
import { SettingSelect } from './controls'

export function StreamingSettings() {
  const { t } = useTranslation()
  const { maxBitRate, streamFormat, set } = useRimelightSettings()

  return (
    <Root>
      <Header>
        <HeaderTitle>{t('rimelight.settings.streaming.group')}</HeaderTitle>
        <HeaderDescription>
          {t('rimelight.settings.streaming.description')}
        </HeaderDescription>
      </Header>
      <Content>
        <ContentItem>
          <ContentItemTitle
            info={t('rimelight.settings.streaming.quality.info')}
          >
            {t('rimelight.settings.streaming.quality.label')}
          </ContentItemTitle>
          <ContentItemForm>
            <SettingSelect
              value={maxBitRate}
              onChange={(v) => set({ maxBitRate: v })}
              options={[
                {
                  value: '0',
                  label: t('rimelight.settings.streaming.original'),
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
              info={t('rimelight.settings.streaming.format.info')}
            >
              {t('rimelight.settings.streaming.format.label')}
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
