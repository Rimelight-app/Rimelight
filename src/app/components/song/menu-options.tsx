import { OptionsButtons } from '@/app/components/options/buttons'
import { DownloadOptionHandler } from '@/app/components/options/download-handler'
import { MenuRatingRow } from '@/app/components/rating/menu-rating-row'
import { ContextMenuSeparator } from '@/app/components/ui/context-menu'
import { useOptions } from '@/app/hooks/use-options'
import { radioAvailable, radioOnline, startRadio } from '@/service/radio'
import { useAppStore } from '@/store/app.store'
import { ISong } from '@/types/responses/song'
import { AddToPlaylistSubMenu } from './add-to-playlist'

interface SongMenuOptionsProps {
  variant: 'context' | 'dropdown'
  song: ISong
  index: number
}

export function SongMenuOptions({
  variant,
  song,
  index,
}: SongMenuOptionsProps) {
  const {
    playNext,
    playLast,
    createNewPlaylist,
    addToPlaylist,
    removeSongFromPlaylist,
    startDownload,
    openSongInfo,
    isOnPlaylistPage,
  } = useOptions()
  const hidePlaylistsSection = useAppStore().pages.hidePlaylistsSection
  const songIndexes = [index.toString()]
  const radioSeed = { kind: 'song' as const, id: song.id, name: song.title }

  return (
    <>
      <OptionsButtons.PlayNext
        variant={variant}
        onClick={(e) => {
          e.stopPropagation()
          playNext([song])
        }}
      />
      <OptionsButtons.PlayLast
        variant={variant}
        onClick={(e) => {
          e.stopPropagation()
          playLast([song])
        }}
      />
      {radioAvailable(radioSeed) && (
        <OptionsButtons.StartRadio
          variant={variant}
          disabled={!radioOnline()}
          onClick={(e) => {
            e.stopPropagation()
            startRadio(radioSeed, song)
          }}
        />
      )}
      {!hidePlaylistsSection && (
        <>
          <ContextMenuSeparator />
          <OptionsButtons.AddToPlaylistOption variant={variant}>
            <AddToPlaylistSubMenu
              type={variant}
              newPlaylistFn={() => createNewPlaylist(song.title, song.id)}
              addToPlaylistFn={(id) => addToPlaylist(id, song.id)}
            />
          </OptionsButtons.AddToPlaylistOption>
        </>
      )}
      {isOnPlaylistPage && (
        <OptionsButtons.RemoveFromPlaylist
          variant={variant}
          onClick={(e) => {
            e.stopPropagation()
            removeSongFromPlaylist(songIndexes)
          }}
        />
      )}
      <ContextMenuSeparator />
      <MenuRatingRow songs={[song]} />
      <DownloadOptionHandler context={true}>
        <OptionsButtons.Download
          variant={variant}
          onClick={(e) => {
            e.stopPropagation()
            startDownload(song.id)
          }}
        />
      </DownloadOptionHandler>
      <ContextMenuSeparator />
      <OptionsButtons.SongInfo
        variant={variant}
        onClick={(e) => {
          e.stopPropagation()
          openSongInfo(song.id)
        }}
      />
    </>
  )
}
