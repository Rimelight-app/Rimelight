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
import { useAppDesktopActions, useAppDesktopData } from '@/store/app.store'
import { useRimelightSettings } from '@/store/rimelight-settings.store'
import { isWindows } from '@/utils/desktop'

export function DesktopSettings() {
  const { t } = useTranslation()
  const { minimizeToTray } = useAppDesktopData()
  const { setMinimizeToTray } = useAppDesktopActions()
  const taskbarProgress = useRimelightSettings((s) => s.taskbarProgress)
  const setSettings = useRimelightSettings((s) => s.set)

  return (
    <Root>
      <Header>
        <HeaderTitle>{t('settings.desktop.general.group')}</HeaderTitle>
        <HeaderDescription>
          {t('settings.desktop.general.description')}
        </HeaderDescription>
      </Header>
      <Content>
        <ContentItem>
          <ContentItemTitle info={t('settings.desktop.general.tray.info')}>
            {t('settings.desktop.general.tray.label')}
          </ContentItemTitle>
          <ContentItemForm>
            <Switch
              checked={minimizeToTray}
              onCheckedChange={setMinimizeToTray}
            />
          </ContentItemForm>
        </ContentItem>
        {isWindows && (
          <ContentItem>
            <ContentItemTitle info={t('rimelight.taskbarProgress.info')}>
              {t('rimelight.taskbarProgress.label')}
            </ContentItemTitle>
            <ContentItemForm>
              <Switch
                checked={taskbarProgress}
                onCheckedChange={(v) => setSettings({ taskbarProgress: v })}
                data-testid="taskbar-progress-switch"
              />
            </ContentItemForm>
          </ContentItem>
        )}
      </Content>
      <ContentSeparator />
    </Root>
  )
}
