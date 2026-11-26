import { execFile, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { is } from '@electron-toolkit/utils'
import { app } from 'electron'
import { AudioEngine, MpvEngineStatus } from '../../../preload/types'
import { RimelightStore } from '../store'

const engineStore = new RimelightStore<{ engine: AudioEngine }>({
  name: 'audio-engine',
  defaults: { engine: 'builtin' },
})

export function savedEngine(): AudioEngine {
  const e = engineStore.get('engine')
  return e === 'mpv' ? 'mpv' : 'builtin'
}

export function saveEngine(engine: AudioEngine) {
  engineStore.set('engine', engine)
}

/** Where mpv is: bundled on Windows, the user's own on Linux. */
export function findMpvBinary(): string | null {
  const override = process.env.RIMELIGHT_MPV
  if (override) return existsSync(override) ? override : null

  if (process.platform === 'win32') {
    const base = is.dev ? app.getAppPath() : process.resourcesPath
    const bundled = path.join(base, 'resources', 'mpv', 'mpv.exe')
    return existsSync(bundled) ? bundled : null
  }

  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  for (const dir of [...dirs, '/usr/bin', '/usr/local/bin', '/bin']) {
    const candidate = path.join(dir, 'mpv')
    if (existsSync(candidate)) return candidate
  }
  return null
}

function platformName(): MpvEngineStatus['platform'] {
  const p = process.platform
  return p === 'linux' || p === 'win32' || p === 'darwin' ? p : 'other'
}

type Probe = Pick<MpvEngineStatus, 'available' | 'version' | 'problem'>

function missing(): Probe {
  return {
    available: false,
    version: null,
    problem:
      process.platform === 'win32'
        ? 'mpv is missing from this installation. Reinstall Rimelight.'
        : 'mpv is not installed. Install it (Fedora: sudo dnf install mpv) and restart Rimelight.',
  }
}

/** Reads `mpv --version` output into a probe result. */
function readVersion(
  error: Error | null | undefined,
  status: number | null,
  stdout: string,
  stderr: string,
): Probe {
  const first = (stdout ?? '').split('\n')[0] ?? ''
  const m = first.match(/^mpv\s+v?([\w.\-+]+)/)
  if (error || status !== 0 || !m) {
    return {
      available: false,
      version: null,
      problem: `mpv could not start (${error?.message ?? (stderr || first || 'no output').trim().slice(0, 200)}).`,
    }
  }
  return { available: true, version: m[1], problem: null }
}

function probeSync(binary: string): Probe {
  const res = spawnSync(binary, ['--no-config', '--version'], {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  })
  return readVersion(res.error, res.status, res.stdout, res.stderr)
}

function probeAsync(binary: string): Promise<Probe> {
  return new Promise((resolve) => {
    execFile(
      binary,
      ['--no-config', '--version'],
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
      (error, stdout, stderr) =>
        resolve(
          readVersion(
            error,
            error ? ((error as { code?: number }).code ?? 1) : 0,
            stdout,
            stderr,
          ),
        ),
    )
  })
}

let launchStatus: MpvEngineStatus | null = null
let binaryAtLaunch: string | null = null
/** null until mpv has been checked (it isn't at launch with the built-in engine). */
let probed: Probe | null = null
let probing: Promise<Probe> | null = null

/**
 * Decides the engine for this session. Must run before the app is ready: in
 * mpv mode Chromium's own audio output is switched off (it would otherwise
 * open the same device and could take it before mpv does). The media
 * controls keep working on Chromium's silent, fake output.
 *
 * mpv is only run (`mpv --version`) here when it is the saved engine: that
 * check must finish before the app is ready, because a missing or broken mpv
 * means the built-in engine with Chromium's audio left on. With the built-in
 * engine nothing is run at launch; Settings checks mpv when it opens
 * (probeMpv).
 */
export function decideEngineAtLaunch(): MpvEngineStatus {
  const saved = savedEngine()
  binaryAtLaunch = findMpvBinary()
  if (!binaryAtLaunch) probed = missing()
  else if (saved === 'mpv') probed = probeSync(binaryAtLaunch)

  const sessionEngine: AudioEngine =
    saved === 'mpv' && probed?.available ? 'mpv' : 'builtin'

  if (sessionEngine === 'mpv') {
    app.commandLine.appendSwitch('disable-audio-output')
  }

  launchStatus = {
    sessionEngine,
    savedEngine: saved,
    available: false,
    version: null,
    binary: binaryAtLaunch,
    problem: null,
    checked: false,
    platform: platformName(),
  }
  return engineStatus()
}

export function engineStatus(): MpvEngineStatus {
  if (!launchStatus) return decideEngineAtLaunch()
  return {
    ...launchStatus,
    ...(probed ?? {}),
    checked: probed !== null,
    savedEngine: savedEngine(),
  }
}

/** Runs `mpv --version` without blocking (once per session). */
export async function probeMpv(): Promise<MpvEngineStatus> {
  if (!launchStatus) decideEngineAtLaunch()
  if (!probed && binaryAtLaunch) {
    probing ??= probeAsync(binaryAtLaunch)
    probed = await probing
  }
  return engineStatus()
}
