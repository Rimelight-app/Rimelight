import { useEffect } from 'react'
import { useAppStore } from '@/store/app.store'
import {
  measureServer,
  rememberCurrentServer,
  switchToServer,
  useServersStore,
} from '@/store/servers.store'

const CHECKED = 'clearplay_fastest_checked'

/**
 * Remembers the active server, and when "use the fastest server" is on, pings
 * every saved server for the same user once per launch and moves to the
 * quickest one (e.g. home LAN instead of Tailscale).
 */
export function ServerObserver() {
  useEffect(() => {
    rememberCurrentServer()
    const { autoSelectFastest, servers } = useServersStore.getState()
    const { url, username } = useAppStore.getState().data
    if (!autoSelectFastest || servers.length < 2) return
    if (sessionStorage.getItem(CHECKED)) return
    sessionStorage.setItem(CHECKED, '1')

    const candidates = servers.filter((s) => s.username === username)
    Promise.all(
      candidates.map(async (s) => ({ s, ms: await measureServer(s, 2500) })),
    ).then((results) => {
      const best = results
        .filter((r) => r.ms !== null)
        .sort((a, b) => (a.ms as number) - (b.ms as number))[0]
      if (best && best.s.url !== url) switchToServer(best.s)
    })
  }, [])
  return null
}
