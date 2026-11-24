// Usage: node e2e-handoff.mjs   (run through tools/dev-rig/e2e-handoff.sh)
// "Continue on other devices" against the rig's real Navidrome (0.64.2+),
// with a pretend ClearPlay Android (c=ClearPlay-Android) talking to the same
// server: phone → PC and PC → phone, the right song (also with the same song
// twice in the queue) and the right second, saves on pause / quit / sleep /
// lock, nothing saved while left behind or on "clear queue", 1 000-song
// window, and a clock that is 10 minutes off. A recording proxy sits in
// front of Navidrome to see how the app saves. ENGINE=mpv runs it on the mpv
// engine (pretend USB DAC, see e2e-mpv.mjs).

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = path.dirname(new URL(import.meta.url).pathname)
const app = path.resolve(here, '../..')
const rig = process.env.RIG || '/tmp/clearplay-rig'
const ENGINE = process.env.ENGINE || 'builtin'
const ND_PORT = 4533
const FAKE_PORT = 4542
const FAKE = `http://127.0.0.1:${FAKE_PORT}`
const ALBUM = 'Neon Tides' // 35-70 s songs
const ANDROID = 'ClearPlay-Android'

// The shared rules, to compute what the phone would offer.
const rules = await import(
  pathToFileURL(path.join(app, 'src/service/queue-handoff.ts')).href
)

