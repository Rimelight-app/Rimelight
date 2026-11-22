import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import {
  AlsaCard,
  activeStreamsOnSink,
  Caps,
  MixerControl,
  PulseSink,
  parseCards,
  parseHdaCodec,
  parseHwParams,
  parseMixer,
  parsePactlSinks,
  parsePcmInfo,
  parseUsbStream,
  pickVolumeControl,
} from './linux-parse'

const ASOUND = process.env.CLEARPLAY_ASOUND_ROOT || '/proc/asound'

function run(cmd: string, args: string[], timeout = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, encoding: 'utf8' }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

async function read(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

export type HwDevice = {
  card: AlsaCard
  device: number
  pcmName: string
  /** e.g. "hw:CARD=SIMGOT,DEV=0" */
  alsaName: string
  usb: boolean
}

/** Every ALSA playback device ("hw:") on this computer. */
export async function listHwDevices(): Promise<HwDevice[]> {
  const cards = parseCards(await read(`${ASOUND}/cards`))
  const out: HwDevice[] = []
  for (const card of cards) {
    let entries: string[] = []
    try {
      entries = await readdir(`${ASOUND}/card${card.index}`)
    } catch {
      continue
    }
    const pcms = entries
      .map((e) => e.match(/^pcm(\d+)p$/)?.[1])
      .filter((x): x is string => x !== undefined)
      .map(Number)
      .sort((a, b) => a - b)
    for (const device of pcms) {
      const info = parsePcmInfo(
        await read(`${ASOUND}/card${card.index}/pcm${device}p/info`),
      )
      out.push({
        card,
        device,
        pcmName: info.name || info.id,
        alsaName: `hw:CARD=${card.id},DEV=${device}`,
        usb: card.driver === 'USB-Audio' || entries.includes('stream0'),
      })
    }
  }
  return out
}

/** Rates and bit depths from the kernel's description of the device. */
export async function readCaps(dev: HwDevice): Promise<Caps | null> {
  const base = `${ASOUND}/card${dev.card.index}`
  const stream = await read(`${base}/stream${dev.device}`)
  if (stream) {
    const s = parseUsbStream(stream)
    if (s.rates.length) return { rates: s.rates, depths: s.depths }
  }
  let entries: string[] = []
  try {
    entries = await readdir(base)
  } catch {
    return null
  }
  const rates = new Set<number>()
  const depths = new Set<number>()
  for (const codec of entries.filter((e) => e.startsWith('codec#'))) {
    const c = parseHdaCodec(await read(`${base}/${codec}`))
    for (const r of c.rates) rates.add(r)
    for (const d of c.depths) depths.add(d)
  }
  if (!rates.size) return null
  return {
    rates: [...rates].sort((a, b) => a - b),
    depths: [...depths].sort((a, b) => a - b),
  }
}

export async function usbSpeed(dev: HwDevice): Promise<string | null> {
  const s = await read(`${ASOUND}/card${dev.card.index}/stream${dev.device}`)
  return s ? parseUsbStream(s).speed : null
}

/** What the device is really running at right now (null when closed). */
export async function readHwParams(dev: HwDevice) {
  return parseHwParams(
    await read(
      `${ASOUND}/card${dev.card.index}/pcm${dev.device}p/sub0/hw_params`,
    ),
  )
}

// ---- hardware volume (amixer from alsa-utils) ----

export async function findVolumeControl(
  dev: HwDevice,
): Promise<MixerControl | null> {
  try {
    const out = await run('amixer', [
      '-c',
      String(dev.card.index),
      '-M',
      'scontents',
    ])
    return pickVolumeControl(parseMixer(out))
  } catch {
    return null
  }
}

function controlArg(c: MixerControl) {
  return `${c.name},${c.index}`
}

/** Mapped (perceptual) level in percent, like a volume knob. */
export async function getMixerPercent(
  dev: HwDevice,
  c: MixerControl,
): Promise<{ percent: number | null; db: number | null }> {
  const out = await run('amixer', [
    '-c',
    String(dev.card.index),
    '-M',
    'sget',
    controlArg(c),
  ])
  const parsed = parseMixer(
    `Simple mixer control ${out.split('Simple mixer control ')[1] ?? ''}`,
  )
  const first = parsed[0]
  return { percent: first?.percent ?? null, db: first?.db ?? null }
}

export async function setMixerPercent(
  dev: HwDevice,
  c: MixerControl,
  percent: number,
) {
  const p = Math.max(0, Math.min(100, Math.round(percent)))
  await run('amixer', [
    '-q',
    '-c',
    String(dev.card.index),
    '-M',
    'sset',
    controlArg(c),
    `${p}%`,
    'unmute',
  ]).catch(() =>
    // Controls without a switch reject "unmute".
    run('amixer', [
      '-q',
      '-c',
      String(dev.card.index),
      '-M',
      'sset',
      controlArg(c),
      `${p}%`,
    ]),
  )
}

export async function setMixerDb(dev: HwDevice, c: MixerControl, db: number) {
  await run('amixer', [
    '-q',
    '-c',
    String(dev.card.index),
    'sset',
    controlArg(c),
    `${db}dB`,
  ])
}

// ---- PipeWire / PulseAudio (pactl), used to release an idle device ----

export async function pulseSinks(): Promise<PulseSink[]> {
  try {
    return parsePactlSinks(await run('pactl', ['-f', 'json', 'list', 'sinks']))
  } catch {
    return []
  }
}

export async function defaultSinkName(): Promise<string | null> {
  try {
    return (await run('pactl', ['get-default-sink'])).trim() || null
  } catch {
    return null
  }
}

export async function streamsPlayingOn(sink: PulseSink): Promise<number> {
  try {
    return activeStreamsOnSink(
      await run('pactl', ['-f', 'json', 'list', 'sink-inputs']),
      sink.index,
    )
  } catch {
    return 0
  }
}

export async function suspendSink(sink: PulseSink, suspend: boolean) {
  try {
    await run('pactl', ['suspend-sink', sink.name, suspend ? '1' : '0'])
    return true
  } catch {
    return false
  }
}
