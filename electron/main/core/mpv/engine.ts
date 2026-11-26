import { BrowserWindow, ipcMain } from 'electron'
import {
  AudioEngine,
  IpcChannels,
  MpvAudioParams,
  MpvDevice,
  MpvDeviceCaps,
  MpvEventPayload,
  MpvLoadRequest,
  MpvOutputState,
} from '../../../preload/types'
import { localLibraryOrigin } from '../local-library'
import { httpOrigin, isAllowedMpvUrl } from '../safe-url'
import { MpvClient, MpvEvent, stopLeftoverMpv } from './client'
import { engineStatus, findMpvBinary, probeMpv, saveEngine } from './config'
import {
  findVolumeControl,
  getMixerPercent,
  HwDevice,
  listHwDevices,
  pulseSinks,
  readCaps,
  readHwParams,
  setMixerDb,
  setMixerPercent,
  streamsPlayingOn,
  suspendSink,
  usbSpeed,
} from './linux-audio'
import { MixerControl, PulseSink, STANDARD_RATES } from './linux-parse'
import { bluetoothEndpointIds, looksLikeBluetooth } from './windows-audio'

/** Origin of the server the renderer is signed in to (songs come from it). */
let serverOrigin = ''

/** Quiet first level: about -40 dB. */
const QUIET_DB = -40
/** mpv's volume is cubic: (22/100)^3 = 0.0106, about -39.5 dB. */
const QUIET_SOFT_VOLUME = 22
/** Windows endpoint volume (Windows' own audio-taper scale, percent). */
const QUIET_WINDOWS_LEVEL = 6

type Spec = {
  key: string
  name: string
  /** Value for mpv's audio-device. */
  device: string
  exclusive: boolean
  bluetooth: boolean
  hw: HwDevice | null
  wasapi: boolean
}

type Applied = {
  device: string
  exclusive: boolean
  samplerate: number
}

/**
 * Test rig only (tools/dev-rig): "alsa/hw:CARD=SIMGOT,DEV=0=null;auto=null"
 * plays those devices on mpv's null output, which runs in real time.
 */
const deviceMap = new Map(
  (process.env.RIMELIGHT_MPV_DEVICE_MAP ?? '')
    .split(';')
    .map((pair) => {
      const i = pair.lastIndexOf('=')
      return [pair.slice(0, i), pair.slice(i + 1)] as [string, string]
    })
    .filter(([a, b]) => a && b),
)
const mapDevice = (device: string) => deviceMap.get(device) ?? device

const isLinux = process.platform === 'linux'
const isWindows = process.platform === 'win32'

const bitsOfFormat = (f: string) => {
  if (/^(s|u)16/.test(f)) return 16
  if (/^(s|u)24/.test(f)) return 24
  if (/^(s|u)32/.test(f) || f === 'float') return 32
  if (f === 'double') return 64
  return 0
}

function toParams(p: unknown): MpvAudioParams | null {
  if (!p || typeof p !== 'object') return null
  const o = p as Record<string, unknown>
  const rate = Number(o.samplerate ?? 0)
  if (!rate) return null
  const format = String(o.format ?? '')
  return {
    rate,
    format,
    channels: Number(o['channel-count'] ?? 0),
    bits: bitsOfFormat(format),
  }
}

function classifyFailure(lines: string[]): 'busy' | 'refused' | 'other' {
  const text = lines.join('\n')
  if (/busy|in use|DEVICE_IN_USE|0x8889000a/i.test(text)) return 'busy'
  if (/EXCLUSIVE_MODE_NOT_ALLOWED|0x8889000e|exclusive/i.test(text))
    return 'refused'
  return 'other'
}

class MpvEngine {
  private client: MpvClient | null = null
  private starting: Promise<MpvClient> | null = null
  private window: BrowserWindow | null = null
  private gen = 0
  private applied: Applied | null = null
  private spec: Spec | null = null
  private output: MpvOutputState | null = null
  private logs: string[] = []
  private lastTimeSent = 0
  private loaded = false
  private suspendedSink: PulseSink | null = null
  private deviceCache: {
    at: number
    list: MpvDevice[]
    specs: Map<string, Spec>
  } | null = null
  private mixers = new Map<string, MixerControl | null>()
  private probing = new Map<string, Promise<MpvDeviceCaps | null>>()

