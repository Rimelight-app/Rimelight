import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ScrobbleKind = 'nowPlaying' | 'listen'
export type ScrobbleStatus = 'sent' | 'queued' | 'failed'

export interface ScrobbleLogEntry {
  id: string
  title: string
  artist: string
  kind: ScrobbleKind
  status: ScrobbleStatus
  at: number
}

export interface PendingListen {
  id: string
  title: string
  artist: string
  time: number
  attempts: number
}

interface ScrobbleState {
  enabled: boolean
  setEnabled: (value: boolean) => void
  log: ScrobbleLogEntry[]
  addLog: (entry: ScrobbleLogEntry) => void
  pending: PendingListen[]
  setPending: (pending: PendingListen[]) => void
}

/** Scrobble preferences, a short activity log and listens waiting to be sent. */
export const useScrobbleStore = create<ScrobbleState>()(
  persist(
    (set) => ({
      enabled: true,
      setEnabled: (enabled) => set({ enabled }),
      log: [],
      addLog: (entry) => set((s) => ({ log: [entry, ...s.log].slice(0, 15) })),
      pending: [],
      setPending: (pending) => set({ pending: pending.slice(-500) }),
    }),
    { name: 'clearplay_scrobble' },
  ),
)
