import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { is } from '@electron-toolkit/utils'
import { app } from 'electron'
import { AudioEngine, MpvEngineStatus } from '../../../preload/types'
import { ClearPlayStore } from '../store'

const engineStore = new ClearPlayStore<{ engine: AudioEngine }>({
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
  const override = process.env.CLEARPLAY_MPV
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

let launchStatus: MpvEngineStatus | null = null

/**
 * Decides the engine for this session. Must run before the app is ready: in
 * mpv mode Chromium's own audio output is switched off (it would otherwise
 * open the same device and could take it before mpv does). The media
 * controls keep working on Chromium's silent, fake output.
 */
export function decideEngineAtLaunch(): MpvEngineStatus {
  const saved = savedEngine()
  const binary = findMpvBinary()
  let version: string | null = null
  let problem: string | null = null

  if (!binary) {
    problem =
      process.platform === 'win32'
        ? 'mpv is missing from this installation. Reinstall ClearPlay.'
        : 'mpv is not installed. Install it (Fedora: sudo dnf install mpv) and restart ClearPlay.'
  } else {
    const res = spawnSync(binary, ['--no-config', '--version'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    })
    const first = (res.stdout ?? '').split('\n')[0] ?? ''
    const m = first.match(/^mpv\s+v?([\w.\-+]+)/)
    if (res.error || res.status !== 0 || !m) {
      problem = `mpv could not start (${res.error?.message ?? (res.stderr || first || 'no output').trim().slice(0, 200)}).`
    } else {
      version = m[1]
    }
  }

  const available = problem === null
  const sessionEngine: AudioEngine =
    saved === 'mpv' && available ? 'mpv' : 'builtin'

  if (sessionEngine === 'mpv') {
    app.commandLine.appendSwitch('disable-audio-output')
  }

  launchStatus = {
    sessionEngine,
    savedEngine: saved,
    available,
    version,
    binary,
    problem,
    platform: platformName(),
  }
  return launchStatus
}

export function engineStatus(): MpvEngineStatus {
  if (!launchStatus) return decideEngineAtLaunch()
  return { ...launchStatus, savedEngine: savedEngine() }
}
