// Usage: node e2e-playback-report.mjs   (run through tools/dev-rig/e2e-playback-report.sh)
// Checks what the built app tells the server about playback (Navidrome's Now
// Playing). A recording "fake server" sits in front of the rig's Navidrome
// (0.64.2 or later): it logs every call the app makes and, when asked, acts
// like a server without the playbackReport extension. ENGINE=mpv runs the same
// checks with the mpv engine (pretend USB DAC, see e2e-mpv.mjs).

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const here = path.dirname(new URL(import.meta.url).pathname)
const app = path.resolve(here, '../..')
const rig = process.env.RIG || '/tmp/rimelight-rig'
const ENGINE = process.env.ENGINE || 'builtin'
const ND_PORT = 4533
const FAKE_PORT = 4540
const FAKE = `http://127.0.0.1:${FAKE_PORT}`
const ALBUM = 'Rates and Depths' // 25 s songs: one can play to the end

// ---------------- fake server ----------------
const calls = []
let hideExtension = false
const fake = http.createServer((req, res) => {
  const u = new URL(req.url, FAKE)
  const ep = u.pathname.replace(/^\/rest\//, '').replace(/\.view$/, '')
  if (u.pathname.startsWith('/rest/'))
    calls.push({ ep, q: Object.fromEntries(u.searchParams), at: Date.now() })
  if (hideExtension && ep === 'reportPlayback') {
    res.writeHead(404).end()
    return
  }
  const headers = { ...req.headers, host: `127.0.0.1:${ND_PORT}` }
  const rewrite = hideExtension && ep === 'getOpenSubsonicExtensions'
  if (rewrite) delete headers['accept-encoding']
  const up = http.request(
    {
      host: '127.0.0.1',
      port: ND_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (r) => {
      if (!rewrite) {
        res.writeHead(r.statusCode, r.headers)
        r.pipe(res)
        return
      }
      let body = ''
      r.on('data', (c) => (body += c))
      r.on('end', () => {
        const d = JSON.parse(body)
        const sr = d['subsonic-response']
        sr.openSubsonicExtensions = (sr.openSubsonicExtensions || []).filter(
          (e) => e.name !== 'playbackReport',
        )
        const out = JSON.stringify(d)
        res.writeHead(200, {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(out),
        })
        res.end(out)
      })
    },
  )
  up.on('error', () => res.destroy())
  req.pipe(up)
})
await new Promise((r) => fake.listen(FAKE_PORT, '127.0.0.1', r))

const reports = (since = 0, id) =>
  calls.filter(
    (c) =>
      c.ep === 'reportPlayback' && c.at >= since && (!id || c.q.mediaId === id),
  )
const scrobbles = (since = 0, id) =>
  calls.filter(
    (c) => c.ep === 'scrobble' && c.at >= since && (!id || c.q.id === id),
  )

// ---------------- Navidrome, asked directly ----------------
async function nd(endpoint, params = {}) {
  const salt = crypto.randomBytes(6).toString('hex')
  const token = crypto.createHash('md5').update(`test1234${salt}`).digest('hex')
  const q = new URLSearchParams({
    u: 'admin',
    t: token,
    s: salt,
    v: '1.16.1',
    c: 'e2e',
    f: 'json',
    ...params,
  })
  const res = await fetch(`http://127.0.0.1:${ND_PORT}/rest/${endpoint}?${q}`)
  return (await res.json())['subsonic-response']
}
/** Rimelight's entry in Navidrome's Now Playing (what its web UI shows). */
const nowPlaying = async () =>
  ((await nd('getNowPlaying')).nowPlaying?.entry || []).find(
    (e) => e.playerName === 'ClearPlay',
  ) || null
const playCount = async (id) =>
  (await nd('getSong', { id })).song.playCount || 0

// ---------------- app ----------------
let electronApp
let win
const errors = []

async function launch(userData) {
  fs.mkdirSync(path.join(userData, 'store'), { recursive: true })
  fs.writeFileSync(
    path.join(userData, 'store', 'audio-engine.json'),
    JSON.stringify({ engine: ENGINE }),
  )
  const fakeAudio = path.join(here, 'fake-audio')
  const mpvEnv =
    ENGINE === 'mpv'
      ? {
          RIMELIGHT_ASOUND_ROOT: path.join(fakeAudio, 'asound'),
          FAKE_AUDIO_STATE: fs.mkdtempSync('/tmp/cp-fake-audio-'),
          PATH: `${path.join(fakeAudio, 'bin')}:${process.env.PATH}`,
          RIMELIGHT_MPV_DEVICE_MAP: 'alsa/hw:CARD=SIMGOT,DEV=0=null;auto=null',
        }
      : {}
  electronApp = await electron.launch({
    executablePath: path.join(app, 'node_modules/electron/dist/electron'),
    args: [
      app,
      '--no-sandbox',
      '--disable-gpu-sandbox',
      `--user-data-dir=${userData}`,
    ],
    cwd: app,
    env: { ...process.env, RIMELIGHT_E2E: '1', ...mpvEnv },
    timeout: 60000,
  })
  win = await electronApp.firstWindow()
  win.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  await win.waitForLoadState('domcontentloaded')
  await electronApp.evaluate(({ webContents, BrowserWindow }) => {
    const bw = webContents
      .getAllWebContents()
      .map((c) => BrowserWindow.fromWebContents(c))
      .find(Boolean)
    bw.setMinimumSize(400, 300)
    bw.setSize(1440, 900)
  })
  await win.waitForTimeout(2500)
  if (await win.locator('input[name="url"]').count()) {
    await win.fill('input[name="url"]', FAKE)
    await win.fill('input[name="username"]', 'admin')
    await win.fill('input[name="password"]', 'test1234')
    await win.keyboard.press('Enter')
    await win.waitForTimeout(4000)
  }
  // Known start: repeat and shuffle off, scrobbling on.
  await win.evaluate(() => {
    const p = window.__cp.player.getState()
    if (p.playerState.isShuffleActive) p.actions.toggleShuffle()
    while (window.__cp.player.getState().playerState.loopState !== 0)
      p.actions.toggleLoop()
  })
}

/** Quits like the user does (menu Quit / tray Quit run app.quit()). */
async function quit() {
  await electronApp.evaluate(({ app }) => app.quit()).catch(() => {})
  await electronApp.waitForEvent('close', { timeout: 15000 }).catch(() => {})
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms = 8000) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    last = await fn()
    if (last) return last
    await sleep(150)
  }
  return last
}
const player = () =>
  win.evaluate(() => {
    const p = window.__cp.player.getState()
    const song = p.songlist.currentList[p.songlist.currentSongIndex]
    return {
      id: song?.id,
      title: song?.title,
      playing: p.playerState.isPlaying,
      progress: p.playerProgress.progress,
    }
  })
