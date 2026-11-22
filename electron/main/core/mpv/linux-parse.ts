/**
 * Parsers for Linux ALSA text files and tools (pure functions, unit-tested in
 * tools/dev-rig/bitperfect-unit.mjs).
 */

export type AlsaCard = {
  index: number
  /** Short id, e.g. "SIMGOT" (stable between boots, used in hw:CARD=...). */
  id: string
  driver: string
  name: string
  longName: string
}

/** /proc/asound/cards */
export function parseCards(text: string): AlsaCard[] {
  const cards: AlsaCard[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(\d+)\s+\[([^\]]+)\]:\s*(.*?)\s+-\s+(.*)$/)
    if (!m) continue
    cards.push({
      index: Number(m[1]),
      id: m[2].trim(),
      driver: m[3].trim(),
      name: m[4].trim(),
      longName: (lines[i + 1] ?? '').trim(),
    })
  }
  return cards
}

/** /proc/asound/cardN/pcmMp/info -> name of the playback device. */
export function parsePcmInfo(text: string): { id: string; name: string } {
  const id = text.match(/^id:\s*(.*)$/m)?.[1]?.trim() ?? ''
  const name = text.match(/^name:\s*(.*)$/m)?.[1]?.trim() ?? ''
  return { id, name }
}

export const STANDARD_RATES = [
  44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000,
]

export type Caps = {
  rates: number[]
  depths: number[]
}

function depthOfFormat(format: string, bits?: number): number | null {
  const f = format.toUpperCase()
  if (bits && bits > 0) return bits
  if (f.startsWith('S16') || f.startsWith('U16')) return 16
  if (f.startsWith('S24') || f.startsWith('U24')) return 24
  if (f.startsWith('S32') || f.startsWith('U32')) return 32
  if (f.startsWith('FLOAT')) return 32
  return null
}

function parseRates(line: string): number[] {
  // "44100, 48000, 96000" or "8000 - 192000 (continuous)"
  const range = line.match(/(\d+)\s*-\s*(\d+)/)
  if (range) {
    const lo = Number(range[1])
    const hi = Number(range[2])
    return STANDARD_RATES.filter((r) => r >= lo && r <= hi)
  }
  return (line.match(/\d+/g) ?? []).map(Number).filter((r) => r >= 8000)
}

export type UsbStream = Caps & {
  /** "full", "high" or "super" USB speed when the file says so. */
  speed: string | null
  running: boolean
  /** "Momentary freq" while running. */
  momentaryRate: number | null
}

/**
 * /proc/asound/cardN/stream0 (USB audio). Only the Playback section counts;
 * every altset lists its format and rates.
 */
export function parseUsbStream(text: string): UsbStream {
  const head = text.split('\n')[0] ?? ''
  const speed = head.match(/,\s*(full|high|super|low)\s+speed/i)?.[1] ?? null
  const playback = text.split(/^Capture:/m)[0].split(/^Playback:/m)[1] ?? ''
  const rates = new Set<number>()
  const depths = new Set<number>()
  // Blocks start with "Interface N" (one per altset).
  const blocks = playback.split(/^\s*Interface\s+\d+\s*$/m).slice(1)
  for (const block of blocks) {
    const format = block.match(/Format:\s*(\S+)/)?.[1] ?? ''
    const bits = Number(block.match(/Bits:\s*(\d+)/)?.[1] ?? 0)
    const channels = Number(block.match(/Channels:\s*(\d+)/)?.[1] ?? 2)
    if (channels < 2) continue
    const d = format ? depthOfFormat(format, bits) : null
    if (d) depths.add(d)
    const rateLine = block.match(/Rates:\s*(.*)/)?.[1]
    if (rateLine) for (const r of parseRates(rateLine)) rates.add(r)
  }
  const running = /Status:\s*Running/.test(playback)
  const momentary = playback.match(/Momentary freq\s*=\s*(\d+)\s*Hz/)
  return {
    rates: [...rates].sort((a, b) => a - b),
    depths: [...depths].sort((a, b) => a - b),
    speed: speed ? speed.toLowerCase() : null,
    running,
    momentaryRate: momentary ? Number(momentary[1]) : null,
  }
}

/**
 * /proc/asound/cardN/codec#M (HD Audio). The PCM lines of the analog/digital
 * output converters list rates and bits. Approximate: the controller can limit
 * them further, which shows up later as a converted rate.
 */
