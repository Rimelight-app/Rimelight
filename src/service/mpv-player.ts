import {
  isMpvSession,
  useBitPerfect,
  useMpvRuntime,
} from '@/store/bitperfect.store'
import { usePlayerStore } from '@/store/player.store'
import type { ISong } from '@/types/responses/song'
import {
  allowedRates,
  DevicePrefs,
  effectiveVolumeMode,
  pickOutputRate,
} from '@/utils/bitperfect'
import { isDesktop } from '@/utils/desktop'
import { logger } from '@/utils/logger'
import type {
  MpvDevice,
  MpvEventPayload,
  MpvLoadRequest,
  MpvOutputState,
} from '../../electron/preload/types'

/**
 * Renderer side of the mpv engine. MpvMediaElement stands in for the <audio>
 * element (the player, progress bar, queue sync and lyrics only use play,
 * pause, currentTime, duration, volume and the usual events), and the
 * controller below decides the device, rate and volume for each load.
 */

type LoadOptions = {
  url: string
  start: number
  paused: boolean
  song: ISong | null
  loop: boolean
  speed: number
}

let current: MpvMediaElement | null = null

/** For the automated tests (window.__cp). */
export const currentMpvElement = () =>
  current
    ? {
        src: current.src,
        paused: current.paused,
        time: current.currentTime,
        duration: current.duration,
      }
    : null

function api() {
  return window.api.mpv
}

/** Called once before the app renders. */
export async function initMpvEngine() {
  if (!isDesktop() || !window.api?.mpv) return
  try {
    const status = await api().status()
    useMpvRuntime.getState().set({ status })
  } catch (e) {
    logger.error('[mpv] status failed', e)
    return
  }
  if (!isMpvSession()) {
    // Back on the built-in engine: give it its own volume back.
    const { builtinVolume, set } = useBitPerfect.getState()
    if (builtinVolume !== null) {
      usePlayerStore.getState().actions.setVolume(builtinVolume)
      set({ builtinVolume: null })
    }
    return
  }
  const bp = useBitPerfect.getState()
  if (bp.builtinVolume === null) {
    bp.set({ builtinVolume: usePlayerStore.getState().playerState.volume })
  }
  api().onEvent(onEvent)
  refreshDevices().then(() => syncSliderToDevice())
}

function onEvent(ev: MpvEventPayload) {
  switch (ev.type) {
    case 'output':
      onOutput(ev.output)
      break
    case 'caps':
      useBitPerfect.getState().setDevice(ev.key, { caps: ev.caps })
      break
    case 'devices':
      refreshDevices()
      break
    default:
      break
  }
  current?.handle(ev)
}

export async function refreshDevices(): Promise<MpvDevice[]> {
  try {
    const list = await api().devices()
    useMpvRuntime.getState().set({ deviceList: list })
    return list
  } catch (e) {
    logger.error('[mpv] devices failed', e)
    return useMpvRuntime.getState().deviceList
  }
}

function deviceKind(key: string): MpvDevice['kind'] {
  const d = useMpvRuntime.getState().deviceList.find((x) => x.key === key)
  if (d) return d.kind
  if (key.startsWith('bt:')) return 'bluetooth'
  if (key === 'system' || key.startsWith('mpv:')) return 'shared'
  return 'exclusive'
}

/** The device to play on: the saved one if it is connected. */
function activeDeviceKey(): string {
  const { device } = useBitPerfect.getState()
  const list = useMpvRuntime.getState().deviceList
  if (!list.length || list.some((d) => d.key === device)) return device
  return 'system'
}

/** Reads (or checks) what the device supports; first use of a device. */
export async function ensureCaps(key: string, force = false) {
  if (deviceKind(key) !== 'exclusive') return
  const prefs = useBitPerfect.getState().devices[key]
  if (prefs?.caps && !force) return
  useMpvRuntime.getState().set({ checking: key })
  try {
    const caps = await api().caps(key, force)
    if (caps) {
      useBitPerfect.getState().setDevice(key, {
        caps: {
          ...caps,
          // Windows learns about the volume control on first playback.
          hwVolume: caps.hwVolume ?? prefs?.caps?.hwVolume ?? null,
        },
        ...(force ? { learnedUnsupported: [] } : {}),
      })
    }
  } catch (e) {
    logger.error('[mpv] caps failed', e)
  } finally {
    useMpvRuntime.getState().set({ checking: null })
  }
}