  attach(window: BrowserWindow) {
    this.window = window
  }

  private emit(event: MpvEventPayload) {
    const w = this.window
    if (!w || w.isDestroyed()) return
    w.webContents.send(IpcChannels.MpvEvent, event)
  }

  private async ensure(): Promise<MpvClient> {
    if (this.client?.running) return this.client
    if (this.starting) return this.starting
    const binary = findMpvBinary()
    if (!binary) throw new Error('mpv not found')
    this.starting = (async () => {
      const client = new MpvClient(binary, [
        '--audio-display=no',
        '--replaygain=no',
        '--volume=100',
        '--volume-max=100',
        '--audio-pitch-correction=yes',
        '--cache=yes',
        '--demuxer-max-bytes=64MiB',
        '--msg-level=all=warn',
      ])
      client.on('event', (ev: MpvEvent) => this.onEvent(ev))
      client.on('property', (name: string, data: unknown) =>
        this.onProperty(name, data),
      )
      client.on('exit', () => {
        if (this.client === client) {
          this.client = null
          this.applied = null
          this.loaded = false
          this.emit({ type: 'exit' })
        }
      })
      await client.start()
      await client.command('request_log_messages', 'warn')
      for (const p of ['time-pos', 'duration', 'pause', 'audio-out-params'])
        await client.observe(p)
      this.client = client
      return client
    })()
    try {
      return await this.starting
    } finally {
      this.starting = null
    }
  }

  private onEvent(ev: MpvEvent) {
    if (ev.event === 'log-message') {
      const line = `[${ev.prefix}] ${String(ev.text ?? '').trim()}`
      this.logs.push(line)
      if (this.logs.length > 40) this.logs.shift()
      return
    }
    if (ev.event === 'end-file' && this.loaded) {
      if (ev.reason === 'eof') {
        this.loaded = false
        this.emit({ type: 'ended' })
      } else if (ev.reason === 'error') {
        this.loaded = false
        this.emit({ type: 'error', message: String(ev.file_error ?? 'error') })
      }
    }
    if (ev.event === 'seek' || ev.event === 'playback-restart') {
      this.lastTimeSent = 0
    }
  }

  private onProperty(name: string, data: unknown) {
    if (!this.loaded) return
    if (name === 'time-pos' && typeof data === 'number') {
      const now = Date.now()
      if (now - this.lastTimeSent < 200) return
      this.lastTimeSent = now
      this.emit({ type: 'time', time: data })
    } else if (name === 'duration' && typeof data === 'number') {
      this.emit({ type: 'duration', duration: data })
    } else if (name === 'pause' && typeof data === 'boolean') {
      this.emit({ type: 'pause', paused: data })
    }
  }

  // ---------------- devices ----------------

