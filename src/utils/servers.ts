import { useAppStore } from '@/store/app.store'

export function checkServerType() {
  const { serverType } = useAppStore.getState().data

  const isSubsonic = serverType === 'subsonic'
  const isNavidrome = serverType === 'navidrome'
  const isLms = serverType === 'lms'

  return {
    isSubsonic,
    isNavidrome,
    isLms,
  }
}

export function getServerExtensions() {
  const { extensionsSupported } = useAppStore.getState().data

  const songLyricsEnabled =
    extensionsSupported &&
    extensionsSupported.songLyrics &&
    extensionsSupported.songLyrics.length > 0

  // OpenSubsonic reportPlayback, version 1 (listed by Navidrome 0.64.2).
  const playbackReportEnabled =
    extensionsSupported?.playbackReport?.includes(1) ?? false

  // OpenSubsonic savePlayQueueByIndex / getPlayQueueByIndex (Navidrome 0.64.2
  // lists it): keeps the right spot when a song is in the queue twice.
  const indexBasedQueueEnabled =
    extensionsSupported?.indexBasedQueue?.includes(1) ?? false

  return {
    songLyricsEnabled,
    playbackReportEnabled,
    indexBasedQueueEnabled,
  }
}
