// Usage: node e2e-local-lyrics.mjs   (run through tools/dev-rig/e2e-local-lyrics.sh)
// Embedded lyrics of a "Music on this computer" song, in the built app: a
// 90 s FLAC whose Vorbis LYRICS tag is the one from the 0.6.0 bug report
// (fixtures/local-lyrics.flac has the same tag but is 1 s long). Every line
// must be on screen, and the highlighted line must follow the song.
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const app = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../..',
)
const rig = process.env.RIG || '/tmp/clearplay-rig'
const music = path.join(rig, 'local-lyrics-music')
const userData = path.join(rig, 'userdata-local-lyrics')
fs.rmSync(music, { recursive: true, force: true })
fs.rmSync(userData, { recursive: true, force: true })
fs.mkdirSync(path.join(music, 'Test', 'Lyrics'), { recursive: true })

const LYRICS = [
  '[ar:Test]',
  '[offset:+300]',
  '[00:05.00]First line',
  '[00:08]No fraction line',
  '[00:10.50][01:20.00]Chorus line (repeats)',
  '[0:15.00]One-digit minute',
  '[00:20.00]<00:20.00>Word <00:20.60>by <00:21.10>word',
].join('\n')
execFileSync('ffmpeg', [
  '-loglevel',
  'error',
  '-y',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=330:duration=90',
  '-af',
  'volume=0.1',
  '-c:a',
  'flac',
  '-metadata',
  'title=Embedded lyrics',
  '-metadata',
  'artist=Test',
  '-metadata',
  'album=Lyrics',
  '-metadata',
  `LYRICS=${LYRICS}`,
  path.join(music, 'Test', 'Lyrics', '01 - Embedded lyrics.flac'),
])

const errors = []
const sleep = (ms) => win.waitForTimeout(ms)
async function until(fn, ms = 8000) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    last = await fn()
    if (last) return last
    await sleep(200)
  }
  return last
}
async function api(endpoint, params = {}) {
  const c = await win.evaluate(() => window.api.localLibrary.connect())
  const salt = crypto.randomBytes(6).toString('hex')
  const t = crypto
    .createHash('md5')
    .update(c.password + salt)
    .digest('hex')
  const q = new URLSearchParams({
    u: c.username,
    t,
    s: salt,
    v: '1.16.1',
    c: 'e2e',
    f: 'json',
    ...params,
  })
  return (await (await fetch(`${c.url}/rest/${endpoint}?${q}`)).json())[
    'subsonic-response'
  ]
}
let passed = 0
let failed = 0
async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    console.log(
      `FAIL  ${name}: ${String(e?.message || e)
        .split('\n')[0]
        .slice(0, 300)}`,
    )
    await win
      .screenshot({
        path: `/tmp/e2e-local-lyrics-fail-${name.replace(/\W+/g, '_')}.png`,
      })
      .catch(() => {})
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}

const electronApp = await electron.launch({
  executablePath: path.join(app, 'node_modules/electron/dist/electron'),
  args: [
    app,
    '--no-sandbox',
    '--disable-gpu-sandbox',
    `--user-data-dir=${userData}`,
  ],
  cwd: app,
  env: { ...process.env, CLEARPLAY_E2E: '1' },
  timeout: 60000,
})
const win = await electronApp.firstWindow()
win.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
await win.waitForLoadState('domcontentloaded')
await electronApp.evaluate(({ webContents, BrowserWindow }) => {
  const bw = webContents
    .getAllWebContents()
    .map((c) => BrowserWindow.fromWebContents(c))
    .find(Boolean)
  bw?.setSize(1440, 900)
})
await win.waitForTimeout(2500)

let song
await test('the local server returns all 6 timed lines of the embedded tag', async () => {
  await win.evaluate((p) => window.api.localLibrary.addPath(p), music)
  await until(async () => {
    const s = await win.evaluate(() => window.api.localLibrary.state())
    return !s.scanning && s.tracks === 1
  }, 30000)
  await win.locator('[data-testid=login-local]').click()
  await until(
    async () => (await win.locator('input[name="url"]').count()) === 0,
    8000,
  )
  song = (await api('getRandomSongs', { size: 1 })).randomSongs.song[0]
  const sl = (await api('getLyricsBySongId', { id: song.id })).lyricsList
    .structuredLyrics[0]
  expect(sl?.synced, 'not synced')
  expect(
    JSON.stringify(sl.line.map((l) => l.start)) ===
      JSON.stringify([4700, 7700, 10200, 14700, 19700, 79700]),
    `starts ${JSON.stringify(sl.line.map((l) => l.start))}`,
  )
  expect(!sl.line.some((l) => /[<>]/.test(l.value)), 'word markers left')
})