  async devices(force = false): Promise<MpvDevice[]> {
    if (!force && this.deviceCache && Date.now() - this.deviceCache.at < 3000)
      return this.deviceCache.list
    const specs = new Map<string, Spec>()
    const list: MpvDevice[] = []
    const add = (d: MpvDevice, s: Spec) => {
      if (specs.has(d.key)) return
      specs.set(d.key, s)
      list.push(d)
    }
    add(
      { key: 'system', name: 'System default', kind: 'shared', detail: '' },
      {
        key: 'system',
        name: 'System default',
        device: 'auto',
        exclusive: false,
        bluetooth: false,
        hw: null,
        wasapi: false,
      },
    )

    let mpvList: Array<{ name: string; description: string }> = []
    try {
      const client = await this.ensure()
      mpvList = ((await client.get('audio-device-list')) ??
        []) as typeof mpvList
    } catch {
      mpvList = []
    }

    if (isLinux) {
      const hw = await listHwDevices()
      const multi = new Map<number, number>()
      for (const d of hw)
        multi.set(d.card.index, (multi.get(d.card.index) ?? 0) + 1)
      for (const d of hw) {
        const speed = d.usb ? await usbSpeed(d) : null
        const name =
          (multi.get(d.card.index) ?? 1) > 1
            ? `${d.card.name} · ${d.pcmName}`
            : d.card.name
        const detail = d.usb
          ? `USB${speed ? ` · ${speed} speed` : ''}`
          : /hdmi|displayport/i.test(d.pcmName)
            ? 'HDMI'
            : d.card.driver
        const key = `alsa:${d.alsaName}`
        add(
          { key, name, kind: 'exclusive', detail },
          {
            key,
            name,
            device: `alsa/${d.alsaName}`,
            exclusive: true,
            bluetooth: false,
            hw: d,
            wasapi: false,
          },
        )
      }
      // Bluetooth comes through PipeWire / PulseAudio only.
      const seen = new Set<string>()
      for (const e of mpvList) {
        const m = e.name.match(/^(pipewire|pulse)\/(bluez_\S+)/)
        if (!m || seen.has(m[2])) continue
        if (
          m[1] === 'pulse' &&
          mpvList.some((x) => x.name === `pipewire/${m[2]}`)
        )
          continue
        seen.add(m[2])
        const key = `bt:${m[2]}`
        const name = e.description || m[2]
        add(
          { key, name, kind: 'bluetooth', detail: 'Bluetooth' },
          {
            key,
            name,
            device: e.name,
            exclusive: false,
            bluetooth: true,
            hw: null,
            wasapi: false,
          },
        )
      }
    } else if (isWindows) {
      const bt = await bluetoothEndpointIds()
      for (const e of mpvList) {
        const m = e.name.match(/^wasapi\/(.+)$/)
        if (!m) continue
        const id = m[1]
        const bluetooth =
          bt.has(id.toLowerCase()) || looksLikeBluetooth(e.description)
        const key = `wasapi:${id}`
        add(
          {
            key,
            name: e.description || id,
            kind: bluetooth ? 'bluetooth' : 'exclusive',
            detail: bluetooth ? 'Bluetooth' : '',
          },
          {
            key,
            name: e.description || id,
            device: e.name,
            exclusive: !bluetooth,
            bluetooth,
            hw: null,
            wasapi: true,
          },
        )
      }
    } else {
      for (const e of mpvList) {
        if (e.name === 'auto') continue
        const key = `mpv:${e.name}`
        add(
          { key, name: e.description || e.name, kind: 'shared', detail: '' },
          {
            key,
            name: e.description || e.name,
            device: e.name,
            exclusive: false,
            bluetooth: false,
            hw: null,
            wasapi: false,
          },
        )
      }
    }
    this.deviceCache = { at: Date.now(), list, specs }
    return list
  }

  private async specFor(key: string): Promise<Spec> {
    let spec = this.deviceCache?.specs.get(key)
    if (!spec) {
      await this.devices(true)
      spec = this.deviceCache?.specs.get(key)
    }
    // A device that is gone plays on the system default.
    return spec ?? (this.deviceCache?.specs.get('system') as Spec)
  }

  /** Where a Linux hw device plays when Rimelight can't hold it alone. */
  private async sharedDeviceFor(spec: Spec): Promise<string> {
    if (!spec.hw) return 'auto'
    const sinks = await pulseSinks()
    const sink = sinks.find((s) => s.card === spec.hw?.card.index)
    if (!sink) return 'auto'
    const list = ((await this.client?.tryGet('audio-device-list')) ??
      []) as Array<{
      name: string
    }>
    if (list.some((d) => d.name === `pipewire/${sink.name}`))
      return `pipewire/${sink.name}`
    if (list.some((d) => d.name === `pulse/${sink.name}`))
      return `pulse/${sink.name}`
    return 'auto'
  }

  private async mixerFor(spec: Spec): Promise<MixerControl | null> {
    if (!spec.hw) return null
    if (this.mixers.has(spec.key)) return this.mixers.get(spec.key) ?? null
    const c = await findVolumeControl(spec.hw)
    this.mixers.set(spec.key, c)
    return c
  }

  // ---------------- capabilities ----------------

  caps(key: string, force = false): Promise<MpvDeviceCaps | null> {
    const running = this.probing.get(key)
    if (running && !force) return running
    const p = this.readOrProbeCaps(key).finally(() => this.probing.delete(key))
    this.probing.set(key, p)
    return p
  }

