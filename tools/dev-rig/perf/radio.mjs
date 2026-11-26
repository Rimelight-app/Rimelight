// Section 8 E2E against Navidrome 0.64.2 (through the fault proxy):
//  - Start radio from a song's context menu: the queue starts with that song,
//    "Keep playing similar music" is on, it plays
//  - from the album page's and the artist page's "…" menu
//  - Ctrl+K "Start radio from <playing song>"
//  - an empty answer keeps the old queue and shows "No similar music found"
// Usage (from tools/dev-rig): ENGINE=html perf/xrun.sh node perf/radio.mjs
//                             ENGINE=mpv  perf/xrun.sh node perf/radio.mjs
import {
  api,
  findAlbum,
  go,
  launch,
  login,
  sleep,
  startProxy,
  writeResult,
} from './lib.mjs'

const proxy = await startProxy(Number(process.env.FAULT_PORT || 4537))
const s = await launch({ fresh: true, login: false })
const { win } = s
await login(win, proxy.url)
let failed = 0
const results = []
const check = (name, ok, detail) => {
  if (!ok) failed++
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`)
}
const player = () =>
  win.evaluate(() => {
    const p = window.__cp.player.getState()
    return {
      first: p.songlist.currentList[0]?.id,
      length: p.songlist.currentList.length,
      index: p.songlist.currentSongIndex,
      playing: p.playerState.isPlaying,
      refill: window.__cp.settings.getState().autoDj,
      time: p.playerProgress.progress,
    }
  })
const pills = () =>
  win.evaluate(() =>
    [...document.querySelectorAll('[data-testid="message-pill"]')].map(
      (e) => e.innerText,
    ),
  )

const album = await findAlbum('Fault Test')
const songs = (await api('getAlbum', { id: album.id })).album.song
await win.evaluate(() => window.__cp.settings.getState().set({ autoDj: false }))

// ---- song context menu
await go(win, `/library/albums/${album.id}`, 2500)
await win
  .locator('[data-testid="data-table"] [role="row"]')
  .nth(2)
  .click({ button: 'right' })
await sleep(600)
await win.locator('[role="menu"] [data-testid="start-radio"]').click()
await sleep(4000)
let p = await player()
check(
  'song: queue starts with the song, refill on, playing',
  p.first === songs[1].id &&
    p.length > 10 &&
    p.refill &&
    p.playing &&
    p.time > 0,
  p,
)

// ---- album "…" menu
const other = await findAlbum('Three Discs')
await go(win, `/library/albums/${other.id}`, 2500)
const before = (await player()).first
await win
  .locator(
    '#main-scroll-area button:has(svg.lucide-ellipsis), #main-scroll-area button:has(svg.lucide-more-horizontal)',
  )
  .first()
  .click()
await sleep(600)
await win.locator('[role="menu"] [data-testid="start-radio"]').click()
await sleep(3500)
p = await player()
check(
  'album: new radio queue, playing',
  p.first !== before && p.length > 10 && p.playing,
  p,
)

// ---- artist "…" menu
await go(win, `/library/artists/${album.artistId}`, 2500)
const before2 = (await player()).first
await win
  .locator(
    '#main-scroll-area button:has(svg.lucide-ellipsis), #main-scroll-area button:has(svg.lucide-more-horizontal)',
  )
  .first()
  .click()
await sleep(600)
await win.locator('[role="menu"] [data-testid="start-radio"]').click()
await sleep(3500)
p = await player()
check(
  'artist: new radio queue, playing',
  p.first !== before2 && p.length > 10 && p.playing,
  p,
)

// ---- Ctrl+K
await win.keyboard.press('Control+k')
await sleep(600)
await win.keyboard.type('Start radio')
await sleep(600)
const offered = await win.evaluate(
  () =>
    document.querySelector('[cmdk-item][aria-selected="true"]')?.innerText ??
    '',
)
const playingId = await win.evaluate(() => {
  const s = window.__cp.player.getState().songlist
  return s.currentList[s.currentSongIndex].id
})
await win.evaluate(() => {
  window.__radioQueues = []
  window.__cp.player.subscribe((st, prev) => {
    if (st.songlist.currentList !== prev.songlist.currentList)
      window.__radioQueues.push(st.songlist.currentList[0]?.id)
  })
})
await win.keyboard.press('Enter')
await sleep(2500)
const started = await win.evaluate(() => window.__radioQueues)
p = await player()
check(
  'Ctrl+K: radio from the playing song',
  /Start radio from/.test(offered) &&
    started.includes(playingId) &&
    p.first === playingId &&
    p.playing,
  { offered, started, p },
)

// ---- nothing found
const queueBefore = await player()
await proxy.setRules(['getSimilarSongs:error70', 'getSimilarSongs2:error70'])
await go(win, `/library/albums/${album.id}`, 2500)
await win
  .locator('[data-testid="data-table"] [role="row"]')
  .nth(3)
  .click({ button: 'right' })
await sleep(600)
await win.locator('[role="menu"] [data-testid="start-radio"]').click()
await sleep(1500)
const pillText = await pills()
p = await player()
check(
  'nothing found: queue kept, pill',
  p.first === queueBefore.first &&
    p.length === queueBefore.length &&
    pillText.some((x) => /No similar music found for Fault Song 3/.test(x)),
  { p, pillText },
)

writeResult('radio', { results, failed })
await s.close()
proxy.stop()
process.exit(failed ? 1 : 0)