const active = () =>
  win.evaluate(() => {
    const lines = [
      ...document.querySelectorAll('[role=dialog] p[lang], [role=dialog] p'),
    ]
    return lines.find((p) => p.style.opacity === '1')?.innerText ?? null
  })
const seekTo = async (s) => {
  await win.evaluate((t) => {
    document.querySelector('[data-testid=player-song-audio]').currentTime = t
  }, s)
  await sleep(900)
}

await test('fullscreen: every line on screen, the highlight moves line by line', async () => {
  await win.evaluate((s) => {
    window.__cp.player.getState().actions.setSongList([s], 0)
  }, song)
  await until(
    () =>
      win.evaluate(
        () =>
          (document.querySelector('[data-testid=player-song-audio]')
            ?.currentTime ?? 0) > 0.3,
      ),
    10000,
  )
  await win.evaluate(() =>
    window.__cp.player.getState().actions.setPlayingState(false),
  )
  await win.locator('[data-testid=track-fullscreen-button]').click()
  await sleep(1800)
  const text = await win.evaluate(
    () => document.querySelector('[role=dialog]')?.innerText ?? '',
  )
  for (const line of [
    'First line',
    'No fraction line',
    'Chorus line (repeats)',
    'One-digit minute',
    'Word by word',
  ])
    expect(text.includes(line), `"${line}" not on screen`)
  expect(!/<\d+:\d+/.test(text), 'a <mm:ss.xx> marker is on screen')
  const steps = [
    [4.9, 'First line'],
    [7.9, 'No fraction line'],
    [10.4, 'Chorus line (repeats)'],
    [14.9, 'One-digit minute'],
    [19.9, 'Word by word'],
    [40, 'Word by word'],
    [79.9, 'Chorus line (repeats)'],
  ]
  const seen = []
  for (const [t, want] of steps) {
    await seekTo(t)
    const got = await active()
    seen.push(`${t}s:${got}`)
    expect(
      got === want,
      `at ${t} s the highlight is on "${got}", expected "${want}" (${seen.join(' | ')})`,
    )
  }
})

// The queue panel's Save and Save as playlist send form POSTs; the local
// server used to ignore the body (empty queue, nameless empty playlist).
await test('local library: queue panel Save stores the queue (form POST)', async () => {
  await win.keyboard.press('Escape')
  await sleep(900)
  await win.locator('[data-testid=player-queue-button]').click()
  await sleep(1200)
  const tools = win
    .locator('[data-testid=queue-clear]')
    .locator('xpath=..')
    .locator('button')
  await tools.nth(0).click()
  const q = await until(async () => {
    const x = (await api('getPlayQueue')).playQueue
    return x?.entry?.length ? x : null
  }, 5000)
  expect(
    q?.entry?.[0]?.id === song.id,
    `saved queue ${JSON.stringify(q && q.entry?.map((e) => e.id))}`,
  )
  expect(q.current === song.id, `current ${q?.current}`)
  const toast = await until(
    () => win.getByText('Queue saved to the server').count(),
    4000,
  )
  expect(toast, 'no "Queue saved" message')
})

await test('local library: Save as playlist creates it with the songs (form POST)', async () => {
  const tools = win
    .locator('[data-testid=queue-clear]')
    .locator('xpath=..')
    .locator('button')
  await tools.nth(2).click()
  await win.getByPlaceholder('Playlist name').fill('Form post check')
  await win.keyboard.press('Enter')
  const pl = await until(async () => {
    const list = (await api('getPlaylists')).playlists?.playlist ?? []
    return list.find((p) => p.name === 'Form post check') ?? null
  }, 5000)
  expect(pl, 'playlist not created (or created without its name)')
  const full = (await api('getPlaylist', { id: pl.id })).playlist
  expect(
    full.entry?.length === 1 && full.entry[0].id === song.id,
    `songs ${JSON.stringify(full.entry?.map((e) => e.id))}`,
  )
})

await test('no page errors', async () => {
  expect(errors.length === 0, errors.join(' | '))
})

await electronApp.evaluate(({ app }) => app.quit()).catch(() => {})
await electronApp.waitForEvent('close', { timeout: 15000 }).catch(() => {})
fs.rmSync(music, { recursive: true, force: true })
fs.rmSync(userData, { recursive: true, force: true })
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