  private async readOrProbeCaps(key: string): Promise<MpvDeviceCaps | null> {
    const spec = await this.specFor(key)
    if (!spec.exclusive) {
      return {
        rates: [],
        depths: [],
        hwVolume: false,
        volumeControl: null,
        source: 'none',
      }
    }
    if (spec.hw) {
      this.mixers.delete(spec.key)
      const mixer = await this.mixerFor(spec)
      const kernel = await readCaps(spec.hw)
      if (kernel) {
        const caps: MpvDeviceCaps = {
          ...kernel,
          hwVolume: mixer !== null,
          volumeControl: mixer?.name ?? null,
          source: 'kernel',
        }
        this.emit({ type: 'caps', key, caps })
        return caps
      }
      const probed = await this.probe(spec)
      if (!probed) return null
      const caps = {
        ...probed,
        hwVolume: mixer !== null,
        volumeControl: mixer?.name ?? null,
      }
      this.emit({ type: 'caps', key, caps })
      return caps
    }
    const probed = await this.probe(spec)
    if (probed) this.emit({ type: 'caps', key, caps: probed })
    return probed
  }

  /**
   * Opens the device with silence at each standard rate (in a separate mpv)
   * and keeps the rates it really runs at. The device must be free.
   */
  private async probe(spec: Spec): Promise<MpvDeviceCaps | null> {
    const binary = findMpvBinary()
    if (!binary) return null
    // The player itself holds this device: let it go while checking.
    if (this.applied?.device === spec.device && this.loaded) {
      await this.release()
      this.emit({ type: 'released' })
    }
    const probe = new MpvClient(binary, [
      `--audio-device=${mapDevice(spec.device)}`,
      `--audio-exclusive=${spec.wasapi ? 'yes' : 'no'}`,
      '--volume=100',
      '--msg-level=all=error',
      '--pause=no',
    ])
    const rates = new Set<number>()
    const depths = new Set<number>()
    let hwVolume: boolean | null = null
    try {
      await probe.start()
      await probe.observe('audio-out-params')
      for (const rate of STANDARD_RATES) {
        const result = await new Promise<MpvAudioParams | null>((resolve) => {
          const timer = setTimeout(() => done(null), 3000)
          const done = (v: MpvAudioParams | null) => {
            clearTimeout(timer)
            probe.off('event', onEvent)
            probe.off('property', onProp)
            resolve(v)
          }
          const onEvent = (ev: MpvEvent) => {
            if (ev.event === 'end-file' && ev.reason === 'error') done(null)
          }
          const onProp = (name: string, data: unknown) => {
            if (name === 'audio-out-params' && data) done(toParams(data))
          }
          probe.on('event', onEvent)
          probe.on('property', onProp)
          probe
            .command(
              'loadfile',
              `av://lavfi:anullsrc=r=${rate}:cl=stereo,aformat=sample_fmts=s32`,
            )
            .catch(() => done(null))
        })
        if (result && result.rate === rate) {
          rates.add(rate)
          if (result.bits >= 24) depths.add(24)
          depths.add(16)
        }
        if (result && spec.wasapi && hwVolume === null) {
          hwVolume = (await probe.tryGet<number>('ao-volume')) !== undefined
        }
        await probe.command('stop').catch(() => {})
      }
    } catch {
      // mpv failed: unknown
    } finally {
      await probe.stop()
    }
    if (!rates.size) return null
    return {
      rates: [...rates].sort((a, b) => a - b),
      depths: [...depths].sort((a, b) => a - b),
      hwVolume,
      volumeControl: null,
      source: 'probe',
    }
  }

  // ---------------- playback ----------------

