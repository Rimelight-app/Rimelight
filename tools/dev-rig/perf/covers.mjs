// B5: the default cover. Plays songs whose coverArt is empty and checks the
// OS media controls got artwork (they take http(s)/data:/blob: only) with no
// console warning, and that images showing the default cover load.
// Usage (from tools/dev-rig): perf/xrun.sh node perf/covers.mjs
import {
  api,
  findAlbum,
  go,
  launch,
  login,
  sleep,
  writeResult,
} from './lib.mjs'

const s = await launch({ fresh: true, login: false })
const { win } = s
const warnings = []
win.on('console', (m) => {
  if (/MediaImage|default_album_art|default_artist_art/i.test(m.text()))
    warnings.push(m.text().slice(0, 200))
})
await login(win)
// A song whose coverArt is empty (as some servers and the local library send
// for songs without art).
const fault = await findAlbum('Fault Test')
await go(win, `/library/albums/${fault.id}`, 2500)
const songs = (await api('getAlbum', { id: fault.id })).album.song.map(
  ({ coverArt, ...rest }) => rest,
)
await win.evaluate((list) => {
  const a = window.__cp.player.getState().actions
  a.setSongList(list, 0)
  a.setPlayingState(true)
}, songs)
await sleep(4000)
const media = await win.evaluate(() => {
  const m = navigator.mediaSession.metadata
  return m
    ? {
        title: m.title,
        artwork: m.artwork.map((a) => `${a.src.slice(0, 30)}… ${a.sizes}`),
      }
    : null
})
const broken = async () =>
  win.evaluate(() =>
    [...document.images]
      .filter((i) => i.complete && i.naturalWidth === 0 && i.src)
      .map((i) => i.src.slice(0, 80)),
  )
const playerBar = await broken()
// Images that point at the default cover load (they used to be file:///default_…).
const defaults = await win.evaluate(() =>
  [...document.images]
    .filter((i) => /default_(album|artist)_art/.test(i.src))
    .map((i) => ({ src: i.src.slice(-60), ok: i.naturalWidth > 0 })),
)
const out = {
  media,
  consoleWarnings: warnings,
  brokenImagesOnPlayerPage: playerBar,
  defaultCoverImages: defaults,
}
console.log(JSON.stringify(out, null, 2))
writeResult('covers', out)
await s.close()