export function parseHdaCodec(text: string): Caps {
  const rates = new Set<number>()
  const depths = new Set<number>()
  const nodes = text.split(/^Node 0x/m).slice(1)
  for (const node of nodes) {
    if (!/\[Audio Output\]/.test(node.split('\n')[0])) continue
    const pcm = node.match(
      /PCM:\s*\n\s*rates \[[^\]]*\]:\s*([^\n]*)\n\s*bits \[[^\]]*\]:\s*([^\n]*)/,
    )
    if (!pcm) continue
    for (const r of pcm[1].match(/\d+/g) ?? []) {
      const n = Number(r)
      if (n >= 44100) rates.add(n)
    }
    for (const b of pcm[2].match(/\d+/g) ?? []) {
      const n = Number(b)
      if (n === 16 || n === 24 || n === 32) depths.add(n)
    }
  }
  return {
    rates: [...rates].sort((a, b) => a - b),
    depths: [...depths].sort((a, b) => a - b),
  }
}

/** /proc/asound/cardN/pcmMp/sub0/hw_params while the device is open. */
export function parseHwParams(
  text: string,
): { format: string; rate: number; channels: number; bits: number } | null {
  if (!text || /closed/.test(text)) return null
  const format = text.match(/^format:\s*(\S+)/m)?.[1] ?? ''
  const rate = Number(text.match(/^rate:\s*(\d+)/m)?.[1] ?? 0)
  const channels = Number(text.match(/^channels:\s*(\d+)/m)?.[1] ?? 0)
  if (!format || !rate) return null
  return { format, rate, channels, bits: depthOfFormat(format) ?? 0 }
}

export type MixerControl = {
  name: string
  index: number
  canVolume: boolean
  hasDb: boolean
  /** Mapped (perceptual) percent, as amixer -M reports it. */
  percent: number | null
  db: number | null
}

/** Output of `amixer -c X -M scontents`. */
export function parseMixer(text: string): MixerControl[] {
  const controls: MixerControl[] = []
  const blocks = text.split(/^Simple mixer control /m).slice(1)
  for (const block of blocks) {
    const head = block.match(/^'(.*)',(\d+)/)
    if (!head) continue
    const caps = block.match(/Capabilities:\s*(.*)/)?.[1] ?? ''
    const canVolume = /(^|\s)(pvolume|volume)(\s|$)/.test(caps)
    const levels = [
      ...block.matchAll(
        /:\s*Playback\s+-?\d+\s+\[(\d+)%\](?:\s+\[(-?[\d.]+)dB\])?/g,
      ),
    ]
    const first = levels[0]
    controls.push({
      name: head[1],
      index: Number(head[2]),
      canVolume,
      hasDb: levels.some((l) => l[2] !== undefined),
      percent: first ? Number(first[1]) : null,
      db: first?.[2] !== undefined ? Number(first[2]) : null,
    })
  }
  return controls
}

const PREFERRED_CONTROLS = [
  'Master',
  'PCM',
  'Speaker',
  'Headphone',
  'Headphones',
  'Digital',
  'Front',
]

/** The control that sets the device's own output level, if any. */
export function pickVolumeControl(
  controls: MixerControl[],
): MixerControl | null {
  const usable = controls.filter(
    (c) => c.canVolume && !/capture|mic|input|boost|beep/i.test(c.name),
  )
  if (!usable.length) return null
  for (const name of PREFERRED_CONTROLS) {
    const c = usable.find((u) => u.name.toLowerCase() === name.toLowerCase())
    if (c) return c
  }
  return usable[0]
}

export type PulseSink = {
  index: number
  name: string
  description: string
  card: number | null
  bus: string
  api: string
  state: string
}

/** `pactl -f json list sinks` */
export function parsePactlSinks(json: string): PulseSink[] {
  try {
    const list = JSON.parse(json) as Array<{
      index: number
      name: string
      description: string
      state?: string
      properties?: Record<string, string>
    }>
    return list.map((s) => {
      const p = s.properties ?? {}
      const card = p['alsa.card'] ?? p['api.alsa.card']
      return {
        index: s.index,
        name: s.name,
        description: s.description,
        card: card !== undefined && card !== '' ? Number(card) : null,
        bus: p['device.bus'] ?? '',
        api: p['device.api'] ?? '',
        state: String(s.state ?? ''),
      }
    })
  } catch {
    return []
  }
}

/** `pactl -f json list sink-inputs`: streams that are playing on a sink. */
export function activeStreamsOnSink(json: string, sinkIndex: number): number {
  try {
    const list = JSON.parse(json) as Array<{ sink: number; corked?: boolean }>
    return list.filter((s) => s.sink === sinkIndex && !s.corked).length
  } catch {
    return 0
  }
}