async function playTrack(title) {
  await win.evaluate((h) => {
    window.location.hash = h
  }, '/library/albums')
  await sleep(1200)
  await win.getByText(ALBUM, { exact: true }).first().click()
  await sleep(1200)
  await win.getByText(title, { exact: true }).first().dblclick()
  return until(async () => {
    const s = await player()
    return s.title === title && s.playing && s.progress >= 1 ? s : null
  }, 12000)
}
const playPause = () =>
  win
    .locator('[data-testid=player-button-pause]')
    .or(win.locator('[data-testid=player-button-play]'))
    .first()
    .click()

// ---------------- tiny runner ----------------
let failed = 0
let passed = 0
async function test(name, fn) {
  const full = `[${ENGINE}] ${name}`
  try {
    await fn()
    passed++
    console.log(`PASS  ${full}`)
  } catch (e) {
    failed++
    console.log(
      `FAIL  ${full}: ${String(e?.message || e)
        .split('\n')[0]
        .slice(0, 300)}`,
    )
    await win
      ?.screenshot({
        path: `/tmp/e2e-pr-fail-${name.replace(/\W+/g, '_')}.png`,
      })
      .catch(() => {})
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}
const states = (list) => list.map((c) => c.q.state)

// ======================= server with playbackReport =======================
const userA = fs.mkdtempSync(path.join(rig, `userdata-pr-${ENGINE}-`))
await launch(userA)

await test('login checks the server for playbackReport', async () => {
  const engine = await win.evaluate(
    () => window.__cp.mpv.getState().status?.sessionEngine ?? 'builtin',
  )
  expect(
    engine === ENGINE,
    `running on the ${engine} engine, expected ${ENGINE}`,
  )
  expect(
    calls.some((c) => c.ep === 'getOpenSubsonicExtensions'),
    'getOpenSubsonicExtensions was not called',
  )
  const ext = await win.evaluate(
    () => window.__cp.app.getState().data.extensionsSupported,
  )
  expect(
    ext?.playbackReport?.includes(1),
    `playbackReport not cached: ${JSON.stringify(ext)}`,
  )
})

let song
let countBefore = 0
const t0 = Date.now()
await test('a song starts: starting, then playing; no scrobble?submission=false', async () => {
  const id = (
    await nd('search3', {
      query: '44.1 kHz 16-bit',
      songCount: 1,
      albumCount: 0,
      artistCount: 0,
    })
  ).searchResult3.song[0].id
  countBefore = await playCount(id)
  song = await playTrack('44.1 kHz 16-bit')
  expect(song?.id === id, 'a different song started')
  expect(song, 'song did not start')
  await until(() => states(reports(t0, song.id)).includes('playing'))
  const s = states(reports(t0, song.id))
  expect(
    s[0] === 'starting' && s.includes('playing'),
    `reports: ${s.join(',')}`,
  )
  expect(
    !scrobbles(t0).some((c) => c.q.submission === 'false'),
    'old now-playing call was still sent',
  )
  const np = await until(nowPlaying)
  expect(
    np?.state === 'playing' && np.id === song.id,
    `Navidrome shows ${JSON.stringify(np && { id: np.id, state: np.state })}`,
  )
})

await test('every report is a song with ignoreScrobble=true', async () => {
  const bad = reports(t0).filter(
    (c) =>
      c.q.ignoreScrobble !== 'true' ||
      c.q.mediaType !== 'song' ||
      !c.q.positionMs,
  )
  expect(
    bad.length === 0,
    `bad reports: ${JSON.stringify(bad.map((b) => b.q))}`,
  )
})

await test('pause (player bar) sends paused once; Navidrome shows paused', async () => {
  const mark = Date.now()
  await playPause()
  await until(async () => !(await player()).playing)
  await sleep(3000)
  const s = states(reports(mark, song.id))
  expect(
    s.length === 1 && s[0] === 'paused',
    `reports after pause: ${s.join(',') || 'none'}`,
  )
  const np = await nowPlaying()
  expect(np?.state === 'paused', `Navidrome shows ${np?.state}`)
})

await test('resume (space bar) sends playing; Navidrome shows playing', async () => {
  const mark = Date.now()
  await win
    .locator('body')
    .click({ position: { x: 700, y: 400 } })
    .catch(() => {})
  await win.keyboard.press('Space')
  await until(async () => (await player()).playing)
  await until(() => states(reports(mark, song.id)).includes('playing'), 5000)
  const s = states(reports(mark, song.id))
  expect(
    s.length === 1 && s[0] === 'playing',
    `reports after resume: ${s.join(',') || 'none'}`,
  )
  expect(
    (await nowPlaying())?.state === 'playing',
    'Navidrome does not show playing',
  )
})

await test('pause and resume from the taskbar/tray buttons (main process)', async () => {
  const send = () =>
    electronApp.evaluate(({ webContents }) => {
      for (const c of webContents.getAllWebContents())
        c.send('player-state-listener', 'togglePlayPause')
    })
  const mark = Date.now()
  await send()
  await until(async () => !(await player()).playing)
  await sleep(1500)
  await send()
  await until(() => states(reports(mark, song.id)).includes('playing'), 5000)
  const s = states(reports(mark, song.id))
  expect(s.join(',') === 'paused,playing', `reports: ${s.join(',')}`)
})

let next
await test('one finished song counts one play; no paused at its end', async () => {
  next = await until(async () => {
    const s = await player()
    return s.id && s.id !== song.id && s.playing ? s : null
  }, 40000)
  expect(next, 'next song did not start')
  await until(() => states(reports(t0, next.id)).includes('starting'))
  await sleep(2000)
  const after = await playCount(song.id)
  const subs = scrobbles(t0, song.id).filter((c) => c.q.submission !== 'false')
  expect(
    subs.length === 1,
    `scrobble?submission=true sent ${subs.length} times`,
  )
  expect(after === countBefore + 1, `play count ${countBefore} → ${after}`)
  const s = states(reports(t0, song.id))
  expect(
    s.at(-1) === 'stopped',
    `last report for the finished song: ${s.at(-1)}`,
  )
  const lastPause = s.lastIndexOf('paused')
  expect(
    !s.slice(lastPause + 2).includes('paused'),
    `a pause was reported at the end: ${s.join(',')}`,
  )
})

await test('quit while playing: stopped is sent and Navidrome stops showing Rimelight', async () => {
  await until(() => states(reports(t0, next.id)).includes('playing'))
  const mark = Date.now()
  await quit()
  const s = states(reports(mark, next.id))
  expect(
    s.includes('stopped'),
    `reports while quitting: ${s.join(',') || 'none'}`,
  )
  const np = await until(async () => !(await nowPlaying()), 3000)
  expect(np === true, 'Navidrome still shows Rimelight')
})

// ======================= server without playbackReport =======================
hideExtension = true
const userB = fs.mkdtempSync(path.join(rig, `userdata-pr-noext-${ENGINE}-`))
const t1 = Date.now()
await launch(userB)

await test('server without the extension: no reportPlayback calls, old now-playing kept', async () => {
  const s = await playTrack('48 kHz 24-bit')
  expect(s, 'song did not start')
  await sleep(1500)
  await playPause()
  await sleep(1500)
  await playPause()
  await sleep(2500)
  expect(
    reports(t1).length === 0,
    `reportPlayback was called ${reports(t1).length} times`,
  )
  expect(
    scrobbles(t1, s.id).some((c) => c.q.submission === 'false'),
    'scrobble?submission=false not sent',
  )
})
await quit()

// ============ server updated since login: the launch check finds it ============
hideExtension = false
const t2 = Date.now()
await launch(userB)
await test('saved login from before the server update picks up playbackReport at launch', async () => {
  const ext = await until(() =>
    win.evaluate(
      () => window.__cp.app.getState().data.extensionsSupported?.playbackReport,
    ),
  )
  expect(ext?.includes?.(1), 'extension list not refreshed')
  const s = await playTrack('96 kHz 24-bit')
  expect(s, 'song did not start')
  await until(() => states(reports(t2, s.id)).includes('playing'))
  expect(
    states(reports(t2, s.id)).includes('playing'),
    'no reportPlayback after refresh',
  )
})
await test('no page errors', async () => {
  expect(errors.length === 0, errors.join(' | '))
})
await quit()

fake.close()
for (const d of [userA, userB]) fs.rmSync(d, { recursive: true, force: true })
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