// ---------------- recording proxy ----------------
const calls = []
const proxy = http.createServer((req, res) => {
  const u = new URL(req.url, FAKE)
  const ep = u.pathname.replace(/^\/rest\//, '').replace(/\.view$/, '')
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    if (u.pathname.startsWith('/rest/'))
      calls.push({
        ep,
        method: req.method,
        q: new URLSearchParams(u.search),
        body: new URLSearchParams(body.toString()),
        at: Date.now(),
      })
    const up = http.request(
      {
        host: '127.0.0.1',
        port: ND_PORT,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${ND_PORT}` },
      },
      (r) => {
        res.writeHead(r.statusCode, r.headers)
        r.pipe(res)
      },
    )
    up.on('error', () => res.destroy())
    up.end(body)
  })
})
await new Promise((r) => proxy.listen(FAKE_PORT, '127.0.0.1', r))
const saves = (since) =>
  calls.filter((c) => c.ep.startsWith('savePlayQueue') && c.at >= since)

// ---------------- Navidrome, as the pretend phone ----------------
function auth(client) {
  const salt = crypto.randomBytes(6).toString('hex')
  const token = crypto.createHash('md5').update(`test1234${salt}`).digest('hex')
  return { u: 'admin', t: token, s: salt, v: '1.16.1', c: client, f: 'json' }
}
async function nd(endpoint, params = {}, client = 'e2e') {
  const q = new URLSearchParams({ ...auth(client), ...params })
  const res = await fetch(`http://127.0.0.1:${ND_PORT}/rest/${endpoint}?${q}`)
  return (await res.json())['subsonic-response']
}
async function ndPost(endpoint, pairs, client) {
  const q = new URLSearchParams(auth(client))
  const res = await fetch(`http://127.0.0.1:${ND_PORT}/rest/${endpoint}?${q}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(pairs),
  })
  return (await res.json())['subsonic-response']
}
const phone = {
  save: (ids, currentIndex, position) =>
    ndPost(
      'savePlayQueueByIndex',
      [
        ...ids.map((id) => ['id', id]),
        ['currentIndex', String(currentIndex)],
        ['position', String(position)],
      ],
      ANDROID,
    ),
  report: (id, state, positionMs) =>
    nd(
      'reportPlayback',
      {
        mediaId: id,
        mediaType: 'song',
        positionMs,
        state,
        ignoreScrobble: 'true',
      },
      ANDROID,
    ),
  /** What the phone reads (getPlayQueueByIndex). */
  queue: async () =>
    (await nd('getPlayQueueByIndex', {}, ANDROID)).playQueueByIndex,
  nowPlaying: async () =>
    (await nd('getNowPlaying', {}, ANDROID)).nowPlaying?.entry ?? [],
}

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
          CLEARPLAY_ASOUND_ROOT: path.join(fakeAudio, 'asound'),
          FAKE_AUDIO_STATE: fs.mkdtempSync('/tmp/cp-fake-audio-'),
          PATH: `${path.join(fakeAudio, 'bin')}:${process.env.PATH}`,
          CLEARPLAY_MPV_DEVICE_MAP: 'alsa/hw:CARD=SIMGOT,DEV=0=null;auto=null',
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
    env: { ...process.env, CLEARPLAY_E2E: '1', ...mpvEnv },
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
  await win.evaluate(() => {
    const p = window.__cp.player.getState()
    if (p.playerState.isShuffleActive) p.actions.toggleShuffle()
    while (window.__cp.player.getState().playerState.loopState !== 0)
      p.actions.toggleLoop()
    window.__cp.settings.getState().set({ syncQueue: true, autoDj: false })
  })
}

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
/** The player, and where the engine really is (not the store's rounded progress). */
const player = () =>
  win.evaluate(() => {
    const p = window.__cp.player.getState()
    const song = p.songlist.currentList[p.songlist.currentSongIndex]
    const mpv = window.__cp.mpvElement()
    const audio = document.querySelector(
      'audio[data-testid="player-song-audio"]',
    )
    return {
      index: p.songlist.currentSongIndex,
      length: p.songlist.currentList.length,
      id: song?.id,
      playing: p.playerState.isPlaying,
      time: mpv ? mpv.time : (audio?.currentTime ?? -1),
      engine: mpv ? 'mpv' : 'builtin',
    }
  })
const handoff = () =>
  win.evaluate(() => {
    const h = window.__cp.handoff.getState()
    return {
      offer: h.offer && {
        kind: h.offer.offer.kind,
        device: h.offer.offer.device,
        index: h.offer.offer.index,
        positionMs: h.offer.offer.positionMs,
        song: h.offer.offer.song.id,
      },
      leftBehind: h.leftBehind && { device: h.leftBehind.device },
    }
  })
/** "When the server answers again": a look right now, no 30 s limit. */
const look = async () => {
  await win.evaluate(() => window.dispatchEvent(new Event('online')))
  await sleep(1200)
}
const startQueue = (ids, index) =>
  win.evaluate(
    async ({ ids, index }) => {
      const songs = await Promise.all(
        ids.map(async (id) => {
          const r = await fetch(
            `${window.__cp.app.getState().data.url}/rest/getSong?u=admin&p=test1234&v=1.16.1&c=e2e&f=json&id=${id}`,
          )
          return (await r.json())['subsonic-response'].song
        }),
      )
      window.__cp.player.getState().actions.setSongList(songs, index)
    },
    { ids, index },
  )
const seek = (seconds) =>
  win.evaluate((s) => {
    const mpv = window.__cp.mpvElement()
    if (mpv)
      window.__cp.player.getState().playerState.audioPlayerRef.currentTime = s
    else
      document.querySelector(
        'audio[data-testid="player-song-audio"]',
      ).currentTime = s
  }, seconds)
const playPause = () =>
  win
    .locator('[data-testid=player-button-pause]')
    .or(win.locator('[data-testid=player-button-play]'))
    .first()
    .click()
const setPlaying = (on) =>
  win.evaluate(
    (v) => window.__cp.player.getState().actions.setPlayingState(v),
    on,
  )

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
        .slice(0, 400)}`,
    )
    await win
      ?.screenshot({
        path: `/tmp/e2e-handoff-fail-${name.replace(/\W+/g, '_')}.png`,
      })
      .catch(() => {})
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}
const near = (a, b, tol) => Math.abs(a - b) <= tol

// ---------------- songs ----------------
const albumId = (
  await nd('search3', {
    query: ALBUM,
    albumCount: 1,
    songCount: 0,
    artistCount: 0,
  })
).searchResult3.album[0].id
const albumSongs = (await nd('getAlbum', { id: albumId })).album.song
const [A, B, C, D] = albumSongs.map((s) => s.id)
// B twice: index 1 and index 3.
const QUEUE = [A, B, C, B, D]
/** Every song id now (ids can change when a file is deleted and comes back). */
const allSongs = async () =>
  (
    await nd('search3', {
      query: '',
      songCount: 500,
      albumCount: 0,
      artistCount: 0,
    })
  ).searchResult3.song.map((s) => s.id)

// ======================= the server =======================
await test('Navidrome lists indexBasedQueue and formPost, and moves positionMs on for playing entries', async () => {
  const ext = (
    await nd('getOpenSubsonicExtensions')
  ).openSubsonicExtensions.map((e) => e.name)
  expect(ext.includes('indexBasedQueue'), `extensions: ${ext}`)
  expect(ext.includes('formPost'), `extensions: ${ext}`)
  await phone.report(D, 'playing', 10000)
  await sleep(3000)
  const e = (await phone.nowPlaying()).find((x) => x.playerName === ANDROID)
  expect(
    e?.state === 'playing' && e.positionMs >= 12500 && e.positionMs <= 14500,
    `positionMs ${e?.positionMs} 3 s after reporting 10000`,
  )
  await phone.report(D, 'stopped', 13000)
})

const user = fs.mkdtempSync(path.join(rig, `userdata-handoff-${ENGINE}-`))
await launch(user)

await test('engine and cached extensions', async () => {
  const engine = await win.evaluate(
    () => window.__cp.mpv.getState().status?.sessionEngine ?? 'builtin',
  )
  expect(engine === ENGINE, `running on ${engine}, expected ${ENGINE}`)
  const ext = await win.evaluate(
    () => window.__cp.app.getState().data.extensionsSupported,
  )
  expect(ext?.indexBasedQueue?.includes(1), JSON.stringify(ext))
})

// ======================= phone → PC =======================
await test('phone paused → PC offers Continue; it starts at the second copy of the song, at the right second', async () => {
  await phone.save(QUEUE, 3, 12500)
  await phone.report(B, 'paused', 12500)
  await look()
  const h = await until(async () => (await handoff()).offer)
  expect(
    h?.kind === 'paused' &&
      h.index === 3 &&
      h.song === B &&
      h.device === 'ClearPlay Android',
    `offer ${JSON.stringify(h)}`,
  )
  const text = await win.locator('[data-testid=handoff-pill]').innerText()
  expect(/Paused on ClearPlay Android/.test(text), `pill says "${text}"`)
  expect(/just now|min ago/.test(text), `pill age "${text}"`)
  const mark = Date.now()
  await win.locator('[data-testid=handoff-continue]').click()
  const p = await until(async () => {
    const s = await player()
    return s.playing && s.index === 3 && s.time >= 12 ? s : null
  }, 20000)
  expect(p, `player ${JSON.stringify(await player())}`)
  expect(p.id === B && near(p.time, 12.5, 3), `started at ${JSON.stringify(p)}`)
  const q = await until(async () => {
    const x = await phone.queue()
    return x.changedBy === 'ClearPlay' ? x : null
  }, 5000)
  expect(q, 'not saved back: changedBy is still the phone')
  expect(
    q.currentIndex === 3 && near(q.position ?? 0, 12500, 3000),
    `saved back ${JSON.stringify({ i: q.currentIndex, pos: q.position })}`,
  )
  const s = saves(mark)
  expect(s.length >= 1, 'no save call')
  expect(
    s.every(
      (c) =>
        c.method === 'POST' &&
        !c.q.has('id') &&
        c.body.getAll('id').length === 5,
    ),
    `save calls ${JSON.stringify(s.map((c) => ({ m: c.method, urlIds: c.q.getAll('id').length, bodyIds: c.body.getAll('id').length })))}`,
  )
  expect(
    s.every((c) => c.q.get('c') === 'ClearPlay'),
    'not sent as c=ClearPlay',
  )
  expect(!(await handoff()).offer, 'offer still showing')
})

await test('after Continue nothing is offered again', async () => {
  await look()
  expect(!(await handoff()).offer, 'offered again')
})

await test('phone still playing → "Continue here" starts at its song (first match at or after the saved index) and live second', async () => {
  await setPlaying(false)
  await sleep(1500)
  await phone.save(QUEUE, 2, 5000)
  await phone.report(B, 'playing', 20000)
  const reported = Date.now()
  await look()
  const h = await until(async () => (await handoff()).offer)
  expect(
    h?.kind === 'playing' && h.index === 3 && h.song === B,
    `offer ${JSON.stringify(h)}`,
  )
  const text = await win.locator('[data-testid=handoff-pill]').innerText()
  expect(/Playing on ClearPlay Android/.test(text), `pill says "${text}"`)
  expect(/Continue here/.test(text), `button "${text}"`)
  await win.locator('[data-testid=handoff-continue]').click()
  const p = await until(async () => {
    const s = await player()
    return s.playing && s.index === 3 && s.time >= 20 ? s : null
  }, 20000)
  expect(p, `player ${JSON.stringify(await player())}`)
  const expected = 20 + (Date.now() - reported) / 1000
  expect(
    near(p.time, expected, 4),
    `at ${p.time}, phone would be at ~${expected.toFixed(1)}`,
  )
  const q = await until(async () => {
    const x = await phone.queue()
    return x.changedBy === 'ClearPlay' ? x : null
  }, 5000)
  expect(
    q?.currentIndex === 3,
    `saved back ${JSON.stringify(q && q.currentIndex)}`,
  )
})

await test("v3: PC takes over from a still-playing phone → no pill on the PC; the phone's own check says it was left behind", async () => {
  // No remote control: the phone keeps playing B until someone pauses it.
  await phone.report(B, 'playing', 25000)
  await win.evaluate(() =>
    window.__cp.handoff.setState({ leftBehindShown: false }),
  )
  // A song change here runs the left-behind check (so does the 60 s timer).
  await win.locator('[data-testid=player-button-next]').click()
  await sleep(6000)
  const lb = (await handoff()).leftBehind
  expect(!lb, `PC shows left behind: ${JSON.stringify(lb)}`)
  // The phone's check: its getNowPlaying, then the queue (changedBy).
  const np = await phone.nowPlaying()
  const q = await phone.queue()
  const input = {
    publishing: true,
    playingHere: true,
    thisApp: ANDROID,
    username: 'admin',
    nowPlaying: np.map((e) => ({ ...e, playerName: e.playerName ?? '' })),
    queueIds: QUEUE,
    alreadyShown: false,
  }
  expect(
    rules.leftBehindCandidate(input),
    'phone: no candidate entry for the PC',
  )
  const phoneSees = rules.leftBehind({ ...input, serverChangedBy: q.changedBy })
  expect(
    phoneSees?.device === 'ClearPlay desktop',
    `phone's check: ${JSON.stringify(phoneSees)} (changedBy ${q.changedBy})`,
  )
  await phone.report(B, 'stopped', 26000)
})

// ======================= PC → phone =======================
await test('PC pause → server has the right copy of the song and second; the phone would offer it', async () => {
  await startQueue(QUEUE, 3)
  await until(
    async () => (await player()).playing && (await player()).time > 1,
    15000,
  )
  await seek(15)
  await sleep(1200)
  const before = (await phone.queue()).changed
  const mark = Date.now()
  await playPause()
  await until(async () => !(await player()).playing)
  const at = (await player()).time
  const q = await until(async () => {
    const x = await phone.queue()
    // Stored by Navidrome (not only sent): its `changed` moved on.
    return x.changed !== before && x.changedBy === 'ClearPlay' ? x : null
  }, 4000)
  expect(q, 'no save within 4 s of the pause')
  const firstSave = saves(mark)[0].at - mark
  expect(firstSave <= 2500, `saved ${firstSave} ms after the pause`)
  expect(
    q.currentIndex === 3 && near(q.position, at * 1000, 1500),
    `server ${JSON.stringify({ i: q.currentIndex, pos: q.position })}, PC at ${at}`,
  )
  const o = rules.offer({
    thisApp: ANDROID,
    username: 'admin',
    queue: {
      entries: q.entry,
      currentIndex: q.currentIndex,
      positionMs: q.position ?? 0,
      changed: q.changed,
      changedBy: q.changedBy,
    },
    handledChanged: null,
    playingHere: false,
    nowPlaying: (await phone.nowPlaying()).map((e) => ({
      ...e,
      playerName: e.playerName ?? '',
    })),
  })
  expect(
    o?.kind === 'paused' &&
      o.index === 3 &&
      o.device === 'ClearPlay desktop' &&
      near(o.positionMs, at * 1000, 1500),
    `phone's offer ${JSON.stringify(o && { ...o, song: o.song.id })}`,
  )
})

await test('PC playing → the phone would offer "Playing on ClearPlay desktop" at the live second', async () => {
  await playPause()
  await until(async () => (await player()).playing)
  await sleep(4000)
  const q = await phone.queue()
  const np = await phone.nowPlaying()
  const pc = await player()
  const o = rules.offer({
    thisApp: ANDROID,
    username: 'admin',
    queue: {
      entries: q.entry,
      currentIndex: q.currentIndex,
      positionMs: q.position ?? 0,
      changed: q.changed,
      changedBy: q.changedBy,
    },
    handledChanged: null,
    playingHere: false,
    nowPlaying: np.map((e) => ({ ...e, playerName: e.playerName ?? '' })),
  })
  expect(
    o?.kind === 'playing' &&
      o.index === 3 &&
      near(o.positionMs, pc.time * 1000, 2500),
    `phone's offer ${JSON.stringify(o && { ...o, song: o.song.id })}, PC at ${pc.time}`,
  )
})

// ======================= left behind =======================
await test('phone continues → "Continued on ClearPlay Android"; nothing saved while it shows; Pause here saves nothing', async () => {
  await win.evaluate(() =>
    window.__cp.handoff.setState({ leftBehindShown: false }),
  )
  await phone.save(QUEUE, 2, 3000)
  await phone.report(C, 'playing', 3000)
  const mark = Date.now()
  await win.locator('[data-testid=player-button-next]').click()
  const lb = await until(async () => (await handoff()).leftBehind, 6000)
  expect(
    lb?.device === 'ClearPlay Android',
    `left behind ${JSON.stringify(lb)}`,
  )
  const text = await win
    .locator('[data-testid=handoff-left-behind]')
    .innerText()
  expect(/Continued on ClearPlay Android/.test(text), `pill "${text}"`)
  await sleep(6000)
  expect(
    saves(mark).length === 0,
    `${saves(mark).length} saves while left behind`,
  )
  expect(
    (await player()).playing,
    'paused by itself (never pause automatically)',
  )
  const pauseMark = Date.now()
  await win.locator('[data-testid=handoff-pause-here]').click()
  await until(async () => !(await player()).playing)
  await sleep(2500)
  expect(saves(pauseMark).length === 0, 'Pause here saved')
  expect(
    (await phone.queue()).changedBy === ANDROID,
    'server queue overwritten',
  )
  expect(!(await handoff()).leftBehind, 'pill still showing')
  await phone.report(C, 'stopped', 9000)
})

await test('clearing the queue here leaves the server queue alone', async () => {
  await startQueue(QUEUE, 1)
  await until(async () => (await player()).playing, 15000)
  await sleep(5000)
  await setPlaying(false)
  await sleep(1500)
  await phone.save([D, C], 0, 1000)
  const mark = Date.now()
  await win.evaluate(() => window.__cp.player.getState().actions.clearQueue())
  await sleep(5500)
  expect(saves(mark).length === 0, 'clear queue saved')
  const q = await phone.queue()
  expect(
    q.changedBy === ANDROID && q.entry.length === 2,
    'server queue changed',
  )
})

// ======================= offer lifecycle =======================
await test('× hides the offer until the server queue changes again', async () => {
  await look()
  expect((await handoff()).offer, 'no offer for the phone queue')
  await win.locator('[data-testid=handoff-dismiss]').click()
  expect(!(await handoff()).offer, 'still showing after ×')
  await look()
  expect(!(await handoff()).offer, 'came back without a new save')
  const handled = await win.evaluate(() =>
    Object.values(window.__cp.settings.getState().handledChanged),
  )
  const q = await phone.queue()
  expect(
    handled.includes(q.changed),
    `handledChanged ${handled} is not the server's ${q.changed}`,
  )
  await sleep(1100)
  await phone.save([D, C, A], 1, 2000)
  await look()
  expect((await handoff()).offer, 'not offered after the next save')
})

await test('playing something else here hides the offer for good', async () => {
  await win.evaluate(() =>
    window.__cp.settings.getState().set({ syncQueue: false }),
  )
  expect((await handoff()).offer, 'no offer to start with')
  await startQueue([A], 0)
  await until(async () => (await player()).playing, 15000)
  expect(!(await handoff()).offer, 'offer still showing while playing here')
  await setPlaying(false)
  await sleep(800)
  await look()
  expect(!(await handoff()).offer, 'offered again after playing something else')
  await win.evaluate(() =>
    window.__cp.settings.getState().set({ syncQueue: true }),
  )
})

await test('a clock 10 min off changes nothing (ahead and behind)', async () => {
  for (const offset of [600_000, -600_000]) {
    await win.evaluate((ms) => {
      window.__realNow = window.__realNow || Date.now
      Date.now = () => window.__realNow() + ms
    }, offset)
    await sleep(1100)
    await phone.save([B, D], 1, 4000)
    await look()
    const h = await until(async () => (await handoff()).offer, 4000)
    expect(
      h?.kind === 'paused' && h.song === D,
      `offset ${offset}: offer ${JSON.stringify(h)}`,
    )
    const text = await win.locator('[data-testid=handoff-pill]').innerText()
    const age = offset > 0 ? /10 min ago/ : /just now/
    expect(age.test(text), `offset ${offset}: pill "${text}"`)
    await win.locator('[data-testid=handoff-dismiss]').click()
    await look()
    expect(!(await handoff()).offer, `offset ${offset}: offered again`)
  }
  await win.evaluate(() => {
    if (window.__realNow) Date.now = window.__realNow
  })
})

// ======================= v3: who to trust =======================
await test('v3: Symfonium with only scrobble?submission=false → "Saved by Symfonium", Continue uses the saved position', async () => {
  await setPlaying(false)
  await sleep(1500)
  await ndPost(
    'savePlayQueueByIndex',
    [
      ...[A, B, C].map((id) => ['id', id]),
      ['currentIndex', '1'],
      ['position', '7000'],
    ],
    'Symfonium',
  )
  // Old-style now playing at 30 s: Navidrome shows it as playing and counts on.
  await nd(
    'scrobble',
    { id: C, submission: 'false', position: 30 },
    'Symfonium',
  )
  const legacy = (await phone.nowPlaying()).find(
    (e) => e.playerName === 'Symfonium',
  )
  expect(
    legacy?.state === 'playing',
    `Symfonium entry ${JSON.stringify(legacy && legacy.state)}`,
  )
  await look()
  const h = await until(async () => (await handoff()).offer)
  expect(
    h?.kind === 'saved' &&
      h.index === 1 &&
      h.song === B &&
      h.positionMs === 7000,
    `offer ${JSON.stringify(h)}`,
  )
  const text = await win.locator('[data-testid=handoff-pill]').innerText()
  const titleB = albumSongs.find((x) => x.id === B).title
  expect(
    /Saved by Symfonium/.test(text) &&
      text.includes(titleB) &&
      /just now|min ago/.test(text),
    `pill says "${text}"`,
  )
  expect(!/Playing on|Paused on/.test(text), `pill says "${text}"`)
  await win.locator('[data-testid=handoff-continue]').click()
  const p = await until(async () => {
    const x = await player()
    return x.playing && x.index === 1 && x.time >= 7 ? x : null
  }, 20000)
  expect(
    p && p.id === B && near(p.time, 7, 3),
    `started at ${JSON.stringify(await player())}`,
  )
  await setPlaying(false)
  await sleep(1500)
})

/** Navidrome's web API (admin): log in, then delete the files marked missing. */
async function purgeMissing() {
  const login = await fetch(`http://127.0.0.1:${ND_PORT}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'test1234' }),
  })
  const { token } = await login.json()
  const res = await fetch(`http://127.0.0.1:${ND_PORT}/api/missing`, {
    method: 'DELETE',
    headers: { 'X-ND-Authorization': `Bearer ${token}` },
  })
  expect(res.ok, `DELETE /api/missing: ${res.status}`)
}
async function scan() {
  await nd('startScan')
  await sleep(1000)
  await until(
    async () => !(await nd('getScanStatus')).scanStatus.scanning,
    30000,
  )
}

await test('v3: a song before the current one deleted from the library, phone paused → Continue starts at the right song', async () => {
  const cold = (
    await nd('search3', {
      query: 'Cold Harbour',
      albumCount: 1,
      songCount: 0,
      artistCount: 0,
    })
  ).searchResult3.album[0].id
  const songs = (await nd('getAlbum', { id: cold })).album.song
  const [W, X, Y, Z] = songs.map((x) => x.id)
  await phone.save([W, X, Y, Z], 2, 9000)
  await phone.report(Y, 'paused', 9000)
  // Delete X (before the current song Y) from the library and purge it.
  const file = path.join(rig, 'music', songs[1].path)
  const aside = `${file}.aside`
  fs.renameSync(file, aside)
  try {
    await scan()
    await purgeMissing()
    const q = await phone.queue()
    expect(
      q.entry.length === 3 && q.currentIndex === 2 && q.entry[2].id === Z,
      `server queue after the delete: ${q.entry.length} songs, index ${q.currentIndex} → ${q.entry[q.currentIndex]?.title}`,
    )
    await look()
    const h = await until(async () => (await handoff()).offer)
    expect(
      h?.kind === 'paused' &&
        h.song === Y &&
        h.index === 1 &&
        h.positionMs === 9000,
      `offer ${JSON.stringify(h)}`,
    )
    const text = await win.locator('[data-testid=handoff-pill]').innerText()
    expect(
      text.includes(songs[2].title),
      `pill names "${text}", not ${songs[2].title}`,
    )
    await win.locator('[data-testid=handoff-continue]').click()
    const p = await until(async () => {
      const x = await player()
      return x.playing && x.id === Y && x.time >= 9 ? x : null
    }, 20000)
    expect(
      p && p.index === 1 && near(p.time, 9, 3),
      `started at ${JSON.stringify(await player())}`,
    )
  } finally {
    fs.renameSync(aside, file)
    await scan()
    await phone.report(Y, 'stopped', 9000)
  }
  await setPlaying(false)
  await sleep(1500)
})

// ======================= saves =======================
await test('past song 1 000 (2 500-song queue with local songs): 100 before, 899 after, the current song included', async () => {
  const ids = await allSongs()
  const big = Array.from({ length: 2500 }, (_, i) => ids[i % ids.length])
  const before = (await phone.queue()).changed
  const mark = Date.now()
  await win.evaluate(
    async ({ big }) => {
      const url = window.__cp.app.getState().data.url
      const cache = {}
      const songs = []
      for (const id of big) {
        if (!cache[id]) {
          const r = await fetch(
            `${url}/rest/getSong?u=admin&p=test1234&v=1.16.1&c=e2e&f=json&id=${id}`,
          )
          cache[id] = (await r.json())['subsonic-response'].song
        }
        songs.push(cache[id])
      }
      // Ten "Music on this computer" songs before the current one.
      for (let i = 0; i < 10; i++)
        songs.splice(1450, 0, {
          ...songs[0],
          id: `tr-${String(i).padStart(16, 'a')}`,
        })
      window.__cp.player.getState().actions.setSongList(songs, 1510)
    },
    { big },
  )
  const cur = await until(async () => {
    const p = await player()
    return p.playing && p.length === 2510 ? p : null
  }, 15000)
  expect(cur, 'big queue did not start')
  const q = await until(async () => {
    const x = await phone.queue()
    // Stored by Navidrome (not only sent): its `changed` moved on.
    return x.changed !== before && x.changedBy === 'ClearPlay' ? x : null
  }, 9000)
  expect(q, 'not saved')
  expect(q.entry.length === 1000, `saved ${q.entry.length} songs`)
  expect(q.currentIndex === 100, `currentIndex ${q.currentIndex}`)
  expect(
    q.entry[100].id === cur.id,
    'saved current song is not the playing one',
  )
  const body = saves(mark).at(-1).body.getAll('id')
  expect(!body.some((id) => id.startsWith('tr-')), 'local songs were sent')
})

await test('system sleep and screen lock save right away', async () => {
  await startQueue(QUEUE, 3)
  await until(
    async () => (await player()).playing && (await player()).time > 2,
    15000,
  )
  for (const event of ['suspend', 'lock-screen']) {
    await sleep(4500)
    await phone.save([D], 0, 0)
    const mark = Date.now()
    await electronApp.evaluate(
      ({ powerMonitor }, e) => powerMonitor.emit(e),
      event,
    )
    const q = await until(async () => {
      const x = await phone.queue()
      return x.changedBy === 'ClearPlay' ? x : null
    }, 3000)
    expect(q, `${event}: not saved`)
    const pc = await player()
    expect(
      Date.now() - mark < 3000 &&
        q.currentIndex === 3 &&
        near(q.position, pc.time * 1000, 2000),
      `${event}: ${JSON.stringify({ i: q.currentIndex, pos: q.position, pc: pc.time })}`,
    )
  }
})

let quitAt = 0
await test('quit while playing saves first (inside the quit handshake)', async () => {
  await seek(30)
  await sleep(1500)
  await phone.save([D], 0, 0)
  quitAt = (await player()).time
  const mark = Date.now()
  await quit()
  const q = await phone.queue()
  expect(
    q.changedBy === 'ClearPlay',
    `server changedBy ${q.changedBy} after quit`,
  )
  expect(
    q.currentIndex === 3 && near(q.position, quitAt * 1000, 2000),
    `saved ${JSON.stringify({ i: q.currentIndex, pos: q.position })}, quit at ${quitAt}`,
  )
  const report = calls.find(
    (c) =>
      c.ep === 'reportPlayback' &&
      c.at >= mark &&
      c.q.get('state') === 'stopped',
  )
  expect(report, 'no "stopped" report after the save')
  const save = saves(mark)[0]
  expect(save && save.at <= report.at, 'the save did not go first')
})

await test('no page errors', async () => {
  expect(errors.length === 0, errors.join(' | '))
})

proxy.close()
fs.rmSync(user, { recursive: true, force: true })
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
