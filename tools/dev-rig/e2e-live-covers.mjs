// Usage: node e2e-live-covers.mjs [filter]   (run through e2e-live-covers.sh)
// Live (animated) album covers on the album page, player bar, queue panel and
// fullscreen player, against a local fake of the cover service
// (lib/live-cover-service.mjs). The fake finds a stream only for a single,
// known artist name, like the real one, and its clip is frame-coded: every
// frame is one solid colour that encodes its number, so a screenshot tells
// which frame each screen is on.
//
// Needs the rig library from make_library.py (with the two-artist album
// "Twin Signals") and pnpm electron:build first.
// COST=1 instead measures renderer and GPU process CPU over 60 s with the
// album page and the player bar both showing a live cover (no checks).
// SCREENS: the screens that draw a live cover (default album,playerBar,
// fullscreen; album,playerBar for a build before 0.6.3).
// The queue panel has no cover.
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import {
  decodeFrame,
  frameDistance,
  startLiveCoverService,
} from './lib/live-cover-service.mjs'
import { cpuByType, findAlbum, launch, RIG, sleep } from './perf/lib.mjs'

const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null
const COST = process.env.COST === '1'
const SCREENS = new Set(
  (process.env.SCREENS || 'album,playerBar,fullscreen')
    .split(',')
    .map((x) => x.trim()),
)
const shots = path.join(RIG, 'live-covers')
fs.mkdirSync(shots, { recursive: true })

const svc = await startLiveCoverService({
  rig: RIG,
  known: {
    'Twin Signals': ['Rig Artist A', 'Rig Artist B'],
    'Neon Tides': ['Mira Vale'],
    'Paper Lanterns': ['Oskar Lind'],
    'Rates and Depths': ['Test Signals'],
  },
})

const s = await launch({
  userData: path.join(RIG, 'userdata-live-covers'),
  fresh: true,
  engine: 'html',
  size: [1440, 900],
})
const { app, win } = s
const warnings = []
win.on('console', (m) => {
  if (m.type() === 'warning') warnings.push(m.text().slice(0, 200))
})

const state = () =>
  win.evaluate(() => {
    const p = window.__cp.player.getState()
    return {
      title: p.songlist.currentSong?.title,
      album: p.songlist.currentSong?.album,
      index: p.songlist.currentSongIndex,
      playing: p.playerState.isPlaying,
      fullscreen: p.fullscreen.isFullscreen,
    }
  })
/** Calls a BrowserWindow method on the main window (minimize, restore…). */
const mainWindow = (method) =>
  app.evaluate(({ BrowserWindow, webContents }, m) => {
    const bw = webContents
      .getAllWebContents()
      .map((c) => BrowserWindow.fromWebContents(c))
      .find(Boolean)
    bw[m]()
  }, method)
const go = async (hash, wait = 1500) => {
  await win.evaluate((h) => {
    window.location.hash = h
  }, hash)
  await sleep(wait)
}
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
/** Live-cover settings (Settings → Appearance), through the app store. */
const artwork = (settings) =>
  win.evaluate((o) => {
    const art = window.__cp.app.getState().artwork
    if ('url' in o) {
      art.setCustomUrlEnabled(true)
      art.setBaseUrl(o.url)
    }
    if ('enabled' in o) art.setEnabled(o.enabled)
    if ('album' in o) art.screens.setAlbum(o.album)
    if (o.screens) {
      art.screens.setAlbum(o.screens.album)
      art.screens.setPlayerBar(o.screens.playerBar)
      art.screens.setFullscreen(o.screens.fullscreen)
    }
  }, settings)

// ---- what each screen shows
/**
 * Every live-cover <video> the screens render: which screen, where, and
 * whether it has a picture. A video is assigned to a screen by the static
 * cover it sits on (the same markup before and after 0.6.3).
 */
