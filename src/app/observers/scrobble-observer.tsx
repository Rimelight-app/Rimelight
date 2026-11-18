import { useEffect } from 'react'
import { scrobble } from '@/service/scrobble'

export function ScrobbleObserver() {
  useEffect(() => {
    scrobble.startRetryLoop()
  }, [])
  return null
}
