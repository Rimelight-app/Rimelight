// Screenshots of the main views on a frozen clock, for comparing two builds
// pixel by pixel (perf/pixel-diff.mjs). fs-pixels.mjs covers the fullscreen
// player; this covers the rest: library views, an album and an artist page,
// a playlist, the side panel (queue, lyrics), Settings and Ctrl+K, with a
// paused song loaded so the player bar and the cover-tinted backdrop show.
// The backdrop canvas runs on a frozen clock and CSS animations are finished
// before each shot.
// Usage (from tools/dev-rig): SIZE=1280x720 perf/xrun.sh node perf/views-pixels.mjs <out dir>
import fs from 'node:fs'
import path from 'node:path'
import { api, findAlbum, findPlaylist, go, launch, sleep } from './lib.mjs'

const outDir = process.argv[2]
if (!outDir) throw new Error('usage: views-pixels.mjs <out dir>')
fs.mkdirSync(outDir, { recursive: true })

const s = await launch()
const { win, cdp } = s

await win.evaluate(() => {
  const realNow = performance.now.bind(performance)
  const realRaf = window.requestAnimationFrame.bind(window)
  window.__clock = realNow()
  performance.now = () => window.__clock
  window.requestAnimationFrame = (cb) => realRaf(() => cb(window.__clock))
})
const advance = (ms) => win.evaluate((t) => (window.__clock += t), ms)

async function shot(name) {
  await advance(5000) // backdrop cross-fades finish on the frozen clock
  await win.evaluate(() => {
    for (const a of document.getAnimations()) a.finish?.()
    document.activeElement?.blur?.()
  })
  await win.mouse.move(2, 400)
  await sleep(700)
  await win.screenshot({ path: path.join(outDir, `${name}.png`) })
  console.log(`saved ${name}`)
}

const album = await findAlbum('Fault Test')
const multi = await findAlbum('Three Discs')
const playlist = await findPlaylist('Playlist 300')
const artist = (await api('getArtists')).artists.index[0].artist[0]

// A paused song at 0:00 (cover in the player bar, tinted backdrop).
await go(win, `/library/albums/${album.id}`, 2500)
await win
  .getByRole('button', { name: /^(Play all|Pause)$/ })
  .first()
  .click()
await sleep(1500)
await win.evaluate(() => {
  const a = window.__cp.player.getState().actions
  a.setPlayingState(false)
})
await sleep(500)
await win.evaluate(() => {
  const a = window.__cp.player.getState().actions
  for (const el of document.querySelectorAll('audio')) el.currentTime = 0
  a.setProgress(0)
})
await sleep(800)
await cdp.send('Animation.enable')

for (const [name, hash] of [
  ['albums', '/library/albums'],
  ['album', `/library/albums/${album.id}`],
  ['album-multi-disc', `/library/albums/${multi.id}`],
  ['artists', '/library/artists'],
  ['artist', `/library/artists/${artist.id}`],
  ['songs', '/library/songs'],
  ['playlists', '/library/playlists'],
  ['playlist', `/library/playlists/${playlist.id}`],
  ['genres', '/library/genres'],
]) {
  await go(win, hash, 3000)
  await shot(name)
}

await go(win, `/library/albums/${album.id}`, 2500)
await win.evaluate(() =>
  window.__cp.player.getState().actions.toggleQueueAction(),
)
await sleep(1200)
await shot('side-panel-queue')
await win.evaluate(() => {
  const a = window.__cp.player.getState().actions
  a.setLyricsState(true)
  a.setQueueState(false)
})
await sleep(1200)
await shot('side-panel-lyrics')
await win.evaluate(() => window.__cp.player.getState().actions.closeDrawer())
await sleep(800)

for (const page of ['appearance', 'audio']) {
  await win.evaluate((p) => {
    const st = window.__cp.app.getState().settings
    st.setCurrentPage(p)
    st.setOpenDialog(true)
  }, page)
  await sleep(1500)
  await shot(`settings-${page}`)
}
await win.evaluate(() =>
  window.__cp.app.getState().settings.setOpenDialog(false),
)
await sleep(800)

await win.keyboard.press('Control+k')
await sleep(800)
await win.keyboard.type('fault')
await sleep(1500)
await shot('ctrl-k')
await win.keyboard.press('Escape')

await s.close()
