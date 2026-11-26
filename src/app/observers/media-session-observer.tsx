import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  usePlayerIsPlaying,
  usePlayerMediaType,
  usePlayerSonglist,
} from '@/store/player.store'
import { appName } from '@/utils/appName'
import { manageMediaSession } from '@/utils/setMediaSession'

export function MediaSessionObserver() {
  const { t } = useTranslation()
  const isPlaying = usePlayerIsPlaying()
  const { isRadio, isSong, isPodcast } = usePlayerMediaType()
  const { currentList, radioList, currentSongIndex, podcastList } =
    usePlayerSonglist()
  const radioLabel = t('radios.label')

  const song = currentList[currentSongIndex] ?? null
  const radio = radioList[currentSongIndex] ?? null
  const episode = podcastList[currentSongIndex] ?? null

  const hasNothingPlaying =
    currentList.length === 0 &&
    radioList.length === 0 &&
    podcastList.length === 0

  // Play / pause only changes the playback state: no new metadata, so the
  // OS media controls don't fetch the cover again.
  useEffect(() => {
    manageMediaSession.setPlaybackState(isPlaying)
  }, [isPlaying])

  // What is playing, by id (a starred or rated song is the same song).
  const itemKey = hasNothingPlaying
    ? null
    : isSong && song
      ? `song:${song.id}`
      : isRadio && radio
        ? `radio:${radio.id}`
        : isPodcast && episode
          ? `podcast:${episode.id}`
          : null
  const latest = useRef({ song, radio, episode, radioLabel })
  latest.current = { song, radio, episode, radioLabel }
  const metadataFor = useRef<string | null>(null)

  // Metadata once per item, when it first plays (as before: nothing is
  // shown for a queue that was restored paused).
  useEffect(() => {
    if (itemKey === null) {
      metadataFor.current = null
      manageMediaSession.removeMediaSession()
      return
    }
    if (!isPlaying || metadataFor.current === itemKey) return
    metadataFor.current = itemKey
    const { song, radio, episode, radioLabel } = latest.current
    if (itemKey.startsWith('radio:') && radio) {
      manageMediaSession.setRadioMediaSession(radioLabel, radio.name)
    } else if (itemKey.startsWith('song:') && song) {
      manageMediaSession.setMediaSession(song)
    } else if (itemKey.startsWith('podcast:') && episode) {
      manageMediaSession.setPodcastMediaSession(episode)
    }
  }, [itemKey, isPlaying])

  // The window title: the song while playing, the app name otherwise.
  useEffect(() => {
    const { song, radio, episode, radioLabel } = latest.current
    let title = appName
    if (itemKey !== null && isPlaying) {
      if (itemKey.startsWith('radio:') && radio) {
        title = `${radioLabel} - ${radio.name}`
      } else if (itemKey.startsWith('song:') && song) {
        title = `${song.artist} - ${song.title}`
      } else if (itemKey.startsWith('podcast:') && episode) {
        title = `${episode.title} - ${episode.podcast.title}`
      }
    }
    if (document.title !== title) document.title = title
  }, [itemKey, isPlaying])

  return null
}
