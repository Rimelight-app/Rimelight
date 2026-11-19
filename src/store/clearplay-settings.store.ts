import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type StreamFormat = 'opus' | 'mp3' | 'aac'
export type LyricsSize = 's' | 'm' | 'l'
export type BackdropMode = 'off' | 'dim' | 'normal' | 'vivid'
export type StartPage = '/' | '/library/albums' | '/search' | '/stats'

interface ClearPlaySettings {
  /** '0' = original quality, otherwise a kbps cap the server transcodes to. */
  maxBitRate: string
  streamFormat: StreamFormat
  showQuality: boolean
  lyricsSize: LyricsSize
  backdrop: BackdropMode
  startPage: StartPage
  /** Save the queue to the server so other apps (e.g. Symfonium) can continue it. */
  syncQueue: boolean
  /** Add similar songs when the queue is about to run out. */
  autoDj: boolean
  /** Spectrum visualizer on the Now Playing page. */
  visualizer: boolean
  set: (patch: Partial<Omit<ClearPlaySettings, 'set'>>) => void
}

export const useClearPlaySettings = create<ClearPlaySettings>()(
  persist(
    (set) => ({
      maxBitRate: '0',
      streamFormat: 'opus',
      showQuality: true,
      lyricsSize: 'm',
      backdrop: 'normal',
      startPage: '/',
      syncQueue: false,
      autoDj: false,
      visualizer: false,
      set: (patch) => set(patch),
    }),
    { name: 'clearplay_settings' },
  ),
)
