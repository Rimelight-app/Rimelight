import { useEffect } from 'react'
import { startPlaybackReporter } from '@/service/playback-reporter'
import { scrobble } from '@/service/scrobble'

export function ScrobbleObserver() {
  useEffect(() => {
    scrobble.startRetryLoop()
    startPlaybackReporter()
  }, [])
  return null
}