/** Devices whose saved level was applied this session. */
const levelApplied = new Set<string>()

async function buildRequest(o: LoadOptions): Promise<MpvLoadRequest> {
  // A saved device that was not connected may be back (USB DAC plugged in).
  const { device } = useBitPerfect.getState()
  if (!useMpvRuntime.getState().deviceList.some((d) => d.key === device)) {
    await refreshDevices()
  }
  const key = activeDeviceKey()
  const kind = deviceKind(key)
  await ensureCaps(key)
  const prefs = useBitPerfect.getState().devices[key]
  const mode = effectiveVolumeMode(prefs, kind)
  const slider = usePlayerStore.getState().playerState.volume
  const songRate = o.song?.samplingRate ?? 0
  const samplerate =
    kind === 'exclusive' && o.song
      ? pickOutputRate(songRate, allowedRates(prefs))
      : 0
  const quietStart = kind === 'exclusive' && !prefs?.started && mode !== 'fixed'

  return {
    url: o.url,
    start: o.start,
    paused: o.paused,
    deviceKey: key,
    samplerate,
    softVolume: mode === 'app' ? slider : 100,
    // The saved level once per device and session; after that the device
    // keeps whatever it is set to (its own buttons, the system mixer).
    hwVolume:
      mode === 'hardware' && !levelApplied.has(key)
        ? (prefs?.level ?? null)
        : null,
    quietStart,
    loop: o.loop,
    speed: o.speed,
  }
}

function onOutput(out: MpvOutputState) {
  useMpvRuntime.getState().set({ output: out })
  const bp = useBitPerfect.getState()
  const prefs = bp.devices[out.deviceKey]
  const patch: Parameters<typeof bp.setDevice>[1] = {}
  if (out.exclusive) patch.started = true
  if (out.exclusive) levelApplied.add(out.deviceKey)
  if (
    out.hwVolume !== null &&
    prefs?.caps &&
    prefs.caps.hwVolume !== out.hwVolume
  ) {
    patch.caps = { ...prefs.caps, hwVolume: out.hwVolume }
  }
  // Learn rates the device would not run at (it played converted).
  if (
    out.exclusive &&
    out.requestedRate === 0 &&
    out.source &&
    out.output &&
    out.source.rate !== out.output.rate &&
    !(prefs?.learnedUnsupported ?? []).includes(out.source.rate)
  ) {
    patch.learnedUnsupported = [
      ...(prefs?.learnedUnsupported ?? []),
      out.source.rate,
    ]
  }
  const kind = deviceKind(out.deviceKey)
  const merged: DevicePrefs = Object.assign(
    { disabledRates: [], learnedUnsupported: [] },
    prefs,
    patch,
  )
  const mode = effectiveVolumeMode(merged, kind)
  let level: number | null = null
  if (mode === 'hardware' && out.hwLevel !== null) level = out.hwLevel
  else if (mode === 'app') level = out.softVolume
  else if (mode === 'fixed') level = 100
  if (level !== null) {
    patch.level = level
    setSliderQuietly(level)
  }
  if (Object.keys(patch).length) bp.setDevice(out.deviceKey, patch)
}

let lastApplied: { key: string; value: number } | null = null

/** Moves the volume slider without sending the value back to the device. */
function setSliderQuietly(level: number) {
  lastApplied = { key: activeDeviceKey(), value: Math.round(level) }
  usePlayerStore.getState().actions.setVolume(Math.round(level))
}

