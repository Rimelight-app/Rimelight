import { ISong } from '@/types/responses/song'

const LOSSLESS = new Set([
  'flac',
  'alac',
  'wav',
  'aiff',
  'aif',
  'ape',
  'wv',
  'dsf',
  'dff',
])

export interface AudioQuality {
  format: string
  details: string[]
  lossless: boolean
  hiRes: boolean
}

/** File quality as reported by the server: format, bit depth, sample rate, bitrate. */
export function getAudioQuality(song: ISong): AudioQuality {
  const suffix = (song.suffix ?? '').toLowerCase()
  const lossless = LOSSLESS.has(suffix)
  const details: string[] = []

  if (song.bitDepth) details.push(`${song.bitDepth}-bit`)
  if (song.samplingRate) {
    const khz = song.samplingRate / 1000
    details.push(`${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`)
  }
  if (song.bitRate) details.push(`${song.bitRate} kbps`)

  const hiRes =
    lossless && ((song.bitDepth ?? 0) > 16 || (song.samplingRate ?? 0) > 48000)

  return { format: suffix.toUpperCase() || '—', details, lossless, hiRes }
}
