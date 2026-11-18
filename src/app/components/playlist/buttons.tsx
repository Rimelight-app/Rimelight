import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { Actions } from '@/app/components/actions'
import {
  useIsPlaylistPlaying,
  usePlayerActions,
  usePlayerStore,
} from '@/store/player.store'
import { PlaybackSource } from '@/types/playerContext'
import { PlaylistWithEntries } from '@/types/responses/playlist'
import { PlaylistOptions } from './options'

interface PlaylistButtonsProps {
  playlist: PlaylistWithEntries
  searchActive?: boolean
  onToggleSearch?: () => void
}

export function PlaylistButtons({
  playlist,
  searchActive = false,
  onToggleSearch,
}: PlaylistButtonsProps) {
  const { t } = useTranslation()
  const { setSongList, togglePlayPause, toggleShuffle, setLastOnQueue } =
    usePlayerActions()
  const { isPlaylistActive, isPlaylistPlaying } = useIsPlaylistPlaying(
    playlist.id,
  )
  const isShuffleActive = usePlayerStore(
    (state) => state.playerState.isShuffleActive,
  )

  const buttonsTooltips = {
    play: isPlaylistPlaying
      ? t('playlist.buttons.pause', { name: playlist.name })
      : t('playlist.buttons.play', { name: playlist.name }),
    shuffle: t('playlist.buttons.shuffle', { name: playlist.name }),
    options: t('playlist.buttons.options', { name: playlist.name }),
  }

  const playbackSource: PlaybackSource = {
    id: playlist.id,
    name: playlist.name,
    type: 'playlist',
  }

  function handlePlayButton() {
    if (isPlaylistActive) {
      togglePlayPause()
    } else {
      setSongList(playlist.entry, 0, false, playbackSource)
    }
  }

  function handleShuffleButton() {
    if (isPlaylistActive) {
      toggleShuffle()
    } else {
      setSongList(playlist.entry, 0, true, playbackSource)
    }
  }

  return (
    <Actions.Container>
      <Actions.Button
        tooltip={buttonsTooltips.play}
        buttonStyle="primary"
        onClick={handlePlayButton}
        disabled={!playlist.entry}
        label={
          isPlaylistPlaying ? t('clearplay.pause') : t('clearplay.playAll')
        }
      >
        {isPlaylistPlaying ? <Actions.PauseIcon /> : <Actions.PlayIcon />}
      </Actions.Button>

      <Actions.Button
        tooltip={buttonsTooltips.shuffle}
        onClick={handleShuffleButton}
        disabled={!playlist.entry}
        isActive={isPlaylistActive && isShuffleActive}
      >
        <Actions.ShuffleIcon />
      </Actions.Button>

      <Actions.Button
        tooltip={t('clearplay.addToQueue')}
        disabled={!playlist.entry}
        onClick={() => {
          if (!playlist.entry) return
          setLastOnQueue(playlist.entry)
          toast.success(t('clearplay.addedToQueue'))
        }}
      >
        <Actions.QueueIcon />
      </Actions.Button>

      {onToggleSearch && (
        <Actions.Button
          tooltip={t('clearplay.searchInPlaylist')}
          onClick={onToggleSearch}
          disabled={!playlist.entry}
          className={searchActive ? 'bg-white/[0.2] text-white' : undefined}
        >
          <Actions.SearchIcon />
        </Actions.Button>
      )}

      <Actions.Dropdown
        tooltip={buttonsTooltips.options}
        options={
          <PlaylistOptions
            playlist={playlist}
            disablePlayNext={!playlist.entry}
            disableAddLast={!playlist.entry}
            disableDownload={!playlist.entry}
          />
        }
      />
    </Actions.Container>
  )
}
