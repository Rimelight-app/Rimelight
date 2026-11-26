import i18n from '@/i18n'
import { useAppStore } from '@/store/app.store'
import {
  SavedServer,
  useServersStore,
  verifyServer,
} from '@/store/servers.store'
import { isDesktop } from '@/utils/desktop'
import type { LocalLibraryState } from '../../electron/preload/types'

/** User name of the built-in local library server (see electron main). */
export const LOCAL_USERNAME = 'clearplay'

export function hasLocalLibrary() {
  return isDesktop() && Boolean(window.api?.localLibrary)
}

export function isLocalServer(url: string, username: string) {
  return username === LOCAL_USERNAME && /^http:\/\/127\.0\.0\.1:\d+$/.test(url)
}

export function isUsingLocalLibrary() {
  const { url, username } = useAppStore.getState().data
  return isLocalServer(url, username)
}

export function localLibraryState(): Promise<LocalLibraryState> {
  return window.api.localLibrary.state()
}

/**
 * Starts the local library server (if needed), checks it like any server and
 * saves it as "This computer" in the server list.
 */
export async function connectLocalLibrary(): Promise<SavedServer | null> {
  const c = await window.api.localLibrary.connect()
  const server = await verifyServer(
    c.url,
    c.username,
    c.password,
    i18n.t('rimelight.local.serverName'),
  )
  if (!server) return null
  const { servers, upsert, remove } = useServersStore.getState()
  // An older entry from a different port is replaced, not duplicated.
  for (const s of servers) {
    if (isLocalServer(s.url, s.username) && s.id !== server.id) remove(s.id)
  }
  upsert(server)
  return server
}

/** Makes the local library the active server (no reload). */
export function activateServer(server: SavedServer) {
  useAppStore.setState((state) => {
    state.data.url = server.url
    state.data.username = server.username
    state.data.password = server.password
    state.data.authType = server.authType
    state.data.protocolVersion = server.protocolVersion
    state.data.serverType = server.serverType as typeof state.data.serverType
    state.data.extensionsSupported =
      server.extensionsSupported as typeof state.data.extensionsSupported
    state.data.isServerConfigured = true
  })
}
