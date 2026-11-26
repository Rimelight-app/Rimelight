import { useTranslation } from 'react-i18next'
import { CommandGroup, CommandItem } from '@/app/components/ui/command'
import { continueWithMessage } from '@/app/components/player/queue-pill'
import { shuffleLibrary } from '@/service/library-shuffle'
import { useAppStore } from '@/store/app.store'
import { useHandoffStore } from '@/store/handoff.store'
import { usePlaylists } from '@/store/playlists.store'
import { CustomCommandItem } from './command-item'
import { CommandItemProps } from './command-menu'

export type CommandPages = 'HOME' | 'GOTO' | 'THEME' | 'PLAYLISTS' | 'SERVER'

type HomeProps = CommandItemProps & {
  pages: CommandPages[]
  setPages: (value: CommandPages[]) => void
}

// ClearPlay has a single glass theme.
const appHideThemes = true

export function CommandHome({ pages, setPages, runCommand }: HomeProps) {
  const { t } = useTranslation()
  const { setPlaylistDialogState } = usePlaylists()
  const hidePlaylistsSection = useAppStore().pages.hidePlaylistsSection
  const handoff = useHandoffStore((s) => s.offer)

  return (
    <CommandGroup heading={t('command.commands.heading')}>
      {handoff && (
        <CommandItem onSelect={() => runCommand(() => continueWithMessage())}>
          <CustomCommandItem variant="ContinueFrom">
            {t('clearplay.handoff.continueFrom', {
              device: handoff.offer.device,
            })}
          </CustomCommandItem>
        </CommandItem>
      )}
      <CommandItem onSelect={() => runCommand(() => shuffleLibrary())}>
        <CustomCommandItem variant="ShuffleLibrary">
          {t('clearplay.shuffleLibrary.label')}
        </CustomCommandItem>
      </CommandItem>
      <CommandItem onSelect={() => setPages([...pages, 'GOTO'])}>
        <CustomCommandItem variant="GotoPage">
          {t('command.commands.pages')}
        </CustomCommandItem>
      </CommandItem>
      {!appHideThemes && (
        <CommandItem onSelect={() => setPages([...pages, 'THEME'])}>
          <CustomCommandItem variant="ChangeTheme">
            {t('command.commands.theme')}
          </CustomCommandItem>
        </CommandItem>
      )}
      {!hidePlaylistsSection && (
        <>
          <CommandItem onSelect={() => setPages([...pages, 'PLAYLISTS'])}>
            <CustomCommandItem variant="Playlists">
              {t('sidebar.playlists')}
            </CustomCommandItem>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => setPlaylistDialogState(true))}
          >
            <CustomCommandItem variant="CreatePlaylist">
              {t('playlist.form.create.title')}
            </CustomCommandItem>
          </CommandItem>
        </>
      )}
      <CommandItem onSelect={async () => setPages([...pages, 'SERVER'])}>
        <CustomCommandItem variant="ServerManagement">
          {t('server.management')}
        </CustomCommandItem>
      </CommandItem>
    </CommandGroup>
  )
}