  async load(req: MpvLoadRequest): Promise<number> {
    if (
      !isAllowedMpvUrl(req.url, req.kind === 'stream' ? 'stream' : 'song', [
        serverOrigin,
        localLibraryOrigin(),
      ])
    ) {
      console.warn('[mpv] refused to load', String(req.url).slice(0, 200))
      throw new Error('mpv: source not allowed')
    }
    const token = ++this.gen
    const client = await this.ensure()
    const spec = await this.specFor(req.deviceKey)
    this.loaded = false

    // Leaving a device: give a suspended PipeWire sink back.
    if (this.spec && this.spec.key !== spec.key) await this.resumeSink()
    this.spec = spec

    let fallback: MpvOutputState['fallback'] = null
    let exclusive = spec.exclusive
    let device = spec.device

    let result = await this.open(client, token, req, device, exclusive, spec)
    if (token !== this.gen || result === 'stream') return token

    if (result === 'busy' && spec.hw && !this.suspendedSink) {
      // PipeWire keeps an idle device open for a few seconds; ask it to let
      // go when nothing else is playing on it, then try again.
      const sink = (await pulseSinks()).find(
        (s) => s.card === spec.hw?.card.index,
      )
      if (
        sink &&
        (await streamsPlayingOn(sink)) === 0 &&
        (await suspendSink(sink, true))
      ) {
        this.suspendedSink = sink
        await new Promise((r) => setTimeout(r, 250))
        result = await this.open(client, token, req, device, exclusive, spec)
        if (token !== this.gen || result === 'stream') return token
      }
    }
    if (
      result === 'busy' ||
      result === 'refused' ||
      (result === 'other' && exclusive)
    ) {
      fallback = result === 'refused' ? 'refused' : 'busy'
      exclusive = false
      device = spec.hw ? await this.sharedDeviceFor(spec) : spec.device
      await this.resumeSink()
      result = await this.open(client, token, req, device, false, spec)
      if (token !== this.gen || result === 'stream') return token
    }
    if (result !== 'ok') {
      this.emit({
        type: 'error',
        message: 'audio output initialization failed',
      })
      return token
    }

    // Sound can start: set the device level first.
    const { hwVolume, hwLevel, hwDb, softVolume } = await this.applyStartVolume(
      client,
      spec,
      exclusive,
      req,
    )
    if (token !== this.gen) return token

    if (req.start > 0) {
      await client.command('seek', req.start, 'absolute+exact').catch(() => {})
    }
    const duration = await client.tryGet<number>('duration')
    if (token !== this.gen) return token
    if (typeof duration === 'number') this.emit({ type: 'duration', duration })
    this.loaded = true
    this.emit({ type: 'loaded', token })
    if (!req.paused) await client.set('pause', false)
    else this.emit({ type: 'pause', paused: true })

    this.output = {
      deviceKey: spec.key,
      deviceName: spec.name,
      exclusive,
      fallback,
      bluetooth: spec.bluetooth,
      source: toParams(await client.tryGet('audio-params')),
      output: null,
      requestedRate: req.samplerate,
      softVolume,
      hwVolume,
      hwLevel,
      hwDb,
    }
    this.output.output = await this.readOutputParams(client, spec, exclusive)
    if (token !== this.gen) return token
    this.emit({ type: 'output', output: this.output })
    return token
  }

  /** Loads the file paused on the given device; reports if the device opened. */
  private async open(
    client: MpvClient,
    token: number,
    req: MpvLoadRequest,
    device: string,
    exclusive: boolean,
    spec: Spec,
  ): Promise<'ok' | 'busy' | 'refused' | 'other' | 'stream' | 'stale'> {
    const want: Applied = { device, exclusive, samplerate: req.samplerate }
    const same =
      this.applied &&
      this.applied.device === want.device &&
      this.applied.exclusive === want.exclusive &&
      this.applied.samplerate === want.samplerate
    await client.set('pause', true)
    if (!same) {
      // Close the device before changing how it is opened.
      await client.command('stop').catch(() => {})
      await client.set('audio-device', mapDevice(device))
      if (spec.wasapi || isWindows)
        await client.set('audio-exclusive', exclusive)
      await client.set('audio-samplerate', req.samplerate)
      this.applied = want
    }
    await client.set('volume', Math.max(0, Math.min(100, req.softVolume)))
    await client.set('loop-file', req.loop ? 'inf' : 'no')
    await client.set('speed', req.speed > 0 ? req.speed : 1)
    this.logs = []

    const outcome = new Promise<'ok' | 'failed'>((resolve) => {
      let settled = false
      const timer = setTimeout(() => finish('failed'), 20000)
      const finish = (v: 'ok' | 'failed') => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        client.off('event', onEvent)
        client.off('property', onProp)
        resolve(v)
      }
      const onProp = (name: string, data: unknown) => {
        if (name === 'audio-out-params' && data) finish('ok')
      }
      const onEvent = (ev: MpvEvent) => {
        if (ev.event === 'end-file' && ev.reason === 'error') finish('failed')
        if (ev.event === 'playback-restart') {
          // The output may have stayed open from the last song.
          client
            .tryGet('audio-out-params')
            .then((p) => {
              if (p) finish('ok')
            })
            .catch(() => {})
        }
      }
      client.on('event', onEvent)
      client.on('property', onProp)
    })
    try {
      await client.command('loadfile', req.url, 'replace')
    } catch {
      return 'other'
    }
    const r = await outcome
    if (token !== this.gen) return 'stale'
    if (r === 'ok') return 'ok'
    this.applied = null
    // A stream that fails for other reasons (network, file) is reported as is.
    const kind = classifyFailure(this.logs)
    if (kind === 'other' && !this.logs.some((l) => /\[ao/.test(l))) {
      this.emit({ type: 'error', message: this.logs.at(-1) ?? 'load failed' })
      return 'stream'
    }
    return kind
  }

