import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const EQ_BANDS = [
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const

export const EQ_PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  treble: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  vocal: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1],
  loudness: [5, 4, 2, 0, -1, -1, 0, 2, 4, 5],
  rock: [4, 3, 2, 0, -1, 0, 2, 3, 4, 4],
  electronic: [5, 4, 1, 0, -2, 1, 0, 2, 4, 5],
  acoustic: [3, 3, 2, 1, 1, 1, 2, 2, 2, 1],
  hiphop: [5, 4, 2, 3, -1, -1, 1, 0, 2, 3],
  night: [-3, -2, -1, 0, 1, 2, 2, 1, -1, -3],
}

interface AudioFxState {
  eqEnabled: boolean
  eqGains: number[]
  eqPreset: string
  preamp: number
  mono: boolean
  speed: number
  outputDevice: string
  /** Name of the chosen device, to find it again when its id changes. */
  outputDeviceLabel: string
  set: (patch: Partial<Omit<AudioFxState, 'set' | 'applyPreset'>>) => void
  applyPreset: (name: string) => void
}

/** Equalizer, preamp, mono, speed and output device. */
export const useAudioFx = create<AudioFxState>()(
  persist(
    (set) => ({
      eqEnabled: false,
      eqGains: [...EQ_PRESETS.flat],
      eqPreset: 'flat',
      preamp: 0,
      mono: false,
      speed: 1,
      outputDevice: 'default',
      outputDeviceLabel: '',
      set: (patch) => set(patch),
      applyPreset: (name) =>
        set({
          eqPreset: name,
          eqGains: [...(EQ_PRESETS[name] ?? EQ_PRESETS.flat)],
        }),
    }),
    { name: 'clearplay_audio_fx' },
  ),
)

interface SleepState {
  /** epoch ms when playback should stop, or 'track' to stop after the current song */
  until: number | 'track' | null
  set: (until: number | 'track' | null) => void
}

export const useSleepTimer = create<SleepState>()((set) => ({
  until: null,
  set: (until) => set({ until }),
}))
