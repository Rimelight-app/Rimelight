// Usage: node e2e-local.mjs   (run through tools/dev-rig/e2e-local.sh)
// "Music on this computer": starts the built app with an empty profile, adds
// a copy of the rig's music folder, connects through the login page button
// and checks that browsing, playback, lyrics, likes, ratings, playlists,
// search, rescans and a restart work against the built-in local server.
import { _electron as electron } from 'playwright-core'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const app = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const rig = process.env.RIG || '/tmp/rimelight-rig'
const music = path.join(rig, 'local-music')
const userData = path.join(rig, 'userdata-local')
fs.rmSync(music, { recursive: true, force: true })
fs.rmSync(userData, { recursive: true, force: true })
// The hi-res "Test Signals" album is for the mpv engine tests; leave it out
// so the counts below stay those of the 4 generated albums.
fs.cpSync(path.join(rig, 'music'), music, {
  recursive: true,
  filter: (src) => !src.includes(`${path.sep}Test Signals`),
})

let electronApp
let win
const errors = []
async function launch() {
  electronApp = await electron.launch({
    executablePath: path.join(app, 'node_modules/electron/dist/electron'),
    args: [app, '--no-sandbox', '--disable-gpu-sandbox', `--user-data-dir=${userData}`],
    cwd: app,
    env: { ...process.env, RIMELIGHT_E2E: '1' },
    timeout: 60000,
  })
  win = await electronApp.firstWindow()
  win.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  await win.waitForLoadState('domcontentloaded')
  await electronApp.evaluate(({ webContents, BrowserWindow }) => {
    const bw = webContents.getAllWebContents().map((c) => BrowserWindow.fromWebContents(c)).find(Boolean)
    bw?.setSize(1440, 900)
  })
  await win.waitForTimeout(2500)
}
const sleep = (ms) => win.waitForTimeout(ms)
async function until(fn, ms = 6000) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    last = await fn()
    if (last) return last
    await sleep(200)
  }
  return last
}
const go = async (hash) => {
  await win.evaluate((h) => { window.location.hash = h }, hash)
  await sleep(1200)
}
const player = () =>
  win.evaluate(() => {
    const s = window.__cp.player.getState()
    return {
      ids: s.songlist.currentList.map((x) => x.id),
      title: s.songlist.currentSong?.title,
      id: s.songlist.currentSong?.id,
      playing: s.playerState.isPlaying,
    }
  })
const audio = () =>
  win.evaluate(() => {
    const a = document.querySelector('[data-testid=player-song-audio]')
    return a ? { paused: a.paused, time: a.currentTime } : null
  })
const libState = () => win.evaluate(() => window.api.localLibrary.state())

// The app's own credentials for the local server, to check what it saved.
async function api(endpoint, params = {}) {
  const c = await win.evaluate(() => window.api.localLibrary.connect())
  const salt = crypto.randomBytes(6).toString('hex')
  const t = crypto.createHash('md5').update(c.password + salt).digest('hex')
  const q = new URLSearchParams({ u: c.username, t, s: salt, v: '1.16.1', c: 'e2e', f: 'json', ...params })
  const res = await fetch(`${c.url}/rest/${endpoint}?${q}`)
  return (await res.json())['subsonic-response']
}