  private async applyStartVolume(
    client: MpvClient,
    spec: Spec,
    exclusive: boolean,
    req: MpvLoadRequest,
  ) {
    let hwVolume: boolean | null = null
    let hwLevel: number | null = null
    let hwDb: number | null = null
    let softVolume = req.softVolume

    if (exclusive && spec.hw) {
      const mixer = await this.mixerFor(spec)
      hwVolume = mixer !== null
      if (mixer) {
        try {
          if (req.quietStart) {
            if (mixer.hasDb) await setMixerDb(spec.hw, mixer, QUIET_DB)
            else await setMixerPercent(spec.hw, mixer, 10)
          } else if (req.hwVolume !== null) {
            await setMixerPercent(spec.hw, mixer, req.hwVolume)
          }
          const now = await getMixerPercent(spec.hw, mixer)
          hwLevel = now.percent
          hwDb = now.db
        } catch {
          // amixer missing or failed
        }
      }
    } else if (exclusive && spec.wasapi) {
      const level = await client.tryGet<number>('ao-volume')
      hwVolume = level !== undefined
      if (hwVolume) {
        if (req.quietStart)
          await client.set('ao-volume', QUIET_WINDOWS_LEVEL).catch(() => {})
        else if (req.hwVolume !== null)
          await client.set('ao-volume', req.hwVolume).catch(() => {})
        const now = await client.tryGet<number>('ao-volume')
        hwLevel = typeof now === 'number' ? Math.round(now) : null
      }
    }
    if (req.quietStart && !hwVolume) {
      softVolume = QUIET_SOFT_VOLUME
      await client.set('volume', softVolume)
    }
    return { hwVolume, hwLevel, hwDb, softVolume }
  }

