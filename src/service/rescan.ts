import { del } from 'idb-keyval'
import { queryClient } from '@/lib/queryClient'
import { subsonic } from '@/service/subsonic'
import { useAppStore } from '@/store/app.store'
import { usePlayerStore } from '@/store/player.store'

const POLL_MS = 1500
const MAX_WAIT_MS = 30 * 60 * 1000

const isScanning = (value: unknown) => value === true || value === 'true'
const toCount = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export type RescanResult =
  | { ok: true; before: number | null; after: number | null }
  | { ok: false }

/**
 * Asks the server (Navidrome, or "This computer") to scan for new and changed
 * files, waits until the scan ends, then refreshes every list in the app and
 * the lyrics: the current song's saved lyrics are dropped and fetched again,
 * and lyrics looked up earlier (e.g. "no lyrics" for a song that now has an
 * .lrc file) are fetched again the next time they are shown.
 */
export async function rescanLibrary(): Promise<RescanResult> {
  const before = await subsonic.library.getScanStatus().catch(() => undefined)
  const started = await subsonic.library.startScan().catch(() => undefined)
  // Navidrome answers with an error (no scanStatus) for non-admin users.
  if (!started) return { ok: false }

  const startedAt = Date.now()
  let status = started
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS))
    const next = await subsonic.library.getScanStatus().catch(() => undefined)
    if (!next) continue
    status = next
    if (!isScanning(next.scanning)) break
  }

  await refreshAfterScan()

  return {
    ok: true,
    before: toCount(before?.count),
    after: toCount(status?.count),
  }
}

async function refreshAfterScan() {
  const { currentSong } = usePlayerStore.getState().songlist
  if (currentSong?.title) {
    // Same key scheme as service/lyrics.ts (artist:title:type:source).
    const keys = ['synced', 'plain'].flatMap((type) =>
      ['internal', 'external'].map((source) =>
        ['lyrics', currentSong.artist, currentSong.title, type, source].join(
          ':',
        ),
      ),
    )
    await Promise.all(keys.map((k) => del(k).catch(() => undefined)))
  }

  useAppStore.setState((state) => {
    state.data.songCount = null
  })
  await queryClient.invalidateQueries()
}
