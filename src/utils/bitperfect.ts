import type {
  MpvDeviceCaps,
  MpvOutputState,
} from '../../electron/preload/types'

/**
 * Decisions for bit-perfect playback (mpv engine). Pure functions, tested in
 * tools/dev-rig/bitperfect-unit.mjs.
 */

export const isFamily441 = (rate: number) => rate > 0 && rate % 11025 === 0

/**
 * The rate to send a song at. 0 = its own rate (supported or unknown).
 * Otherwise the closest rate the device takes, staying in the same family
 * (88.2/176.4 kHz to a 44.1 kHz multiple, 96/192 kHz to a 48 kHz multiple):
 * the highest one not above the song's rate, else the lowest above it. With no
 * rate of that family, the lowest rate at or above the song's, else the
 * highest the device has.
 */
export function pickOutputRate(songRate: number, allowed: number[]): number {
  if (!songRate || !allowed.length) return 0
  if (allowed.includes(songRate)) return 0
  const sorted = [...allowed].sort((a, b) => a - b)
  const family = sorted.filter((r) => isFamily441(r) === isFamily441(songRate))
  if (family.length) {
    const below = family.filter((r) => r < songRate)
    if (below.length) return below[below.length - 1]
    return family[0]
  }
  const above = sorted.find((r) => r >= songRate)
  return above ?? sorted[sorted.length - 1]
}

export type DevicePrefs = {
  caps?: MpvDeviceCaps
  /** Rates switched off by hand (outputs that claim more than they play). */
  disabledRates: number[]
  /** Rates the device turned out not to run at. */
  learnedUnsupported: number[]
  /** 'hardware' needs a hardware control; undefined = not chosen yet. */
  volumeMode?: VolumeMode
  /** Last level of the volume slider on this device (0-100). */
  level?: number
  /** The quiet first start has happened. */
  started?: boolean
}

export type VolumeMode = 'hardware' | 'fixed' | 'app'

export function allowedRates(prefs: DevicePrefs | undefined): number[] {
  const rates = prefs?.caps?.rates ?? []
  return rates.filter(
    (r) =>
      !(prefs?.disabledRates ?? []).includes(r) &&
      !(prefs?.learnedUnsupported ?? []).includes(r),
  )
}

/** The volume mode in effect: hardware when the device has a control. */
export function effectiveVolumeMode(
  prefs: DevicePrefs | undefined,
  kind: 'exclusive' | 'bluetooth' | 'shared',
): VolumeMode {
  if (kind !== 'exclusive') return 'app'
  const hw = prefs?.caps?.hwVolume
  if (prefs?.volumeMode === 'hardware') return hw === false ? 'app' : 'hardware'
  if (prefs?.volumeMode) return prefs.volumeMode
  return hw ? 'hardware' : 'app'
}

export const formatKhz = (rate: number) => {
  const khz = rate / 1000
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`
}

export type OutputKind =
  | 'idle'
  | 'bitperfect'
  | 'converted'
  | 'lossy'
  | 'appvolume'
  | 'busy'
  | 'refused'
  | 'bluetooth'
  | 'shared'

export type OutputLine = {
  kind: OutputKind
  /** Full sentence, e.g. "Converted to 48 kHz for this device". */
  text: string
  /** For the player bar, next to the song's own rate and depth. */
  short: string
  bitPerfect: boolean
}

type SongLike = { bitDepth?: number; samplingRate?: number } | null | undefined

const isLossyFormat = (format: string) => /^(float|double)/.test(format)

/** The current song's path to the device, in plain words. */
export function describeOutput(
  out: MpvOutputState | null,
  song: SongLike,
): OutputLine {
  if (!out || !out.output) {
    return { kind: 'idle', text: 'Not playing', short: '', bitPerfect: false }
  }
  const srcRate = out.source?.rate || song?.samplingRate || 0
  const outRate = out.output.rate
  const srcBits = song?.bitDepth || (out.source?.bits === 16 ? 16 : 0)
  const outBits = out.output.bits

  if (out.bluetooth) {
    return {
      kind: 'bluetooth',
      text: 'Bluetooth · re-encoded',
      short: 'Bluetooth · re-encoded',
      bitPerfect: false,
    }
  }
  if (out.fallback === 'busy') {
    return {
      kind: 'busy',
      text: 'Not bit-perfect: device busy',
      short: 'Not bit-perfect: device busy',
      bitPerfect: false,
    }
  }
  if (out.fallback === 'refused') {
    return {
      kind: 'refused',
      text: 'Not bit-perfect: exclusive mode refused',
      short: 'Not bit-perfect: exclusive mode refused',
      bitPerfect: false,
    }
  }
  if (!out.exclusive) {
    return {
      kind: 'shared',
      text: 'Not bit-perfect: system mixer',
      short: 'Not bit-perfect: system mixer',
      bitPerfect: false,
    }
  }
  if (srcRate && outRate && srcRate !== outRate) {
    return {
      kind: 'converted',
      text: `Converted to ${formatKhz(outRate)} for this device`,
      short: `Converted to ${formatKhz(outRate)}`,
      bitPerfect: false,
    }
  }
  if (srcBits && outBits && outBits < srcBits) {
    return {
      kind: 'converted',
      text: `Converted to ${outBits}-bit for this device`,
      short: `Converted to ${outBits}-bit`,
      bitPerfect: false,
    }
  }
  if (out.softVolume < 100) {
    return {
      kind: 'appvolume',
      text: `Not bit-perfect: app volume · ${formatKhz(outRate)}`,
      short: 'Not bit-perfect: app volume',
      bitPerfect: false,
    }
  }
  if (out.source && isLossyFormat(out.source.format)) {
    return {
      kind: 'lossy',
      text: `Direct · ${formatKhz(outRate)} · lossy source`,
      short: 'Direct · lossy source',
      bitPerfect: false,
    }
  }
  const bits = srcBits || outBits
  return {
    kind: 'bitperfect',
    text: `Bit-perfect · ${formatKhz(outRate)}${bits ? ` · ${bits}-bit` : ''}`,
    short: 'Bit-perfect',
    bitPerfect: true,
  }
}

/** Rates (from a device's caps) as "44.1, 48, 96 kHz". */
export function formatRates(rates: number[]): string {
  if (!rates.length) return ''
  return `${rates
    .map((r) => {
      const k = r / 1000
      return Number.isInteger(k) ? String(k) : k.toFixed(1)
    })
    .join(', ')} kHz`
}