  private async readOutputParams(
    client: MpvClient,
    spec: Spec,
    exclusive: boolean,
  ): Promise<MpvAudioParams | null> {
    const fromMpv = toParams(await client.tryGet('audio-out-params'))
    if (!(exclusive && spec.hw)) return fromMpv
    // The kernel knows what the device really runs at.
    for (let i = 0; i < 10; i++) {
      const hw = await readHwParams(spec.hw)
      if (hw) {
        return {
          rate: hw.rate,
          format: hw.format,
          channels: hw.channels,
          bits: hw.bits,
        }
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    return fromMpv
  }

  async setPause(paused: boolean) {
    if (!this.client?.running) return
    await this.client.set('pause', paused).catch(() => {})
    if (!paused && this.output?.exclusive && this.spec?.hw) {
      // Confirm what the device runs at once sound flows.
      const out = await this.readOutputParams(this.client, this.spec, true)
      if (out && this.output) {
        this.output = { ...this.output, output: out }
        this.emit({ type: 'output', output: this.output })
      }
    }
  }

  async seek(seconds: number) {
    if (!this.client?.running || !this.loaded) return
    await this.client
      .command('seek', Math.max(0, seconds), 'absolute+exact')
      .catch(() => {})
  }

  /** Stops playback and closes the device. */
  async release() {
    this.gen++
    this.loaded = false
    if (this.client?.running) await this.client.command('stop').catch(() => {})
    this.applied = null
    this.output = null
    await this.resumeSink()
  }

  private async resumeSink() {
    const sink = this.suspendedSink
    if (!sink) return
    this.suspendedSink = null
    await suspendSink(sink, false)
  }

  async setSoftVolume(volume: number) {
    if (!this.client?.running) return
    const v = Math.max(0, Math.min(100, volume))
    await this.client.set('volume', v).catch(() => {})
    if (this.output) this.output = { ...this.output, softVolume: v }
  }

  /** Sets the device's own volume; returns the level it reports back. */
  async setHwVolume(key: string, percent: number): Promise<number | null> {
    const spec = await this.specFor(key)
    if (spec.hw) {
      const mixer = await this.mixerFor(spec)
      if (!mixer) return null
      try {
        await setMixerPercent(spec.hw, mixer, percent)
        return (await getMixerPercent(spec.hw, mixer)).percent
      } catch {
        return null
      }
    }
    if (spec.wasapi && this.client?.running && this.spec?.key === key) {
      try {
        await this.client.set('ao-volume', Math.max(0, Math.min(100, percent)))
        const now = await this.client.tryGet<number>('ao-volume')
        return typeof now === 'number' ? Math.round(now) : null
      } catch {
        return null
      }
    }
    return null
  }

  async setLoop(loop: boolean) {
    await this.client?.set('loop-file', loop ? 'inf' : 'no').catch(() => {})
  }

  async setSpeed(speed: number) {
    await this.client?.set('speed', speed > 0 ? speed : 1).catch(() => {})
  }

  async shutdown() {
    await this.resumeSink()
    await this.client?.stop()
    this.client = null
  }
}

export const mpvEngine = new MpvEngine()

const handlers: Array<[IpcChannels, (...args: never[]) => unknown]> = []

export function setupMpvIpc(window: BrowserWindow) {
  mpvEngine.attach(window)
  if (handlers.length) return
  stopLeftoverMpv()

  const handle = <A extends unknown[]>(
    channel: IpcChannels,
    fn: (...args: A) => unknown,
  ) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (_e, ...args) => fn(...(args as A)))
    handlers.push([channel, fn as never])
  }

  handle(IpcChannels.MpvStatus, () => engineStatus())
  handle(IpcChannels.MpvProbe, () => probeMpv())
  handle(IpcChannels.MpvSetEngine, async (engine: AudioEngine) => {
    saveEngine(engine === 'mpv' ? 'mpv' : 'builtin')
    // Switching: know whether mpv works before Settings offers the restart.
    return probeMpv()
  })
  handle(IpcChannels.MpvDevices, () => mpvEngine.devices(true))
  handle(IpcChannels.MpvCaps, (key: string, force?: boolean) =>
    mpvEngine.caps(key, force),
  )
  handle(IpcChannels.MpvLoad, (req: MpvLoadRequest) => mpvEngine.load(req))
  ipcMain.removeAllListeners(IpcChannels.MpvSetServerUrl)
  ipcMain.on(IpcChannels.MpvSetServerUrl, (_e, url: unknown) => {
    serverOrigin = typeof url === 'string' ? httpOrigin(url) : ''
  })
  handle(IpcChannels.MpvSetPause, (paused: boolean) =>
    mpvEngine.setPause(paused),
  )
  handle(IpcChannels.MpvSeek, (s: number) => mpvEngine.seek(s))
  handle(IpcChannels.MpvStop, () => mpvEngine.release())
  handle(IpcChannels.MpvSetSoftVolume, (v: number) =>
    mpvEngine.setSoftVolume(v),
  )
  handle(IpcChannels.MpvSetHwVolume, (key: string, p: number) =>
    mpvEngine.setHwVolume(key, p),
  )
  handle(IpcChannels.MpvSetLoop, (loop: boolean) => mpvEngine.setLoop(loop))
  handle(IpcChannels.MpvSetSpeed, (speed: number) => mpvEngine.setSpeed(speed))
}
