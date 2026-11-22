// Usage: node e2e.mjs [filter]   (run through tools/dev-rig/e2e.sh)
// Clicks through the built app against the rig's Navidrome and checks that
// each control does what it should. Prints PASS/FAIL per check and exits 1 on
// any failure. State is read through window.__cp (only present with
// CLEARPLAY_E2E=1); every action is a real click or key press.
import { _electron as electron } from 'playwright-core'
import crypto from 'node:crypto'
import path from 'node:path'

const app = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const rig = process.env.RIG || '/tmp/clearplay-rig'
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null
const ND = 'http://127.0.0.1:4533'

// ---- Navidrome API (to check what the app saved on the server) ----
async function api(endpoint, params = {}) {
  const salt = crypto.randomBytes(6).toString('hex')
  const token = crypto.createHash('md5').update(`test1234${salt}`).digest('hex')
  const q = new URLSearchParams({ u: 'admin', t: token, s: salt, v: '1.16.1', c: 'e2e', f: 'json', ...params })
  const res = await fetch(`${ND}/rest/${endpoint}?${q}`)
  return (await res.json())['subsonic-response']
}
async function songById(id) {
  return (await api('getSong', { id })).song
}
async function allSongs() {
  return (await api('search3', { query: '', songCount: 500, albumCount: 0, artistCount: 0 })).searchResult3.song
}
const currentId = () => win.evaluate(() => window.__cp.player.getState().songlist.currentSong.id)

// ---- app ----
const electronApp = await electron.launch({
  executablePath: path.join(app, 'node_modules/electron/dist/electron'),
  args: [app, '--no-sandbox', '--disable-gpu-sandbox', `--user-data-dir=${path.join(rig, 'userdata')}`],
  cwd: app,
  env: { ...process.env, CLEARPLAY_E2E: '1' },
  timeout: 60000,
})
const win = await electronApp.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
await win.waitForLoadState('domcontentloaded')
await setSize(1440, 900)
await win.waitForTimeout(2500)
if (await win.locator('input[name="url"]').count()) {
  await win.fill('input[name="url"]', ND)
  await win.fill('input[name="username"]', 'admin')
  await win.fill('input[name="password"]', 'test1234')
  await win.keyboard.press('Enter')
  await win.waitForTimeout(4000)
}

async function setSize(w, h) {
  await electronApp.evaluate(({ webContents, BrowserWindow }, [w, h]) => {
    const bw = webContents.getAllWebContents().map((c) => BrowserWindow.fromWebContents(c)).find(Boolean)
    bw.setMinimumSize(400, 300)
    bw.setFullScreen(false)
    bw.setSize(w, h)
  }, [w, h])
}

const sleep = (ms) => win.waitForTimeout(ms)
const go = async (hash) => {
  await win.evaluate((h) => { window.location.hash = h }, hash)
  await sleep(1200)
}
/** Summary of the player state. */
const state = () =>
  win.evaluate(() => {
    const s = window.__cp.player.getState()
    const list = s.songlist.currentList
    return {
      titles: list.map((x) => x.title),
      ids: list.map((x) => x.id),
      index: s.songlist.currentSongIndex,
      title: s.songlist.currentSong?.title,
      playing: s.playerState.isPlaying,
      shuffle: s.playerState.isShuffleActive,
      loop: s.playerState.loopState,
      fullscreen: s.fullscreen.isFullscreen,
      volume: s.playerState.volume,
    }
  })
const audio = () =>
  win.evaluate(() => {
    const a = document.querySelector('[data-testid=player-song-audio]')
    return a ? { paused: a.paused, time: a.currentTime, src: a.src } : null
  })
async function until(fn, ms = 4000) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    last = await fn()
    if (last) return last
    await sleep(150)
  }
  return last
}