const videos = () =>
  win.evaluate(() =>
    [...document.querySelectorAll('video')]
      .map((v) => {
        const p = v.parentElement
        const screen = p?.querySelector('#cover-art-image')
          ? 'album'
          : p?.querySelector('#track-song-image')
            ? 'playerBar'
            : v.closest('[data-testid=fullscreen-cover]')
              ? 'fullscreen'
              : null
        if (!screen) return null
        const r = v.getBoundingClientRect()
        const hasFrame = v.readyState >= 2 && v.videoWidth > 0
        return {
          screen,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          hasFrame,
          paused: v.paused,
          // On screen and not covered (e.g. by the fullscreen player): the
          // element at the cover's centre belongs to this cover.
          visible:
            r.width > 4 &&
            r.height > 4 &&
            !!p?.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            ),
        }
      })
      .filter(Boolean),
  )
const byScreen = async () => {
  const out = {}
  for (const v of await videos()) out[v.screen] = v
  return out
}
const showing = async (screen) => {
  const v = (await byScreen())[screen]
  return v?.hasFrame && v.visible ? v : null
}

/** Screenshot; the frame number at the centre of each visible screen's cover. */
async function shotFrames(name) {
  const vs = (await videos()).filter((v) => v.visible)
  const buf = await win.screenshot({ path: path.join(shots, `${name}.png`) })
  const png = PNG.sync.read(buf)
  const out = {}
  for (const v of vs) {
    const cx = Math.round(v.x + v.w / 2)
    const cy = Math.round(v.y + v.h / 2)
    const acc = [0, 0, 0]
    let n = 0
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const i = ((cy + dy) * png.width + (cx + dx)) * 4
        acc[0] += png.data[i]
        acc[1] += png.data[i + 1]
        acc[2] += png.data[i + 2]
        n++
      }
    const rgb = acc.map((c) => Math.round(c / n))
    out[v.screen] = { frame: decodeFrame(rgb), rgb }
  }
  return out
}

/**
 * Frame number of every live-cover video read in the page at one instant
 * (drawImage of each element in a single task), visible or not.
 */
const pageFrames = () =>
  win.evaluate(async () => {
    const LEVELS = [20, 90, 160, 230]
    const digit = (v) => {
      let best = 0
      for (let i = 1; i < 4; i++)
        if (Math.abs(LEVELS[i] - v) < Math.abs(LEVELS[best] - v)) best = i
      return Math.abs(LEVELS[best] - v) <= 30 ? best : null
    }
    const c = document.createElement('canvas')
    c.width = c.height = 8
    const ctx = c.getContext('2d', { willReadFrequently: true })
    const out = {}
    for (const v of document.querySelectorAll('video')) {
      const p = v.parentElement
      const screen = p?.querySelector('#cover-art-image')
        ? 'album'
        : p?.querySelector('#track-song-image')
          ? 'playerBar'
          : v.closest('[data-testid=fullscreen-cover]')
            ? 'fullscreen'
            : null
      if (!screen || v.readyState < 2) continue
      ctx.drawImage(v, 0, 0, 8, 8)
      const [r, g, b] = ctx.getImageData(4, 4, 1, 1).data
      const d = [digit(r), digit(g), digit(b)]
      out[screen] = d.includes(null) ? null : d[0] + 4 * d[1] + 16 * d[2]
    }
    return out
  })

function inStep(frames, screens, what) {
  const got = screens.map((sc) => frames[sc]?.frame ?? frames[sc])
  if (got.some((f) => f === null || f === undefined))
    throw new Error(
      `${what}: no frame on ${screens.join('/')}: ${JSON.stringify(frames)}`,
    )
  const d = frameDistance(got[0], got[1])
  if (d > 1)
    throw new Error(
      `${what}: ${screens.join(' vs ')} frames ${got.join(' vs ')} (${d} apart)`,
    )
  return got
}

