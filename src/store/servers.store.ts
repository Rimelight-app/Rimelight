import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { httpClient } from '@/api/httpClient'
import { pingServer } from '@/api/pingServer'
import { queryServerInfo } from '@/api/queryServerInfo'
import { useAppStore } from '@/store/app.store'
import { SubsonicResponse } from '@/types/responses/subsonicResponse'
import { AuthType } from '@/types/serverConfig'
import { genEncodedPassword, genPasswordToken } from '@/utils/salt'

export interface SavedServer {
  id: string
  name: string
  url: string
  username: string
  /** Token or encoded password, exactly as the app stores it for the active server. */
  password: string
  authType: AuthType
  protocolVersion: string
  serverType: string
  extensionsSupported: unknown
}

interface ServersState {
  servers: SavedServer[]
  /** Pick the fastest reachable saved server at start (e.g. LAN vs Tailscale). */
  autoSelectFastest: boolean
  setAutoSelectFastest: (value: boolean) => void
  upsert: (server: SavedServer) => void
  remove: (id: string) => void
  rename: (id: string, name: string) => void
}

export const useServersStore = create<ServersState>()(
  persist(
    (set) => ({
      servers: [],
      autoSelectFastest: false,
      setAutoSelectFastest: (autoSelectFastest) => set({ autoSelectFastest }),
      upsert: (server) =>
        set((s) => {
          const i = s.servers.findIndex(
            (x) =>
              x.id === server.id ||
              (x.url === server.url && x.username === server.username),
          )
          const servers = [...s.servers]
          if (i >= 0)
            servers[i] = { ...servers[i], ...server, id: servers[i].id }
          else servers.push(server)
          return { servers }
        }),
      remove: (id) =>
        set((s) => ({ servers: s.servers.filter((x) => x.id !== id) })),
      rename: (id, name) =>
        set((s) => ({
          servers: s.servers.map((x) => (x.id === id ? { ...x, name } : x)),
        })),
    }),
    { name: 'clearplay_servers' },
  ),
)

const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '')

export const defaultServerName = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** The server the app is connected to right now, as a SavedServer. */
export function currentServerSnapshot(): SavedServer | null {
  const d = useAppStore.getState().data
  if (!d.isServerConfigured || !d.url) return null
  return {
    id: `${d.username}@${d.url}`,
    name: defaultServerName(d.url),
    url: d.url,
    username: d.username,
    password: d.password,
    authType: d.authType as AuthType,
    protocolVersion: d.protocolVersion,
    serverType: d.serverType,
    extensionsSupported: d.extensionsSupported,
  }
}

/** Make sure the active server is in the saved list. */
export function rememberCurrentServer() {
  const snap = currentServerSnapshot()
  if (!snap) return
  const exists = useServersStore
    .getState()
    .servers.some((s) => s.url === snap.url && s.username === snap.username)
  if (!exists) useServersStore.getState().upsert(snap)
}

/** Verifies credentials (token auth first, then password) and returns a SavedServer. */
export async function verifyServer(
  rawUrl: string,
  username: string,
  password: string,
  name?: string,
): Promise<SavedServer | null> {
  const url = normalizeUrl(rawUrl)
  for (const authType of [AuthType.TOKEN, AuthType.PASSWORD]) {
    const token =
      authType === AuthType.TOKEN
        ? genPasswordToken(password)
        : genEncodedPassword(password)
    if (await pingServer(url, username, token, authType)) {
      const info = await queryServerInfo(url)
      return {
        id: `${username}@${url}`,
        name: name?.trim() || defaultServerName(url),
        url,
        username,
        password: token,
        authType,
        protocolVersion: info.protocolVersion,
        serverType: info.serverType,
        extensionsSupported: info.extensionsSupported,
      }
    }
  }
  return null
}

/** Round-trip time of a ping in ms, or null if unreachable within the timeout. */
export async function measureServer(server: SavedServer, timeoutMs = 3000) {
  const started = performance.now()
  const ok = await Promise.race([
    pingServer(
      server.url,
      server.username,
      server.password,
      server.authType,
      server.protocolVersion,
    ),
    new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs)),
  ]).catch(() => false)
  return ok ? Math.round(performance.now() - started) : null
}

/** Switches the app to a saved server and reloads so every view refetches. */
export function switchToServer(server: SavedServer) {
  rememberCurrentServer()
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
  // Let the persisted store flush before reloading.
  setTimeout(() => window.location.reload(), 150)
}

type ExtensionsResponse = SubsonicResponse & {
  openSubsonicExtensions?: { name: string; versions: number[] }[]
}

/**
 * Asks the active server again which OpenSubsonic extensions it has (they
 * change when the server is updated) and keeps the answer with that server.
 * If the server can't be reached, the saved list stays.
 */
export async function refreshServerExtensions() {
  const { url, username, isServerConfigured } = useAppStore.getState().data
  if (!isServerConfigured || !url) return
  const res = await httpClient<ExtensionsResponse>(
    '/getOpenSubsonicExtensions',
    { method: 'GET', signal: AbortSignal.timeout(8000) },
  )
  const list = res?.data?.openSubsonicExtensions
  if (res?.data?.status !== 'ok' || !Array.isArray(list)) return

  const map: Record<string, number[]> = {}
  for (const e of list) {
    if (e?.name) map[e.name] = Array.isArray(e.versions) ? e.versions : []
  }
  // The user may have switched server meanwhile.
  const now = useAppStore.getState().data
  if (now.url !== url || now.username !== username) return
  if (JSON.stringify(now.extensionsSupported) !== JSON.stringify(map)) {
    useAppStore.setState((state) => {
      state.data.extensionsSupported = map
    })
  }
  const saved = useServersStore
    .getState()
    .servers.find((s) => s.url === url && s.username === username)
  if (saved)
    useServersStore.getState().upsert({ ...saved, extensionsSupported: map })
}