// ---- tiny test runner ----
let failed = 0
let passed = 0
const results = []
async function test(name, fn) {
  if (filter && !filter.test(name)) return
  try {
    await fn()
    passed++
    results.push(`PASS  ${name}`)
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    const msg = String(e?.message || e).split('\n')[0].slice(0, 220)
    results.push(`FAIL  ${name}: ${msg}`)
    console.log(`FAIL  ${name}: ${msg}`)
    await win.screenshot({ path: `/tmp/e2e-fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {})
    await win.keyboard.press('Escape').catch(() => {})
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}
const eq = (a, b, what) => expect(JSON.stringify(a) === JSON.stringify(b), `${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)

async function playAlbumTrack(album, track) {
  await go('/library/albums')
  await win.getByText(album, { exact: true }).first().click()
  await sleep(1200)
  await win.getByText(track, { exact: true }).first().dblclick()
  await until(async () => (await state()).title === track && (await state()).playing)
}
async function closeFullscreen() {
  if ((await state()).fullscreen) {
    await win.locator('[role=dialog] .electron-drag button').first().click()
    await sleep(900)
  }
}
async function rail(icon) {
  await win.locator(`nav a:has(${icon})`).click()
  await sleep(600)
}
async function contextMenu(text) {
  await win.getByText(text, { exact: true }).first().click({ button: 'right' })
  await sleep(400)
}
async function menuItem(label) {
  await win.getByRole('menuitem', { name: label }).first().click()
  await sleep(500)
}

// ======================= checks =======================

// Known starting point: repeat off, shuffle off.
await win.evaluate(() => {
  const p = window.__cp.player.getState()
  if (p.playerState.isShuffleActive) p.actions.toggleShuffle()
  while (window.__cp.player.getState().playerState.loopState !== 0) p.actions.toggleLoop()
})

await test('play a song by double-clicking it', async () => {
  await playAlbumTrack('Neon Tides', 'Signal')
  const s = await state()
  eq(s.title, 'Signal', 'playing title')
  expect(s.playing, 'not playing')
  const a = await until(async () => { const x = await audio(); return x && !x.paused && x.time > 0.3 ? x : null })
  expect(a, 'audio element is not advancing')
})

await test('player bar: next and previous', async () => {
  const before = await state()
  await win.locator('[data-testid=player-button-next]').click()
  await until(async () => (await state()).index === before.index + 1)
  eq((await state()).index, before.index + 1, 'index after next')
  await win.locator('[data-testid=player-button-prev]').click()
  await until(async () => (await state()).index === before.index)
  eq((await state()).index, before.index, 'index after prev')
})

await test('player bar: play/pause', async () => {
  const btn = win.locator('[data-testid=player-button-pause]').or(win.locator('[data-testid=player-button-play]'))
  await btn.first().click()
  await until(async () => !(await state()).playing)
  expect(!(await state()).playing, 'still playing after pause')
  expect((await audio()).paused, 'audio not paused')
  await btn.first().click()
  await until(async () => (await state()).playing)
  expect((await state()).playing, 'not playing after play')
})

await test('player bar: shuffle on/off keeps the current song', async () => {
  const before = await state()
  await win.locator('[data-testid=player-button-shuffle]').click()
  await sleep(300)
  let s = await state()
  expect(s.shuffle, 'shuffle not on')
  eq(s.title, before.title, 'song changed when shuffling')
  await win.locator('[data-testid=player-button-shuffle]').click()
  await sleep(300)
  s = await state()
  expect(!s.shuffle, 'shuffle not off')
  eq(s.titles, before.titles, 'order not restored')
  eq(s.title, before.title, 'song changed when unshuffling')
})

await test('player bar: repeat cycles off → all → one → off', async () => {
  const seen = [(await state()).loop]
  for (let i = 0; i < 3; i++) {
    await win.locator('[data-testid=player-button-loop]').click()
    await sleep(200)
    seen.push((await state()).loop)
  }
  eq(seen, [0, 1, 2, 0], 'loop states')
})

await test('player bar: seek by clicking the progress bar', async () => {
  const bar = win.locator('[data-testid=player-progress-slider]')
  const box = await bar.boundingBox()
  await win.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2)
  await sleep(500)
  const a = await audio()
  const d = await win.evaluate(() => document.querySelector('[data-testid=player-song-audio]').duration)
  expect(a.time > d * 0.45, `did not seek (time ${a.time.toFixed(1)} of ${d.toFixed(1)})`)
})

await test('player bar: like saves to the server', async () => {
  const id = await currentId()
  await win.locator('[data-testid=player-like-button]').click()
  await sleep(900)
  expect((await songById(id)).starred, 'not starred on server')
  await win.locator('[data-testid=player-like-button]').click()
  await sleep(900)
  expect(!(await songById(id)).starred, 'still starred on server')
})

await test('player bar: star rating saves to the server', async () => {
  const id = await currentId()
  await win.locator('[data-testid=track-quality] + [data-testid=star-rating] [role=radio]').nth(3).click()
  await sleep(900)
  eq((await songById(id)).userRating, 4, 'rating on server')
  // Same star again clears it.
  await win.locator('[data-testid=track-quality] + [data-testid=star-rating] [role=radio]').nth(3).click()
  await sleep(900)
  eq((await songById(id)).userRating ?? 0, 0, 'rating after clearing')
})

await test('song menu: Play next on a song further down the queue moves it up', async () => {
  await playAlbumTrack('Neon Tides', 'Opening')
  const s = await state()
  const target = s.titles[s.index + 3]
  expect(target, 'album too short for this test')
  await contextMenu(target)
  await menuItem(/play next/i)
  const after = await state()
  eq(after.titles[after.index + 1], target, 'song after the current one')
  eq(after.title, 'Opening', 'current song')
  eq(after.titles.length, s.titles.length, 'queue length (no duplicates)')
})

await test('song menu: Play next on a song from another album', async () => {
  const s = await state()
  await go('/library/albums')
  await win.getByText('Paper Lanterns', { exact: true }).first().click()
  await sleep(1200)
  // The test library repeats titles across albums, so compare ids.
  const other = (await allSongs()).find((x) => x.album === 'Paper Lanterns' && !s.ids.includes(x.id))
  expect(other, 'no song outside the queue')
  await contextMenu(other.title)
  await menuItem(/play next/i)
  const after = await state()
  eq(after.ids[after.index + 1], other.id, 'inserted after current')
  eq(after.titles.length, s.titles.length + 1, 'queue length')
})

await test('song menu: Add to end of queue', async () => {
  await playAlbumTrack('Neon Tides', 'Opening')
  await go('/library/albums')
  await win.getByText('Paper Lanterns', { exact: true }).first().click()
  await sleep(1200)
  const s = await state()
  // Third row of the open album (Paper Lanterns), not yet in the queue.
  const album = (await allSongs()).filter((x) => x.album === 'Paper Lanterns').sort((a, b) => a.track - b.track)
  const other = album.find((x, i) => i >= 2 && !s.ids.includes(x.id))
  expect(other, 'no song left outside the queue')
  await win.locator('[role=row]:not(aside [role=row])').filter({ hasText: other.title }).first().click({ button: 'right' })
  await sleep(400)
  await menuItem(/add (to )?(the )?end|play last|add last/i)
  const after = await state()
  eq(after.ids[after.ids.length - 1], other.id, 'last song')
  expect(after.playing === s.playing, 'play state changed by adding to the queue')
})

await test('song menu: rating row saves to the server', async () => {
  const song = (await allSongs()).find((x) => x.album === 'Paper Lanterns')
  await contextMenu(song.title)
  await win.locator('[data-testid=menu-rating-row] [role=radio]').nth(1).click()
  await sleep(800)
  eq((await songById(song.id)).userRating, 2, 'rating')
  await win.locator('[data-testid=menu-rating-row] [role=radio]').nth(1).click()
  await sleep(800)
  await win.keyboard.press('Escape')
  eq((await songById(song.id)).userRating ?? 0, 0, 'cleared')
})

await test('queue panel: opens and lists the queue', async () => {
  await win.locator('[data-testid=player-queue-button]').click()
  await sleep(700)
  const rows = await win.locator('aside [data-row-index]').count()
  expect(rows > 3, `only ${rows} rows`)
})

await test('queue panel: clicking a row plays it', async () => {
  const s = await state()
  const target = s.index + 2
  await win.locator(`aside [data-row-index="${target}"]`).click()
  await until(async () => (await state()).index === target)
  eq((await state()).index, target, 'index')
})

await test('queue panel: drag a song down to a new place', async () => {
  const s = await state()
  const from = s.index + 1
  const to = s.index + 3
  const src = await win.locator(`aside [data-row-index="${from}"]`).boundingBox()
  const dst = await win.locator(`aside [data-row-index="${to}"]`).boundingBox()
  await win.mouse.move(src.x + src.width / 2, src.y + src.height / 2)
  await win.mouse.down()
  await win.mouse.move(src.x + src.width / 2, src.y + src.height / 2 + 10, { steps: 3 })
  await win.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 12 })
  await sleep(200)
  await win.mouse.up()
  await sleep(500)
  const after = await state()
  eq(after.titles[to], s.titles[from], 'moved song')
  eq(after.title, s.title, 'current song unchanged (drop must not play it)')
  eq(after.titles.length, s.titles.length, 'length')
})

await test('queue panel: drag a song up above the playing one', async () => {
  const s = await state()
  const from = s.index + 2
  const to = Math.max(0, s.index - 1)
  const src = await win.locator(`aside [data-row-index="${from}"]`).boundingBox()
  const dst = await win.locator(`aside [data-row-index="${to}"]`).boundingBox()
  await win.mouse.move(src.x + 40, src.y + src.height / 2)
  await win.mouse.down()
  await win.mouse.move(src.x + 40, src.y + src.height / 2 - 10, { steps: 3 })
  await win.mouse.move(dst.x + 40, dst.y + dst.height / 2, { steps: 12 })
  await sleep(200)
  await win.mouse.up()
  await sleep(500)
  const after = await state()
  eq(after.titles[to], s.titles[from], 'moved song')
  eq(after.title, s.title, 'current song')
  eq(after.titles[after.index], s.title, 'index follows the current song')
  expect(after.playing, 'stopped playing')
})

await test('queue panel: Escape cancels a drag', async () => {
  const s = await state()
  const src = await win.locator(`aside [data-row-index="${s.index + 1}"]`).boundingBox()
  await win.mouse.move(src.x + 40, src.y + 30)
  await win.mouse.down()
  await win.mouse.move(src.x + 40, src.y + 140, { steps: 8 })
  await win.keyboard.press('Escape')
  await win.mouse.up()
  await sleep(400)
  eq((await state()).titles, s.titles, 'order changed')
})

await test('queue panel: clear keeps the playing song', async () => {
  const s = await state()
  await win.locator('[data-testid=queue-clear]').click()
  await sleep(500)
  const after = await state()
  eq(after.titles, [s.title], 'queue after clear')
  expect(after.playing, 'stopped playing')
  await win.locator('[data-testid=player-queue-button]').click()
  await sleep(400)
})

await test('fullscreen: open, next, previous, play/pause, close', async () => {
  await playAlbumTrack('Cold Harbour', 'Ember')
  const s = await state()
  await win.locator('[data-testid=track-fullscreen-button]').click()
  await sleep(1300)
  expect((await state()).fullscreen, 'fullscreen did not open')
  const dlg = win.locator('[role=dialog]')
  await dlg.locator('button:has(svg.lucide-skip-forward)').click()
  await until(async () => (await state()).index === s.index + 1)
  eq((await state()).index, s.index + 1, 'next')
  await dlg.locator('button:has(svg.lucide-skip-back)').click()
  await until(async () => (await state()).index === s.index)
  eq((await state()).index, s.index, 'previous')
  await dlg.locator('button:has(svg.cp-playpause)').click()
  await until(async () => !(await state()).playing)
  expect(!(await state()).playing, 'pause')
  await dlg.locator('button:has(svg.cp-playpause)').click()
  await until(async () => (await state()).playing)
  expect((await state()).playing, 'play')
  await dlg.locator('button:has(svg.lucide-shuffle)').click()
  await sleep(200)
  expect((await state()).shuffle, 'shuffle')
  await dlg.locator('button:has(svg.lucide-shuffle)').click()
  const repeat = dlg.locator('button:has(svg.lucide-skip-forward)').locator('xpath=following::button[1]')
  const loop0 = (await state()).loop
  await repeat.click()
  await sleep(200)
  eq((await state()).loop, (loop0 + 1) % 3, 'repeat')
  while ((await state()).loop !== 0) {
    await repeat.click()
    await sleep(200)
  }
  await closeFullscreen()
  expect(!(await state()).fullscreen, 'did not close')
})

await test('fullscreen: lyrics and queue toggles', async () => {
  await win.locator('[data-testid=track-fullscreen-button]').click()
  await sleep(1300)
  const top = win.locator('[role=dialog] .electron-drag button')
  const n = await top.count()
  expect(n >= 3, 'top buttons missing')
  await top.nth(n - 1 >= 2 ? 2 : 1).click()
  await sleep(500)
  expect((await win.locator('[role=dialog] [data-row-index]').count()) > 0, 'queue not shown')
  await top.nth(1).click()
  await sleep(500)
  await closeFullscreen()
})

await test('fullscreen: works with the window in fullscreen mode', async () => {
  await electronApp.evaluate(({ webContents, BrowserWindow }) => {
    BrowserWindow.fromWebContents(webContents.getAllWebContents()[0]).setFullScreen(true)
  })
  await sleep(1200)
  const s = await state()
  await win.locator('[data-testid=track-fullscreen-button]').click()
  await sleep(1300)
  await win.locator('[role=dialog] button:has(svg.lucide-skip-forward)').click()
  await until(async () => (await state()).index === s.index + 1)
  eq((await state()).index, s.index + 1, 'next in window fullscreen')
  await win.locator('[role=dialog] button:has(svg.lucide-skip-back)').click()
  await until(async () => (await state()).index === s.index)
  eq((await state()).index, s.index, 'previous in window fullscreen')
  await closeFullscreen()
  await setSize(1440, 900)
  await sleep(800)
})

await test('header: back and forward navigation', async () => {
  await rail('svg.lucide-library-big')
  await win.locator('header a[href="#/library/artists"]').first().click()
  await sleep(500)
  await rail('svg.lucide-search')
  const back = win.locator('header button:has(svg.lucide-chevron-left)')
  const fwd = win.locator('header button:has(svg.lucide-chevron-right)')
  await back.click()
  await sleep(500)
  expect((await win.evaluate(() => location.hash)).includes('/library/artists'), 'back did not go to artists')
  await fwd.click()
  await sleep(500)
  expect((await win.evaluate(() => location.hash)).includes('/search'), 'forward did not go to search')
})

await test('header: back and forward with the window in fullscreen mode', async () => {
  await electronApp.evaluate(({ webContents, BrowserWindow }) => {
    BrowserWindow.fromWebContents(webContents.getAllWebContents()[0]).setFullScreen(true)
  })
  await sleep(1200)
  await rail('svg.lucide-library-big')
  await rail('svg.lucide-chart-column-big')
  await win.locator('header button:has(svg.lucide-chevron-left)').click()
  await sleep(500)
  expect((await win.evaluate(() => location.hash)).includes('/library'), 'back failed in fullscreen')
  await win.locator('header button:has(svg.lucide-chevron-right)').click()
  await sleep(500)
  expect((await win.evaluate(() => location.hash)).includes('/stats'), 'forward failed in fullscreen')
  await setSize(1440, 900)
  await sleep(800)
})

await test('mouse back/forward buttons navigate', async () => {
  await rail('svg.lucide-library-big')
  await rail('svg.lucide-search')
  await win.mouse.move(700, 400)
  await win.evaluate(() => {
    for (const type of ['mousedown', 'mouseup']) {
      window.dispatchEvent(new MouseEvent(type, { button: 3, bubbles: true }))
    }
  })
  await sleep(600)
  expect((await win.evaluate(() => location.hash)).includes('/library'), 'mouse back did not navigate')
  await win.evaluate(() => {
    for (const type of ['mousedown', 'mouseup']) {
      window.dispatchEvent(new MouseEvent(type, { button: 4, bubbles: true }))
    }
  })
  await sleep(600)
  expect((await win.evaluate(() => location.hash)).includes('/search'), 'mouse forward did not navigate')
})

await test('rail: every button goes to its page', async () => {
  const pages = [
    ['/', 'svg.lucide-house'],
    ['/search', 'svg.lucide-search'],
    ['/library', 'svg.lucide-library-big'],
    ['/now-playing', 'svg.lucide-radio'],
    ['/stats', 'svg.lucide-chart-column-big'],
  ]
  for (const [route, icon] of pages) {
    await win.locator(`nav a:has(${icon})`).click()
    await sleep(600)
    const hash = await win.evaluate(() => location.hash.slice(1))
    expect(route === '/' ? hash === '/' : hash.startsWith(route), `${icon} went to ${hash}`)
  }
  await win.locator('nav button:has(svg.lucide-settings)').click()
  await sleep(600)
  expect(await win.locator('[role=dialog]').count(), 'settings did not open')
  await win.keyboard.press('Escape')
  await sleep(400)
})

await test('library tabs switch pages', async () => {
  await go('/library/albums')
  for (const route of ['/library/artists', '/library/songs', '/library/playlists', '/library/albums']) {
    await win.locator(`header a[href="#${route}"]`).first().click()
    await sleep(600)
    expect((await win.evaluate(() => location.hash)).startsWith(`#${route}`), `tab ${route}`)
  }
})

await test('search finds songs', async () => {
  await go('/search')
  await win.locator('input').first().fill('Ember')
  await sleep(1200)
  expect(await win.getByText('Ember', { exact: true }).count(), 'no result')
})

await test('songs page: shuffle library plays random songs', async () => {
  await go('/library/songs')
  await win.locator('[data-testid=shuffle-library]').click()
  await until(async () => (await state()).playing && (await state()).titles.length > 10)
  const s = await state()
  expect(s.titles.length > 10, `queue has ${s.titles.length} songs`)
  expect(s.playing, 'not playing')
})

await test('album page: play, shuffle and add-to-queue buttons', async () => {
  await go('/library/albums')
  await win.getByText('Paper Lanterns', { exact: true }).first().click()
  await sleep(1200)
  const albumSongs = (await allSongs()).filter((x) => x.album === 'Paper Lanterns')
  const play = win.getByRole('button', { name: /^(Play all|Pause)$/ }).first()
  await play.click()
  await sleep(800)
  let s = await state()
  eq(s.titles.length, albumSongs.length, 'play album queue length')
  expect(s.playing, 'play album')
  await play.click()
  await sleep(400)
  expect(!(await state()).playing, 'pause from the album button')
  await play.locator('xpath=following::button[1]').click()
  await sleep(800)
  s = await state()
  expect(s.shuffle, 'shuffle album')
  // Add-to-queue button on a different album appends all its songs.
  await go('/library/albums')
  await win.getByText('Cold Harbour', { exact: true }).first().click()
  await sleep(1200)
  const cold = (await allSongs()).filter((x) => x.album === 'Cold Harbour')
  const before = await state()
  await win.getByRole('button', { name: /^(Play all|Pause)$/ }).first().locator('xpath=following::button[2]').click()
  await sleep(600)
  const after = await state()
  eq(after.ids.slice(-cold.length).sort(), cold.map((x) => x.id).sort(), 'album appended')
  eq(after.ids.length, before.ids.length + cold.length, 'queue length')
})

await test('settings: visualizer toggle shows it on Now Playing', async () => {
  await win.locator('nav button:has(svg.lucide-settings)').click()
  await sleep(600)
  await win.getByText(/^Appearance$/).first().click()
  await sleep(400)
  const sw = win.locator('[data-testid=setting-visualizer]')
  await sw.scrollIntoViewIfNeeded()
  if ((await sw.getAttribute('data-state')) !== 'checked') await sw.click()
  await sleep(300)
  await win.keyboard.press('Escape')
  await sleep(400)
  await go('/now-playing')
  expect(await win.locator('[data-testid=visualizer]').count(), 'visualizer not shown')
  await sleep(1000)
  const lit = await win.evaluate(() => {
    const c = document.querySelector('[data-testid=visualizer]')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
    return n
  })
  expect(lit > 500, `visualizer drew only ${lit} pixels`)
})

await test('settings: Language tab is called "Language"', async () => {
  await win.locator('nav button:has(svg.lucide-settings)').click()
  await sleep(600)
  expect(await win.getByText('Language', { exact: true }).count(), 'no Language tab')
  expect(!(await win.getByText(/Language & Region/).count()), 'old label still shown')
  await win.keyboard.press('Escape')
})

await test('output device: found again by name when its id changed', async () => {
  const r = await win.evaluate(async () => {
    const md = navigator.mediaDevices
    const original = md.enumerateDevices.bind(md)
    // Chromium hands out new device ids per launch; simulate that.
    md.enumerateDevices = async () => [
      { deviceId: 'default', label: 'Default', kind: 'audiooutput', groupId: '' },
      { deviceId: 'id-after-restart', label: 'USB DAC', kind: 'audiooutput', groupId: '' },
    ]
    const fx = window.__cp.audioFx
    fx.getState().set({ outputDevice: 'id-before-restart', outputDeviceLabel: 'USB DAC' })
    const picked = await window.__cp.resolveOutputDevice()
    const saved = JSON.parse(localStorage.getItem('clearplay_audio_fx')).state
    // Unplugged: falls back to the default but keeps the choice.
    md.enumerateDevices = async () => [{ deviceId: 'default', label: 'Default', kind: 'audiooutput', groupId: '' }]
    const unplugged = await window.__cp.resolveOutputDevice()
    const kept = fx.getState().outputDeviceLabel
    md.enumerateDevices = original
    fx.getState().set({ outputDevice: 'default', outputDeviceLabel: '' })
    return { picked, saved: [saved.outputDevice, saved.outputDeviceLabel], unplugged, kept }
  })
  eq(r.picked, 'id-after-restart', 'device picked by name')
  eq(r.saved, ['id-after-restart', 'USB DAC'], 'saved setting (localStorage)')
  eq(r.unplugged, '', 'unplugged → default')
  eq(r.kept, 'USB DAC', 'choice kept while unplugged')
})

const pill = () => win.evaluate(() => document.querySelector('[data-testid=queue-pill]')?.textContent ?? null)

await test('pill: Play next from a song menu says "Playing next"', async () => {
  await playAlbumTrack('Neon Tides', 'Opening')
  await go('/library/albums')
  await win.getByText('Paper Lanterns', { exact: true }).first().click()
  await sleep(1200)
  await win.locator('[role=row]:not(aside [role=row])').filter({ hasText: 'Signal' }).first().click({ button: 'right' })
  await sleep(400)
  await win.getByRole('menuitem', { name: /play next/i }).first().click()
  const text = await until(pill, 1500)
  eq(text, 'Playing next', 'pill text')
  await win.screenshot({ path: '/tmp/e2e-pill.png' })
  await sleep(2400)
  eq(await pill(), null, 'pill did not go away by itself')
})

await test('pill: Add to queue from the Search right-click menu', async () => {
  await go('/search')
  await win.locator('input').first().fill('Ember')
  await sleep(1400)
  await win.getByText('Ember', { exact: true }).first().click({ button: 'right' })
  await sleep(400)
  await win.getByRole('menuitem', { name: /add last/i }).first().click()
  eq(await until(pill, 1500), 'Added to queue', 'pill text')
  await sleep(2400)
})

await test('pill: album menu Play next counts the songs', async () => {
  await go('/library/albums')
  await win.getByText('Cold Harbour', { exact: true }).first().click()
  await sleep(1200)
  const n = (await allSongs()).filter((x) => x.album === 'Cold Harbour').length
  await win.locator('main button:has(svg.lucide-ellipsis)').first().click()
  await sleep(400)
  await win.getByRole('menuitem', { name: /play next/i }).first().click()
  eq(await until(pill, 1500), `${n} songs play next`, 'pill text')
  await sleep(2400)
  await win.getByRole('button', { name: /^(Play all|Pause)$/ }).first().locator('xpath=following::button[2]').click()
  eq(await until(pill, 1500), `${n} songs added to queue`, 'album add-to-queue button')
  await sleep(2400)
})

await test('no page errors during the run', async () => {
  eq(errors, [], 'page errors')
})

console.log(`\n${passed} passed, ${failed} failed`)
await electronApp.close()
process.exit(failed ? 1 : 0)
