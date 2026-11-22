import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type DevicePrefs, effectiveVolumeMode } from '@/utils/bitperfect'
import type {
  MpvDevice,
  MpvEngineStatus,
  MpvOutputState,
} from '../../electron/preload/types'

const emptyPrefs = (): DevicePrefs => ({
  disabledRates: [],
  learnedUnsupported: [],
})

export type OutputInfoPlacement = 'settings' | 'player'

interface BitPerfectSettings {
  /** Output for the mpv engine ("system" = system default). */
  device: string
  deviceName: string
  /** Where the output info is shown. */
  placement: OutputInfoPlacement
  /** Per device: what it supports, rate limits, volume. */
  devices: Record<string, DevicePrefs>
  /** The built-in engine's volume, kept while the mpv engine runs. */
  builtinVolume: number | null
  set: (patch: Partial<Omit<BitPerfectSettings, 'set' | 'setDevice'>>) => void
  setDevice: (key: string, patch: Partial<DevicePrefs>) => void
}

export const useBitPerfect = create<BitPerfectSettings>()(
  persist(
    (set) => ({
      device: 'system',
      deviceName: '',
      placement: 'settings',
      devices: {},
      builtinVolume: null,
      set: (patch) => set(patch),
      setDevice: (key, patch) =>
        set((s) => ({
          devices: {
            ...s.devices,
            [key]: { ...emptyPrefs(), ...s.devices[key], ...patch },
          },
        })),
    }),
    { name: 'clearplay_bitperfect' },
  ),
)

interface MpvRuntime {
  status: MpvEngineStatus | null
  output: MpvOutputState | null
  deviceList: MpvDevice[]
  checking: string | null
  set: (patch: Partial<Omit<MpvRuntime, 'set'>>) => void
}

/** Live state of the mpv engine (not saved). */
export const useMpvRuntime = create<MpvRuntime>()((set) => ({
  status: null,
  output: null,
  deviceList: [],
  checking: null,
  set: (patch) => set(patch),
}))

/** This session plays through mpv (decided at launch). */
export const isMpvSession = () =>
  useMpvRuntime.getState().status?.sessionEngine === 'mpv'

export const useIsMpvSession = () =>
  useMpvRuntime((s) => s.status?.sessionEngine === 'mpv')

/**
 * mpv engine with fixed volume on the active device: the loudness is set on
 * the device or amp, so the volume controls are locked.
 */
export const useVolumeFixed = () => {
  const mpv = useIsMpvSession()
  const list = useMpvRuntime((s) => s.deviceList)
  const key = useBitPerfect((s) => s.device)
  const prefs = useBitPerfect((s) => s.devices[s.device])
  if (!mpv) return false
  const device = list.find((d) => d.key === key)
  if (!device) return false
  return effectiveVolumeMode(prefs, device.kind) === 'fixed'
}
