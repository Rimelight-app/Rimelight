import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  activateServer,
  connectLocalLibrary,
  hasLocalLibrary,
  isLocalServer,
  localLibraryState,
} from '@/service/local-library'
import { useAppStore } from '@/store/app.store'

/** Fired by the settings page when folders change, to watch the scan. */
export const LOCAL_SCAN_EVENT = 'rimelight:local-scan'

/**
 * While the local library is the active server: makes sure it is running
 * (its port can change if another app took it) and refreshes every view when
 * a scan finishes, so new folders show up without a restart.
 */
export function LocalLibraryObserver() {
  const queryClient = useQueryClient()
  const url = useAppStore((s) => s.data.url)
  const username = useAppStore((s) => s.data.username)
  const local = isLocalServer(url, username)

  useEffect(() => {
    if (!hasLocalLibrary() || !local) return
    connectLocalLibrary()
      .then((server) => {
        if (server && server.url !== url) {
          activateServer(server)
          queryClient.invalidateQueries()
        }
      })
      .catch(() => undefined)
  }, [local, url, queryClient])

  useEffect(() => {
    if (!hasLocalLibrary()) return
    let timer = 0
    let wasScanning = false
    let stopped = false
    const check = async () => {
      if (stopped) return
      const state = await localLibraryState().catch(() => null)
      if (!state) return
      if (state.scanning) {
        wasScanning = true
        timer = window.setTimeout(check, 1000)
      } else if (wasScanning) {
        wasScanning = false
        if (
          isLocalServer(
            useAppStore.getState().data.url,
            useAppStore.getState().data.username,
          )
        ) {
          queryClient.invalidateQueries()
        }
      }
    }
    const start = () => {
      window.clearTimeout(timer)
      // Give the main process a moment to begin the scan.
      timer = window.setTimeout(check, 300)
    }
    start()
    window.addEventListener(LOCAL_SCAN_EVENT, start)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      window.removeEventListener(LOCAL_SCAN_EVENT, start)
    }
  }, [queryClient])

  return null
}