/** The slider's level for the selected device. */
export function syncSliderToDevice() {
  const key = activeDeviceKey()
  const prefs = useBitPerfect.getState().devices[key]
  const mode = effectiveVolumeMode(prefs, deviceKind(key))
  if (mode === 'fixed') setSliderQuietly(100)
  else if (prefs?.level !== undefined) setSliderQuietly(prefs.level)
}

let hwBusy = false
let hwNext: { key: string; value: number } | null = null

async function pushHwVolume() {
  if (hwBusy || !hwNext) return
  hwBusy = true
  const { key, value } = hwNext
  hwNext = null
  try {
    await api().setHwVolume(key, value)
  } catch (e) {
    logger.error('[mpv] hw volume', e)
  }
  hwBusy = false
  if (hwNext) pushHwVolume()
}

/** The volume slider moved (0-100). */
export function applyVolume(value: number) {
  const key = activeDeviceKey()
  const v = Math.round(value)
  if (lastApplied && lastApplied.key === key && lastApplied.value === v) return
  lastApplied = { key, value: v }
  const bp = useBitPerfect.getState()
  const prefs = bp.devices[key]
  const mode = effectiveVolumeMode(prefs, deviceKind(key))
  if (mode === 'fixed') return
  bp.setDevice(key, { level: v })
  if (mode === 'hardware') {
    hwNext = { key, value: v }
    pushHwVolume()
    return
  }
  api().setSoftVolume(v)
  const out = useMpvRuntime.getState().output
  if (out && out.deviceKey === key) {
    useMpvRuntime.getState().set({ output: { ...out, softVolume: v } })
  }
}

/** Plays on another output; the current song continues there. */
export async function selectDevice(key: string, name: string) {
  useBitPerfect.getState().set({ device: key, deviceName: name })
  lastApplied = null
  levelApplied.delete(key)
  await ensureCaps(key)
  syncSliderToDevice()
  current?.reloadHere()
}

/** Checks the device again (after replugging, or a changed setting). */
export async function recheckDevice(key: string) {
  await ensureCaps(key, true)
  if (key === activeDeviceKey()) current?.reloadHere()
}

/** Reloads the playing song with the current settings (e.g. rate limits). */
export function reloadCurrent() {
  current?.reloadHere()
}

const RELEASE_AFTER_PAUSE_MS = 60_000

/**
 * Stand-in for HTMLAudioElement backed by mpv. Only one is attached at a
 * time (the player shows one source at a time).
 */
export class MpvMediaElement extends EventTarget {
  private _src = ''
  private _time = 0
  private _duration = Number.NaN
  private _paused = true
  private _volume = 1
  private _loop = false
  private _rate = 1
  private loadSeq = 0
  private mainToken = -1
  private loaded = false
  private released = false
  private pendingSeek: number | null = null
  private releaseTimer: number | undefined
  private restarts = 0
  song: ISong | null = null
  /** Radio: every play starts the live stream again. */
  live = false
  /** Where a new source starts (resumed progress). */
  getStart: () => number = () => 0

  get src() {
    return this._src
  }

  set src(url: string) {
    if (url === this._src) return
    this._src = url
    this.load()
  }

  get currentTime() {
    return this._time
  }

  set currentTime(t: number) {
    if (!Number.isFinite(t)) return
    if (!this.loaded) {
      this.pendingSeek = t
      return
    }
    if (Math.abs(t - this._time) < 0.25) return
    this._time = t
    api().seek(t)
    this.dispatchEvent(new Event('timeupdate'))
    this.dispatchEvent(new Event('seeked'))
  }

  get duration() {
    return this._duration
  }

  get paused() {
    return this._paused
  }

  get volume() {
    return this._volume
  }

  set volume(v: number) {
    this._volume = v
    applyVolume(v * 100)
  }

  get loop() {
    return this._loop
  }

  set loop(v: boolean) {
    if (v === this._loop) return
    this._loop = v
    api().setLoop(v)
  }

  get playbackRate() {
    return this._rate
  }

  set playbackRate(v: number) {
    if (v === this._rate) return
    this._rate = v
    api().setSpeed(v)
  }

  set defaultPlaybackRate(_v: number) {}

