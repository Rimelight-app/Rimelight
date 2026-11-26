// Shared helpers for the measuring scripts in tools/dev-rig/perf.
// Each script launches the built app (pnpm electron:build first) against the
// rig's Navidrome, under Xvfb (see xrun.sh). Settings come from the
// environment:
//   RIG=/tmp/clearplay-rig   ND=http://127.0.0.1:4533   (server the app logs in to)
//   PROFILE=normal|cpu4|nogpu   ENGINE=html|mpv   SIZE=1920x1080
//   USERDATA=<dir>  FRESH=1 (start from an empty profile)
//   CLEARPLAY_APP=<app dir> (another build, e.g. a worktree of an older tag)
//   ELECTRON_BIN=<electron binary> (default: this repo's node_modules)
import { spawn } from 'node:child_process'
import { _electron as electron } from 'playwright-core'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const here = path.dirname(new URL(import.meta.url).pathname)
export const repo = path.resolve(here, '../../..')
export const RIG = process.env.RIG || '/tmp/clearplay-rig'
export const ND = process.env.ND || 'http://127.0.0.1:4533'
export const PROFILE = process.env.PROFILE || 'normal'
export const ENGINE = process.env.ENGINE || 'html'
export const [WIDTH, HEIGHT] = (process.env.SIZE || '1920x1080')
  .split('x')
  .map(Number)
const appDir = process.env.CLEARPLAY_APP || repo
const fakeAudio = path.join(repo, 'tools/dev-rig/fake-audio')

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- server API
export async function api(endpoint, params = {}, base = ND) {
  const salt = crypto.randomBytes(6).toString('hex')
  const token = crypto.createHash('md5').update(`test1234${salt}`).digest('hex')
  const q = new URLSearchParams({
    u: 'admin',
    t: token,
    s: salt,
    v: '1.16.1',
    c: 'perf',
    f: 'json',
    ...params,
  })
  const res = await fetch(`${base}/rest/${endpoint}?${q}`)
  return (await res.json())['subsonic-response']
}

export async function findAlbum(name) {
  const r = await api('search3', {
    query: name,
    albumCount: 20,
    songCount: 0,
    artistCount: 0,
  })
  return (r.searchResult3.album ?? []).find((a) => a.name === name)
}

export async function findPlaylist(name) {
  const r = await api('getPlaylists')
  return (r.playlists.playlist ?? []).find((p) => p.name === name)
}

// ---------------------------------------------------------------- app
/**
 * Starts ClearPlay. Returns { app, win, cdp, errors, csp, close }.
 * opts: { userData, fresh, engine, size:[w,h], env, args, login }
 */
export async function launch(opts = {}) {
  const engine = opts.engine ?? ENGINE
  const userData =
    opts.userData ??
    process.env.USERDATA ??
    path.join(RIG, `userdata-perf-${engine}`)
  if (opts.fresh ?? process.env.FRESH === '1')
    fs.rmSync(userData, { recursive: true, force: true })
  fs.mkdirSync(path.join(userData, 'store'), { recursive: true })
  fs.writeFileSync(
    path.join(userData, 'store', 'audio-engine.json'),
    JSON.stringify({ engine: engine === 'mpv' ? 'mpv' : 'builtin' }),
  )
  const args = [
    appDir,
    '--no-sandbox',
    '--disable-gpu-sandbox',
    `--user-data-dir=${userData}`,
  ]
  if (PROFILE === 'nogpu') args.push('--disable-gpu')
  args.push(...(opts.args ?? []))
  const fakeState = fs.mkdtempSync('/tmp/cp-fake-audio-')
  const t0 = Date.now()
  const app = await electron.launch({
    executablePath:
      process.env.ELECTRON_BIN ||
      path.join(repo, 'node_modules/electron/dist/electron'),
    args,
    cwd: appDir,
    env: {
      ...process.env,
      CLEARPLAY_E2E: '1',
      // mpv plays on its null output in real time (no sound card here).
      CLEARPLAY_ASOUND_ROOT: path.join(fakeAudio, 'asound'),
      FAKE_AUDIO_STATE: fakeState,
      PATH: `${path.join(fakeAudio, 'bin')}:${process.env.PATH}`,
      CLEARPLAY_MPV_DEVICE_MAP: 'alsa/hw:CARD=SIMGOT,DEV=0=null;auto=null',
      ...(opts.env ?? {}),
    },
    timeout: 60000,
  })
  const win = await app.firstWindow()
  const errors = []
  const csp = []
  win.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
  win.on('console', (m) => {
    const text = m.text()
    if (
      /violates the following Content Security Policy|Refused to (load|execute|connect|apply|create|frame|evaluate)/i.test(
        text,
      )
    )
      csp.push(text.slice(0, 300))
    else if (m.type() === 'error' && !/Failed to load resource/.test(text))
      errors.push(text.slice(0, 300))
  })
  await win.waitForLoadState('domcontentloaded')
  const cdp = await win.context().newCDPSession(win)
  if (PROFILE === 'cpu4')
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const size = opts.size ?? [WIDTH, HEIGHT]
  await setWindowSize(app, size)
  if (opts.login !== false) await login(win)
  return {
    app,
    win,
    cdp,
    errors,
    csp,
    launchedAt: t0,
    userData,
    close: async () => {
      await app.close().catch(() => {})
      fs.rmSync(fakeState, { recursive: true, force: true })
    },
  }
}