// ---- tiny test runner (as e2e.mjs)
let failed = 0
let passed = 0
const report = {}
let skipped = 0
function skip(name, why) {
  if (filter && !filter.test(name)) return
  skipped++
  report[name] = `SKIP: ${why}`
  console.log(`SKIP  ${name}: ${why}`)
}
async function test(name, fn) {
  if (filter && !filter.test(name)) return
  try {
    const r = await fn()
    if (r !== undefined) report[name] = r
    passed++
    console.log(
      `PASS  ${name}${r !== undefined ? `  ${JSON.stringify(r)}` : ''}`,
    )
  } catch (e) {
    failed++
    const msg = String(e?.message || e)
      .split('\n')[0]
      .slice(0, 300)
    report[name] = `FAIL: ${msg}`
    console.log(`FAIL  ${name}: ${msg}`)
    await win
      .screenshot({
        path: path.join(shots, `fail-${name.replace(/\W+/g, '_')}.png`),
      })
      .catch(() => {})
    await win.keyboard.press('Escape').catch(() => {})
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

async function playAlbum(albumId) {
  await go(`/library/albums/${albumId}`, 1800)
  await win
    .getByRole('button', { name: /^(Play all|Pause)$/ })
    .first()
    .click()
  await until(async () => (await state()).playing)
}
async function queuePanel(open) {
  const isOpen = await win.evaluate(() => {
    const p = window.__cp.player.getState().playerState
    return p.mainDrawerState && p.queueState
  })
  if (isOpen !== open)
    await win.locator('[data-testid=player-queue-button]').click()
  await sleep(900)
}
async function fullscreen(open) {
  await win.evaluate(
    (o) => window.__cp.player.getState().fullscreen.setIsFullscreen(o),
    open,
  )
  await sleep(1300)
}
async function stopPlayback() {
  await win.evaluate(() => {
    const p = window.__cp.player.getState()
    if (p.playerState.isPlaying) p.actions.togglePlayPause()
    p.actions.clearPlayerState?.()
  })
  await sleep(500)
}

// ======================= setup =======================
await artwork({ url: svc.url, enabled: true })
const twin = await findAlbum('Twin Signals')
const neon = await findAlbum('Neon Tides')
const paper = await findAlbum('Paper Lanterns')
const cold = await findAlbum('Cold Harbour')
const rates = await findAlbum('Rates and Depths')
expect(
  twin && neon && paper && cold && rates,
  'rig library is missing an album (rerun make_library.py)',
)

if (COST) {
  // Album page + player bar both showing Neon Tides' live cover, 60 s.
  await playAlbum(neon.id)
  await until(() => showing('album'))
  await until(() => showing('playerBar'))
  await sleep(3000)
  const vs = await byScreen()
  const cpu = await cpuByType(app, 60000)
  const out = {
    screens: Object.fromEntries(
      Object.entries(vs).map(([k, v]) => [k, v.hasFrame]),
    ),
    hls: svc.hls(),
    cpu,
  }
  console.log(JSON.stringify(out, null, 2))
  fs.writeFileSync(
    path.join(shots, `cost-${Date.now()}.json`),
    JSON.stringify(out, null, 2),
  )
  await s.close()
  await svc.close()
  process.exit(0)
}

// ======================= checks =======================
await test('two-artist album: live cover on the album page', async () => {
  svc.reset()
  await go(`/library/albums/${twin.id}`, 500)
  const v = await until(() => showing('album'))
  const sent = svc.searches.map((x) => `${x.artist} → ${x.status}`)
  expect(
    v,
    `no live cover on the album page; the album page asked for: ${JSON.stringify(sent)}`,
  )
  return { albumPageAsked: sent }
})

await test('two-artist album: live cover in the player bar', async () => {
  const before = svc.searches.length
  await playAlbum(twin.id)
  const v = await until(() => showing('playerBar'))
  const sent = svc.searches
    .slice(before)
    .map((x) => `${x.artist} → ${x.status}`)
  expect(
    v,
    `no live cover in the player bar; it asked for: ${JSON.stringify(sent)}`,
  )
  return { songScreensAsked: sent }
})

await test('two-artist album: live cover on the song with a featured artist', async () => {
  const before = svc.searches.length
  await win.locator('[data-testid=player-button-next]').click()
  await until(async () => (await state()).title === 'Crossing')
  await sleep(1500)
  const v = await until(() => showing('playerBar'))
  const sent = svc.searches
    .slice(before)
    .map((x) => `${x.artist} → ${x.status}`)
  expect(
    v,
    `no live cover in the player bar on "Crossing"; asked for: ${JSON.stringify(sent)}`,
  )
  return { asked: sent }
})

for (const [screen, label, open] of [
  ['fullscreen', 'fullscreen player', fullscreen],
]) {
  const name = `two-artist album: live cover in the ${label}`
  if (!SCREENS.has(screen)) {
    skip(name, `the ${label} draws no live cover (SCREENS=${[...SCREENS]})`)
    continue
  }
  await test(name, async () => {
    await open(true)
    const v = await until(() => showing(screen))
    await open(false)
    expect(v, `no live cover in the ${label}`)
  })
}

await stopPlayback()
await go('/', 2500) // let every player go (the shared one waits ~2 s)

await test('one-artist album: one search with the album artist string', async () => {
  svc.reset()
  await go(`/library/albums/${neon.id}`, 500)
  await until(() => showing('album'))
  await win
    .getByRole('button', { name: /^(Play all|Pause)$/ })
    .first()
    .click()
  await until(() => showing('playerBar'))
  await sleep(2000)
  const sent = svc.searches.map((x) => `${x.artist}|${x.album}`)
  expect(
    sent.length === 1 && sent[0] === 'Mira Vale|Neon Tides',
    `expected one search "Mira Vale|Neon Tides", got ${JSON.stringify(sent)}`,
  )
  return sent
})

await test('one stream download for two screens', async () => {
  // Album page and player bar have both been showing Neon Tides.
  await sleep(3000)
  const h = svc.hls()[svc.albumKey('Neon Tides')] ?? {
    playlist: 0,
    segments: 0,
  }
  expect(
    h.playlist === 1 && h.segments <= 2,
    `playlist fetched ${h.playlist}×, segments ${h.segments}× (2 segments in the clip)`,
  )
  return h
})

await test('in step: album page and player bar', async () => {
  const f = await shotFrames('step-same-time')
  return inStep(f, ['album', 'playerBar'], 'same album')
})

await test('in step: album page opened after 10 s of playing', async () => {
  await go('/library/artists', 10000)
  await go(`/library/albums/${neon.id}`, 500)
  await until(() => showing('album'))
  await sleep(1500)
  const f = await shotFrames('step-open-after-10s')
  return inStep(f, ['album', 'playerBar'], 'after 10 s')
})

await test('in step: another page and back', async () => {
  await go('/library/artists', 1200)
  await go(`/library/albums/${neon.id}`, 500)
  await until(() => showing('album'))
  await sleep(1000)
  const f = await shotFrames('step-page-and-back')
  return inStep(f, ['album', 'playerBar'], 'page and back')
})

await test('in step: next song of the same album (clip keeps going)', async () => {
  const playlists = () => svc.hls()[svc.albumKey('Neon Tides')]?.playlist ?? 0
  const before = await pageFrames()
  const fetched = playlists()
  const t0 = Date.now()
  await win.locator('[data-testid=player-button-next]').click()
  await until(async () => (await state()).index === 1)
  await sleep(1200)
  const f = await shotFrames('step-next-song')
  const frames = inStep(f, ['album', 'playerBar'], 'next song')
  // A clip that restarts loads its playlist again and jumps back; a running
  // one is where the clock says (6 frames allowed for click and screenshot).
  const expected =
    Math.round(before.playerBar + ((Date.now() - t0) / 1000) * 30) % 60
  const drift = frameDistance(frames[1], expected)
  expect(
    playlists() === fetched,
    `the stream was loaded again (${fetched} → ${playlists()} playlist requests)`,
  )
  expect(
    drift <= 8,
    `player bar clip restarted? frame ${frames[1]}, expected about ${expected}`,
  )
  return { frames, expected, playlistRequests: playlists() }
})

await test('in step: minimize and restore', async () => {
  await mainWindow('minimize')
  await sleep(4000)
  await mainWindow('restore')
  await sleep(2500)
  const a = await shotFrames('step-restore-1')
  await sleep(400)
  const b = await shotFrames('step-restore-2')
  inStep(a, ['album', 'playerBar'], 'after restore')
  inStep(b, ['album', 'playerBar'], 'after restore (+0.4 s)')
  expect(
    a.album.frame !== b.album.frame && a.playerBar.frame !== b.playerBar.frame,
    `not playing after restore: ${a.album.frame}→${b.album.frame}, ${a.playerBar.frame}→${b.playerBar.frame}`,
  )
  return [a.album.frame, a.playerBar.frame, b.album.frame, b.playerBar.frame]
})

await test('in step: opening the fullscreen player', async () => {
  await fullscreen(true)
  if (SCREENS.has('fullscreen')) await until(() => showing('fullscreen'))
  await sleep(1500)
  const shot = await shotFrames('step-fullscreen')
  // Under the sheet the album page and player bar still play: read their
  // frames in the page, at one instant.
  const p = await pageFrames()
  inStep(p, ['album', 'playerBar'], 'album page vs player bar under fullscreen')
  if (SCREENS.has('fullscreen')) {
    expect(
      shot.fullscreen?.frame != null,
      `fullscreen shows no clip frame: ${JSON.stringify(shot)}`,
    )
    inStep(p, ['fullscreen', 'playerBar'], 'fullscreen vs player bar (in page)')
    inStep(p, ['fullscreen', 'album'], 'fullscreen vs album page (in page)')
  }
  await fullscreen(false)
  await sleep(800)
  const after = await shotFrames('step-fullscreen-closed')
  inStep(after, ['album', 'playerBar'], 'after closing fullscreen')
  return {
    underSheet: p,
    afterClosing: [after.album.frame, after.playerBar.frame],
  }
})

await test('in step: opening the queue panel', async () => {
  await queuePanel(true)
  await sleep(1200)
  const p = await pageFrames()
  inStep(
    p,
    ['album', 'playerBar'],
    'album page vs player bar with the queue open',
  )
  const shot = await shotFrames('step-queue-open')
  await queuePanel(false)
  inStep(shot, ['album', 'playerBar'], 'screenshot with the queue open')
  return p
})

await test('in step: stays together for 20 s', async () => {
  const seen = []
  for (let i = 0; i < 5; i++) {
    await sleep(4000)
    const f = await shotFrames(`step-hold-${i}`)
    seen.push(inStep(f, ['album', 'playerBar'], `after ${(i + 1) * 4} s`))
  }
  return seen
})

// Every combination of the three screen switches, with live covers on:
// a screen shows its live cover exactly when its switch is on, and the
// screens that show one are on the same frame.
for (const combo of [0, 1, 2, 3, 4, 5, 6, 7]) {
  const on = {
    album: Boolean(combo & 1),
    playerBar: Boolean(combo & 2),
    fullscreen: Boolean(combo & 4),
  }
  const label = Object.entries(on)
    .map(([k, v]) => `${k} ${v ? 'on' : 'off'}`)
    .join(', ')
  await test(`switches: ${label}`, async () => {
    await artwork({ screens: on })
    await go(`/library/albums/${neon.id}`, 500)
    for (const sc of ['album', 'playerBar']) {
      if (on[sc])
        expect(await until(() => showing(sc)), `no live cover on ${sc}`)
    }
    await sleep(1200)
    const page = await byScreen()
    for (const sc of ['album', 'playerBar'])
      if (!on[sc])
        expect(!page[sc], `${sc} shows a live cover with its switch off`)
    const shot = await shotFrames(`switches-${combo}`)
    if (on.album && on.playerBar) inStep(shot, ['album', 'playerBar'], label)
    await fullscreen(true)
    if (on.fullscreen)
      expect(
        await until(() => showing('fullscreen')),
        'no live cover in fullscreen',
      )
    await sleep(1200)
    const fs = await byScreen()
    if (!on.fullscreen)
      expect(
        !fs.fullscreen,
        'fullscreen shows a live cover with its switch off',
      )
    const p = await pageFrames()
    const shown = ['album', 'playerBar', 'fullscreen'].filter((sc) => on[sc])
    for (let i = 1; i < shown.length; i++)
      inStep(p, [shown[0], shown[i]], `${label} (in page)`)
    await fullscreen(false)
    return Object.fromEntries(shown.map((sc) => [sc, p[sc]]))
  })
}
await artwork({ screens: { album: true, playerBar: true, fullscreen: true } })

await test('switches: global off removes every video and asks nothing', async () => {
  await artwork({ enabled: false })
  await sleep(800)
  svc.reset()
  await go(`/library/albums/${paper.id}`, 1500)
  await playAlbum(paper.id)
  await queuePanel(true)
  await sleep(1500)
  const n = (await videos()).length
  await queuePanel(false)
  const asked = svc.searches.length
  const hlsHits = Object.keys(svc.hls()).length
  await stopPlayback()
  await go('/', 800)
  await artwork({ enabled: true })
  expect(n === 0, `${n} live-cover videos with live covers off`)
  expect(
    asked === 0 && hlsHits === 0,
    `${asked} searches, ${hlsHits} streams with live covers off`,
  )
})

await stopPlayback()

await test('errors: service down keeps the static cover', async () => {
  svc.setMode('down')
  const errBefore = s.errors.length
  await go(`/library/albums/${cold.id}`, 3000)
  const v = await byScreen()
  const cover = await win.evaluate(() => {
    const i = document.querySelector('#cover-art-image')
    return i ? { complete: i.complete, w: i.naturalWidth } : null
  })
  svc.setMode('ok')
  expect(!v.album?.hasFrame, 'a video shows with the service down')
  expect(cover?.w > 0, 'static cover missing')
  const newErrors = s.errors.slice(errBefore)
  expect(newErrors.length === 0, `console errors: ${JSON.stringify(newErrors)}`)
  return {
    warnings: warnings.filter((w) => /animated artwork/i.test(w)).length,
  }
})

await test('errors: broken stream keeps the static cover', async () => {
  svc.setMode('broken')
  const errBefore = s.errors.length
  // Never opened before: this is its first search.
  await go(`/library/albums/${rates.id}`, 6000)
  const v = await byScreen()
  const cover = await win.evaluate(() => {
    const i = document.querySelector('#cover-art-image')
    return i ? { w: i.naturalWidth } : null
  })
  svc.setMode('ok')
  expect(!v.album?.hasFrame, 'a video frame shows from a broken stream')
  expect(cover?.w > 0, 'static cover missing')
  const newErrors = s.errors.slice(errBefore)
  expect(newErrors.length === 0, `console errors: ${JSON.stringify(newErrors)}`)
  return { hls: svc.hls() }
})

await test('no page errors', async () => {
  expect(s.errors.length === 0, JSON.stringify(s.errors.slice(0, 5)))
})

fs.writeFileSync(
  path.join(shots, `report-${Date.now()}.json`),
  JSON.stringify({ report, searches: svc.searches, warnings }, null, 2),
)
console.log(
  `${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`,
)
await s.close()
await svc.close()
process.exit(failed ? 1 : 0)
