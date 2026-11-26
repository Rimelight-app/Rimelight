import { OptionsButtons } from '@/app/components/options/buttons'
import { DownloadOptionHandler } from '@/app/components/options/download-handler'
import { AddToPlaylistSubMenu } from '@/app/components/song/add-to-playlist'
import {
  DropdownMenuGroup,
  DropdownMenuSeparator,
} from '@/app/components/ui/dropdown-menu'
import { useOptions } from '@/app/hooks/use-options'
import { radioAvailable, radioOnline, startRadio } from '@/service/radio'
import { useAppStore } from '@/store/app.store'
import { SingleAlbum } from '@/types/responses/album'

interface AlbumOptionsProps {
  album: SingleAlbum
}

export function AlbumOptions({ album }: AlbumOptionsProps) {
  const hidePlaylistsSection = useAppStore().pages.hidePlaylistsSection
  const {
    playNext,
    playLast,
    startDownload,
    addToPlaylist,
    createNewPlaylist,
  } = useOptions()

  function handlePlayNext() {
    playNext(album.song)
  }

  function handlePlayLast() {
    playLast(album.song)
  }

  function handleDownload() {
    startDownload(album.id)
  }

  function handleAddToPlaylist(id: string) {
    const songIdToAdd = album.song.map((song) => song.id)

    addToPlaylist(id, songIdToAdd)
  }

  function handleCreateNewPlaylist() {
    const songIdToAdd = album.song.map((song) => song.id)

    createNewPlaylist(album.name, songIdToAdd)
  }

  const radioSeed = { kind: 'album' as const, id: album.id, name: album.name }

  return (
    <>
      <DropdownMenuGroup>
        <OptionsButtons.PlayNext onClick={handlePlayNext} />
        <OptionsButtons.PlayLast onClick={handlePlayLast} />
        {radioAvailable(radioSeed) && (
          <OptionsButtons.StartRadio
            disabled={!radioOnline()}
            onClick={() => startRadio(radioSeed)}
          />
        )}
      </DropdownMenuGroup>
      {!hidePlaylistsSection && (
        <>
          <DropdownMenuSeparator />
          <OptionsButtons.AddToPlaylistOption variant="dropdown">
            <AddToPlaylistSubMenu
              type="dropdown"
              newPlaylistFn={handleCreateNewPlaylist}
              addToPlaylistFn={handleAddToPlaylist}
            />
          </OptionsButtons.AddToPlaylistOption>
        </>
      )}
      <DownloadOptionHandler>
        <OptionsButtons.Download onClick={handleDownload} />
      </DownloadOptionHandler>
    </>
  )
}