/** The main window (also works while the app is still creating it). */
export async function setWindowSize(app, [w, h]) {
  await app.evaluate(
    ({ BrowserWindow, webContents }, [w, h]) => {
      const bw = webContents
        .getAllWebContents()
        .map((c) => BrowserWindow.fromWebContents(c))
        .find(Boolean)
      bw.setMinimumSize(400, 300)
      bw.setFullScreen(false)
      bw.setSize(w, h)
      bw.center()
    },
    [w, h],
  )
}

/** Fills the server form if the app shows it. */
export async function login(win, url = ND) {
  await win.waitForTimeout(1500)
  if (await win.locator('input[name="url"]').count()) {
    await win.fill('input[name="url"]', url)
    await win.fill('input[name="username"]', 'admin')
    await win.fill('input[name="password"]', 'test1234')
    await win.keyboard.press('Enter')
    await win.waitForTimeout(3000)
  }
}

export const go = async (win, hash, wait = 1200) => {
  await win.evaluate((h) => {
    window.location.hash = h
  }, hash)
  if (wait) await win.waitForTimeout(wait)
}

// ---------------------------------------------------------------- measuring
/** Counts renderer requests whose URL matches `re` (CDP Network). */
export async function countRequests(cdp, re = /\/rest\//) {
  await cdp.send('Network.enable')
  const seen = []
  const onReq = (e) => {
    if (re.test(e.request.url)) seen.push({ url: e.request.url, t: Date.now() })
  }
  cdp.on('Network.requestWillBeSent', onReq)
  return {
    seen,
    reset: () => {
      seen.length = 0
    },
    byEndpoint: () => {
      const m = {}
      for (const s of seen) {
        const ep = (s.url.match(/\/rest\/([A-Za-z0-9]+)/) ?? [])[1] ?? 'other'
        m[ep] = (m[ep] ?? 0) + 1
      }
      return m
    },
    stop: () => cdp.off('Network.requestWillBeSent', onReq),
  }
}

/** Per-process CPU (% of one core) and memory from app.getAppMetrics(). */
export async function processMetrics(app) {
  return app.evaluate(({ app: a }) =>
    a.getAppMetrics().map((m) => ({
      type: m.type,
      pid: m.pid,
      cpu: m.cpu.percentCPUUsage,
      memMB: Math.round(m.memory.workingSetSize / 1024),
    })),
  )
}

/** CPU seconds (user + system) of a process so far, from /proc (Linux). */
export function procCpuSeconds(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    return (Number(f[11]) + Number(f[12])) / 100 // clock ticks, USER_HZ = 100
  } catch {
    return Number.NaN
  }
}

/**
 * CPU per process type over `ms`, as % of one core, from /proc (Linux).
 * getAppMetrics' percentCPUUsage is reported next to it for comparison.
 */
export async function cpuByType(app, ms) {
  const procs = await processMetrics(app)
  const before = procs.map((p) => [p, procCpuSeconds(p.pid)])
  const t0 = Date.now()
  await sleep(ms)
  const secs = (Date.now() - t0) / 1000
  const after = await processMetrics(app)
  const out = {}
  const electron = {}
  for (const [p, c0] of before) {
    const pct = ((procCpuSeconds(p.pid) - c0) / secs) * 100
    if (Number.isFinite(pct))
      out[p.type] = Math.round(((out[p.type] ?? 0) + pct) * 10) / 10
  }
  for (const m of after)
    electron[m.type] = Math.round(((electron[m.type] ?? 0) + m.cpu) * 10) / 10
  return { procPercentOfCore: out, electronPercent: electron }
}

/** Average CPU per process type over `ms` (getAppMetrics deltas). */
export async function cpuOver(app, ms) {
  await processMetrics(app) // starts the measuring window
  await sleep(ms)
  const out = {}
  for (const m of await processMetrics(app))
    out[m.type] = (out[m.type] ?? 0) + m.cpu
  return out
}

export async function heapMB(cdp, gc = true) {
  if (gc) await cdp.send('HeapProfiler.collectGarbage').catch(() => {})
  const { usedSize } = await cdp.send('Runtime.getHeapUsage')
  return Math.round(usedSize / 1048576)
}

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN
}

export function writeResult(name, data) {
  const dir = path.join(RIG, 'perf-results')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${name}-${PROFILE}-${ENGINE}-${Date.now()}.json`)
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
  console.log(`-> ${file}`)
  return file
}

// ---------------------------------------------------------------- fault proxy
/**
 * Starts perf/fault-proxy.mjs in front of the rig's Navidrome. The app logs in
 * to proxy.url; the proxy also counts every request the app makes (covers
 * fetched for the OS media controls included).
 */
export async function startProxy(
  port = Number(process.env.FAULT_PORT || 4534),
  rules = [],
) {
  const child = spawn(
    process.execPath,
    [
      path.join(here, 'fault-proxy.mjs'),
      '--port',
      String(port),
      '--upstream',
      ND,
      ...rules.flatMap((r) => ['--rule', r]),
    ],
    { stdio: 'ignore' },
  )
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${url}/__fault/rules`)
      break
    } catch {
      await sleep(100)
    }
  }
  const call = async (p, body) =>
    (
      await fetch(
        `${url}/__fault/${p}`,
        body === undefined
          ? {}
          : { method: 'POST', body: JSON.stringify(body) },
      )
    ).json()
  return {
    url,
    setRules: (r) => call('rules', r),
    clear: () => call('clear', {}),
    log: () => call('log'),
    resetLog: () => call('log/reset', {}),
    stop: () => child.kill(),
  }
}