  get readyState() {
    return this.loaded ? 4 : 0
  }

  async load(start?: number) {
    const seq = ++this.loadSeq
    current = this
    this.loaded = false
    this.released = false
    this.pendingSeek = null
    window.clearTimeout(this.releaseTimer)
    this._time = start ?? this.getStart()
    this._duration = Number.NaN
    // A new song: the old output line no longer applies.
    if (start === undefined) useMpvRuntime.getState().set({ output: null })
    this.dispatchEvent(new Event('loadstart'))
    if (!this._src) {
      await api().stop()
      return
    }
    const req = await buildRequest({
      url: this._src,
      start: this._time,
      paused: this._paused,
      song: this.song,
      loop: this._loop,
      speed: this._rate,
    })
    if (seq !== this.loadSeq) return
    try {
      const token = await api().load(req)
      if (seq === this.loadSeq) this.mainToken = token
    } catch (e) {
      logger.error('[mpv] load failed', e)
      if (seq === this.loadSeq) this.dispatchEvent(new Event('error'))
    }
  }

  /** Same song, same position, current device and settings. */
  reloadHere() {
    if (!this._src) return
    this.load(this._time)
  }

  play(): Promise<void> {
    window.clearTimeout(this.releaseTimer)
    const wasPaused = this._paused
    this._paused = false
    if (this.live && wasPaused && this.loaded) {
      this.load(0)
    } else if (this.released) {
      this.load(this._time)
    } else {
      api().setPause(false)
    }
    if (wasPaused) this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  }

  pause() {
    const wasPaused = this._paused
    this._paused = true
    if (this.loaded) api().setPause(true)
    if (!wasPaused) this.dispatchEvent(new Event('pause'))
    // Give the device back to other apps after a long pause.
    window.clearTimeout(this.releaseTimer)
    this.releaseTimer = window.setTimeout(() => {
      if (!this._paused || current !== this || !this.loaded) return
      this.released = true
      this.loaded = false
      api().stop()
    }, RELEASE_AFTER_PAUSE_MS)
  }

  /** The component is going away (queue cleared, other media type). */
  detach() {
    window.clearTimeout(this.releaseTimer)
    this.loadSeq++
    this._src = ''
    this.loaded = false
    if (current === this) {
      current = null
      api().stop()
      useMpvRuntime.getState().set({ output: null })
    }
  }

  handle(ev: MpvEventPayload) {
    if (current !== this) return
    switch (ev.type) {
      case 'time':
        if (!this.loaded) return
        this._time = ev.time
        this.dispatchEvent(new Event('timeupdate'))
        break
      case 'duration':
        this._duration = ev.duration
        if (this.loaded) this.dispatchEvent(new Event('durationchange'))
        break
      case 'loaded': {
        if (ev.token !== this.mainToken) {
          // The reply to load() may come after the event.
          if (this.mainToken !== -1 && ev.token < this.mainToken) return
          this.mainToken = ev.token
        }
        this.loaded = true
        this.restarts = 0
        if (!Number.isFinite(this._duration))
          this._duration = Number.POSITIVE_INFINITY
        this.dispatchEvent(new Event('loadedmetadata'))
        const seek = this.pendingSeek
        this.pendingSeek = null
        if (seek !== null && Math.abs(seek - this._time) >= 0.5) {
          this._time = seek
          api().seek(seek)
        }
        if (this._paused) api().setPause(true)
        else api().setPause(false)
        break
      }
      case 'ended':
        if (!this.loaded) return
        this.loaded = false
        this.dispatchEvent(new Event('ended'))
        break
      case 'error':
        this.dispatchEvent(new Event('error'))
        break
      case 'released':
        this.released = true
        this.loaded = false
        if (!this._paused) this.load(this._time)
        break
      case 'exit':
        // mpv stopped unexpectedly: start it again where we were.
        this.released = true
        this.loaded = false
        if (!this._paused && this.restarts < 3) {
          this.restarts++
          this.load(this._time)
        }
        break
      default:
        break
    }
  }
}
