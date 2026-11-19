import { useAudioFx } from '@/store/audio-fx.store'

type Device = Pick<MediaDeviceInfo, 'deviceId' | 'label'>

/**
 * Picks the device id to play on from the saved choice. Chromium gives
 * output devices new ids between launches (the app is loaded from a file, so
 * it has no stable origin to key them on), so a saved id alone does not
 * survive a restart. The device name is saved too and used to find it again.
 * Returns '' for the system default.
 */
export function pickOutputDevice(
  devices: Device[],
  savedId: string,
  savedLabel: string,
): string {
  if (!savedId || savedId === 'default') return ''
  if (devices.some((d) => d.deviceId === savedId)) return savedId
  if (savedLabel) {
    const byName = devices.find((d) => d.label === savedLabel)
    if (byName) return byName.deviceId
  }
  // Not connected right now: play on the default, keep the saved choice.
  return ''
}

export async function listOutputDevices(): Promise<MediaDeviceInfo[]> {
  try {
    const all = (await navigator.mediaDevices?.enumerateDevices()) ?? []
    return all.filter((d) => d.kind === 'audiooutput')
  } catch {
    return []
  }
}

/**
 * The id to pass to setSinkId for the saved choice. When the device was
 * found under a new id, the saved id is updated (the name stays).
 */
export async function resolveOutputDevice(): Promise<string> {
  const { outputDevice, outputDeviceLabel, set } = useAudioFx.getState()
  if (!outputDevice || outputDevice === 'default') return ''
  const devices = await listOutputDevices()
  const id = pickOutputDevice(devices, outputDevice, outputDeviceLabel)
  if (id && id !== outputDevice) set({ outputDevice: id })
  return id
}
