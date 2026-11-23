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
import { useIsMpvSession } from '@/store/bitperfect.store'
import {
  BackdropMode,
  LyricsSize,
  StartPage,
  useClearPlaySettings,
} from '@/store/clearplay-settings.store'
import { SettingSelect } from './controls'

export function InterfaceSettings() {
  const { t } = useTranslation()
  const mpv = useIsMpvSession()
  const { showQuality, lyricsSize, backdrop, startPage, visualizer, set } =
    useClearPlaySettings()
  const k = 'clearplay.settings.interface'

  return (
    <Root>
      <Header>
        <HeaderTitle>{t(`${k}.group`)}</HeaderTitle>
        <HeaderDescription>{t(`${k}.description`)}</HeaderDescription>
      </Header>
      <Content>
        <ContentItem>
          <ContentItemTitle>{t(`${k}.startPage.label`)}</ContentItemTitle>
          <ContentItemForm>
            <SettingSelect<StartPage>
              value={startPage}
              onChange={(v) => set({ startPage: v })}
              options={[
                { value: '/', label: t('sidebar.home') },
                { value: '/library/albums', label: t('sidebar.library') },
                {
                  value: '/search',
                  label: t('sidebar.search').replace('…', ''),
                },
                { value: '/stats', label: t('clearplay.statsNav') },
              ]}
            />
          </ContentItemForm>
        </ContentItem>
        <ContentItem>
          <ContentItemTitle info={t(`${k}.backdrop.info`)}>
            {t(`${k}.backdrop.label`)}
          </ContentItemTitle>
          <ContentItemForm>
            <SettingSelect<BackdropMode>
              value={backdrop}
              onChange={(v) => set({ backdrop: v })}
              options={[
                { value: 'vivid', label: t(`${k}.backdrop.vivid`) },
                { value: 'normal', label: t(`${k}.backdrop.normal`) },
                { value: 'dim', label: t(`${k}.backdrop.dim`) },
                { value: 'off', label: t(`${k}.backdrop.off`) },
              ]}
            />
          </ContentItemForm>
        </ContentItem>
        <ContentItem>
          <ContentItemTitle>{t(`${k}.lyricsSize.label`)}</ContentItemTitle>
          <ContentItemForm>
            <SettingSelect<LyricsSize>
              value={lyricsSize}
              onChange={(v) => set({ lyricsSize: v })}
              options={[
                { value: 's', label: t(`${k}.lyricsSize.s`) },
                { value: 'm', label: t(`${k}.lyricsSize.m`) },
                { value: 'l', label: t(`${k}.lyricsSize.l`) },
              ]}
            />
          </ContentItemForm>
        </ContentItem>
        <ContentItem>
          <ContentItemTitle info={t(`${k}.showQuality.info`)}>
            {t(`${k}.showQuality.label`)}
          </ContentItemTitle>
          <ContentItemForm>
            <Switch
              checked={showQuality}
              onCheckedChange={(v) => set({ showQuality: v })}
            />
          </ContentItemForm>
        </ContentItem>
        <ContentItem>
          <ContentItemTitle info={t(`${k}.visualizer.info`)}>
            {t(`${k}.visualizer.label`)}
          </ContentItemTitle>
          <ContentItemForm>
            <Switch
              checked={visualizer && !mpv}
              disabled={mpv}
              onCheckedChange={(v) => set({ visualizer: v })}
              data-testid="setting-visualizer"
            />
          </ContentItemForm>
        </ContentItem>
        {mpv && (
          <p className="px-1 text-[12px] text-white/60">
            {t('clearplay.sound.visualizerOff')}
          </p>
        )}
      </Content>
      <ContentSeparator />
    </Root>
  )
}