let failed = 0
let passed = 0
async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}: ${String(e?.message || e).split('\n')[0].slice(0, 220)}`)
    await win.screenshot({ path: `/tmp/e2e-local-fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {})
    await win.keyboard.press('Escape').catch(() => {})
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}
const eq = (a, b, what) => expect(JSON.stringify(a) === JSON.stringify(b), `${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)

// ======================= checks =======================
await launch()

await test('login page offers music on this computer', async () => {
  expect(await win.locator('input[name="url"]').count(), 'not on the login page')
  expect(await win.locator('[data-testid=login-local]').isVisible(), 'button missing')
})

await test('folder is scanned (tags, 4 artists, 4 albums, 29 songs)', async () => {
  await win.evaluate((p) => window.api.localLibrary.addPath(p), music)
  const s = await until(async () => { const x = await libState(); return !x.scanning && x.tracks ? x : null }, 30000)
  eq([s?.tracks, s?.albums], [29, 4], 'tracks/albums')
  const idx = (await api('getArtists')).artists.index.flatMap((i) => i.artist)
  eq(idx.length, 4, 'artists')
})

await test('login button connects without a server', async () => {
  await win.locator('[data-testid=login-local]').click()
  await until(async () => (await win.locator('input[name="url"]').count()) === 0, 8000)
  const d = await win.evaluate(() => window.__cp.app.getState().data)
  expect(/^http:\/\/127\.0\.0\.1:\d+$/.test(d.url), `url ${d.url}`)
  eq([d.username, d.isServerConfigured, d.serverType], ['clearplay', true, 'clearplay'], 'saved server')
})

await test('home shows albums with cover art', async () => {
  await go('/')
  await sleep(1500)
  const covers = await until(() =>
    win.evaluate(() =>
      [...document.querySelectorAll('img')].filter((i) => i.src.includes('getCoverArt') && i.complete && i.naturalWidth > 0).length,
    ),
  )
  expect(covers >= 4, `only ${covers} covers loaded`)
})

await test('albums and artists pages list everything (incl. Cyrillic)', async () => {
  await go('/library/albums')
  for (const a of ['Neon Tides', 'Paper Lanterns', 'Cold Harbour', 'Велосипед']) {
    expect(await win.getByText(a, { exact: true }).first().isVisible(), `album ${a} missing`)
  }
  await go('/library/artists')
  for (const a of ['Mira Vale', 'Oskar Lind', 'The Glass Rooms', 'Нощна смяна']) {
    expect(await win.getByText(a, { exact: true }).first().isVisible(), `artist ${a} missing`)
  }
})

await test('album page: play all plays the album in track order', async () => {
  await go('/library/albums')
  await win.getByText('Neon Tides', { exact: true }).first().click()
  await sleep(1500)
  await win.getByRole('button', { name: 'Play all' }).first().click()
  const p = await until(async () => { const x = await player(); return x.playing && x.ids.length === 7 ? x : null })
  expect(p, 'album did not start')
  eq(p.title, 'Opening', 'first track')
  const album = (await api('getAlbum', { id: (await api('getSong', { id: p.id })).song.albumId })).album
  eq(p.ids, album.song.map((s) => s.id), 'queue order')
  const a = await until(async () => { const x = await audio(); return x && !x.paused && x.time > 0.5 ? x : null })
  expect(a, 'audio is not advancing (stream)')
})

await test('seeking works (range requests)', async () => {
  await win.evaluate(() => { const a = document.querySelector('[data-testid=player-song-audio]'); a.currentTime = a.duration * 0.6 })
  await sleep(1200)
  const a = await audio()
  const d = await win.evaluate(() => document.querySelector('[data-testid=player-song-audio]').duration)
  expect(a.time > d * 0.55 && !a.paused, `time ${a.time.toFixed(1)} of ${d.toFixed(1)}`)
})

await test('lyrics from the .lrc file are shown (synced)', async () => {
  const id = (await player()).id
  const l = await api('getLyricsBySongId', { id })
  const sl = l.lyricsList.structuredLyrics?.[0]
  expect(sl?.synced && sl.line.length > 2, 'server returned no synced lyrics')
  await win.locator('[data-testid=track-fullscreen-button]').click()
  await sleep(1500)
  const text = await until(() => win.evaluate((t) => document.querySelector('[role=dialog]')?.innerText.includes(t), sl.line[1].value))
  expect(text, `lyric line "${sl.line[1].value}" not on screen`)
  await win.keyboard.press('Escape')
  await sleep(900)
})

await test('like and rating are saved', async () => {
  const id = (await player()).id
  await win.locator('[data-testid=player-like-button]').click()
  await sleep(800)
  expect((await api('getSong', { id })).song.starred, 'not starred')
  await win.locator('[data-testid=track-quality] + [data-testid=star-rating] [role=radio]').nth(3).click()
  await sleep(800)
  eq((await api('getSong', { id })).song.userRating, 4, 'rating')
  const starred = (await api('getStarred2')).starred2.song ?? []
  expect(starred.some((s) => s.id === id), 'missing from favourites')
})

await test('search finds songs, albums and artists', async () => {
  const r = (await api('search3', { query: 'ВЕЛОС' })).searchResult3
  eq(r.album?.map((a) => a.name), ['Велосипед'], 'album search (case-insensitive Cyrillic)')
  eq((await api('search3', { query: 'glass' })).searchResult3.artist?.map((a) => a.name), ['The Glass Rooms'], 'artist search')
  await go(`/library/albums?filter=search&query=${encodeURIComponent('paper')}`)
  await sleep(800)
  expect(await win.getByText('Paper Lanterns', { exact: true }).first().isVisible(), 'search page: album not shown')
  expect(!(await win.getByText('Neon Tides', { exact: true }).count()), 'search page: unrelated album shown')
  const all = (await api('search3', { query: '""', songCount: 500 })).searchResult3
  eq(all.song.length, 29, 'navidrome-style empty query')
})

await test('playlists can be created and filled', async () => {
  const songs = (await api('getAlbum', { id: (await api('getSong', { id: (await player()).id })).song.albumId })).album.song
  await api('createPlaylist', { name: 'E2E mix' })
  const pl = (await api('getPlaylists')).playlists.playlist.find((p) => p.name === 'E2E mix')
  expect(pl, 'playlist not created')
  await api('updatePlaylist', { playlistId: pl.id, songIdToAdd: songs[0].id })
  await api('updatePlaylist', { playlistId: pl.id, songIdToAdd: songs[2].id })
  await go('/library/playlists')
  expect(await win.getByText('E2E mix', { exact: true }).first().isVisible(), 'playlist not listed in the app')
  eq((await api('getPlaylist', { id: pl.id })).playlist.entry.map((e) => e.id), [songs[0].id, songs[2].id], 'entries')
})

await test('rescan picks up a new file and a removed folder', async () => {
  const src = path.join(music, 'Mira Vale/Neon Tides/07 - Ember.mp3')
  fs.mkdirSync(path.join(music, 'Extra'), { recursive: true })
  fs.copyFileSync(src, path.join(music, 'Extra/Ember copy.mp3'))
  await win.evaluate(() => window.api.localLibrary.rescan())
  const s = await until(async () => { const x = await libState(); return !x.scanning && x.tracks === 30 ? x : null }, 20000)
  eq(s?.tracks, 30, 'tracks after adding a file')
  fs.rmSync(path.join(music, 'Extra'), { recursive: true })
  await win.evaluate(() => window.api.localLibrary.rescan())
  const s2 = await until(async () => { const x = await libState(); return !x.scanning && x.tracks === 29 ? x : null }, 20000)
  eq(s2?.tracks, 29, 'tracks after removing it')
})

await test('settings: local library section shows folder and status', async () => {
  await win.evaluate(() => {
    const st = window.__cp.app.getState()
    st.settings.setCurrentPage('servers')
    st.settings.setOpenDialog(true)
  })
  await sleep(1200)
  expect(await win.locator('[data-testid=local-folders]').innerText().then((t) => t.includes('local-music')), 'folder not listed')
  const status = await win.locator('[data-testid=local-status]').innerText()
  expect(status.includes('29 songs') && status.includes('4 albums'), `status "${status}"`)
  await win.keyboard.press('Escape')
  await sleep(500)
})

await test('no page errors', async () => {
  eq(errors, [], 'page errors')
})

const before = await player()
await electronApp.close()

// ---- restart: everything should still be there ----
await launch()
await test('after restart: still connected, likes and ratings kept', async () => {
  expect((await win.locator('input[name="url"]').count()) === 0, 'back on the login page')
  const s = await until(async () => { const x = await libState(); return x.tracks === 29 ? x : null }, 15000)
  eq(s?.tracks, 29, 'index loaded')
  const song = (await api('getSong', { id: before.id })).song
  expect(song.starred, 'like lost')
  eq(song.userRating, 4, 'rating lost')
  expect((await api('getPlaylists')).playlists.playlist.some((p) => p.name === 'E2E mix'), 'playlist lost')
  await go('/library/albums')
  expect(await win.getByText('Велосипед', { exact: true }).first().isVisible(), 'albums not shown')
})
await test('no page errors after restart', async () => {
  eq(errors, [], 'page errors')
})

console.log(`\n${passed} passed, ${failed} failed`)
await electronApp.close()
process.exit(failed ? 1 : 0)
