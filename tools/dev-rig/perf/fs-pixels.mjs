// P2 pixel check: does the fullscreen sheet look different without its
// backdrop-filter? Compares screenshots with the blur forced on ("blur", what
// 0.6.0 does), forced off ("none") and as the build does it ("build"), at the
// same moment, in one build:
//   - static: open, paused
//   - the open animation at OPEN_MS (default 0,100,200,300,450 ms)
//   - a song change: the backdrop's cover cross-fade at FADE_MS
//     (default 0,300,600,900,1300 ms after the new cover arrives)
// The backdrop canvas runs on a frozen clock (performance.now and the
// requestAnimationFrame timestamp are pinned and moved by the script), and all
// CSS animations are paused and seeked (CDP Animation), so both variants see
// exactly the same frame. Noise: two screenshots of the same variant.
// Writes every frame to $RIG/perf-results/fs-pixels/ and prints the number of
// differing pixels per frame.
// Usage (from tools/dev-rig): SIZE=1280x720 perf/xrun.sh node perf/fs-pixels.mjs
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import {
  findAlbum,
  go,
  HEIGHT,
  launch,
  RIG,
  sleep,
  WIDTH,
  writeResult,
} from './lib.mjs'

const OPEN_MS = (process.env.OPEN_MS || '0,100,200,300,450')
  .split(',')
  .map(Number)
const FADE_MS = (process.env.FADE_MS || '0,300,600,900,1300')
  .split(',')
  .map(Number)
const outDir = path.join(
  RIG,
  'perf-results',
  'fs-pixels',
  `${WIDTH}x${HEIGHT}-${Date.now()}`,
)
fs.mkdirSync(outDir, { recursive: true })

const s = await launch()
const { win, cdp } = s

// Frozen clock for the backdrop canvas.
await win.evaluate(() => {
  const realNow = performance.now.bind(performance)
  const realRaf = window.requestAnimationFrame.bind(window)
  window.__clock = realNow()
  performance.now = () => window.__clock
  window.requestAnimationFrame = (cb) => realRaf(() => cb(window.__clock))
})
const setClock = (ms) => win.evaluate((t) => (window.__clock = t), ms)
const clock = () => win.evaluate(() => window.__clock)

const SELECTOR = '[role="dialog"]:has([data-testid="fullscreen-backdrop"])'
async function variant(v) {
  await win.evaluate(
    ([v, sel]) => {
      let st = document.getElementById('fs-variant')
      if (!st) {
        st = document.createElement('style')
        st.id = 'fs-variant'
        document.head.append(st)
      }
      st.textContent =
        v === 'asis'
          ? ''
          : v === 'none'
            ? `${sel} { backdrop-filter: none !important }`
            : `${sel} { backdrop-filter: blur(var(--glass-blur)) saturate(150%) !important }`
    },
    [v, SELECTOR],
  )
  await sleep(150)
}

function diff(a, b) {
  const A = PNG.sync.read(a)
  const B = PNG.sync.read(b)
  let n = 0
  let max = 0
  const box = [Infinity, Infinity, -1, -1]
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.max(
      Math.abs(A.data[i] - B.data[i]),
      Math.abs(A.data[i + 1] - B.data[i + 1]),
      Math.abs(A.data[i + 2] - B.data[i + 2]),
    )
    if (d > 0) {
      n++
      max = Math.max(max, d)
      const p = i / 4
      const x = p % A.width
      const y = Math.floor(p / A.width)
      box[0] = Math.min(box[0], x)
      box[1] = Math.min(box[1], y)
      box[2] = Math.max(box[2], x)
      box[3] = Math.max(box[3], y)
    }
  }
  return { pixels: n, maxDelta: max, box: n ? box : null }
}

/** Pixels where a1 == a2 but b differs. */
function diffStable(a1, a2, b) {
  const A = PNG.sync.read(a1)
  const A2 = PNG.sync.read(a2)
  const B = PNG.sync.read(b)
  let n = 0
  let max = 0
  const rows = new Map()
  for (let i = 0; i < A.data.length; i += 4) {
    const same =
      A.data[i] === A2.data[i] &&
      A.data[i + 1] === A2.data[i + 1] &&
      A.data[i + 2] === A2.data[i + 2]
    if (!same) continue
    const d = Math.max(
      Math.abs(A.data[i] - B.data[i]),
      Math.abs(A.data[i + 1] - B.data[i + 1]),
      Math.abs(A.data[i + 2] - B.data[i + 2]),
    )
    if (d > 0) {
      n++
      max = Math.max(max, d)
      const y = Math.floor(i / 4 / A.width)
      rows.set(y, (rows.get(y) ?? 0) + 1)
    }
  }
  return { pixels: n, maxDelta: max, rows: [...rows].slice(0, 6) }
}

const results = []
/**
 * blur, none, blur again. A pixel counts as "from the blur" only when both
 * blur shots agree and the none shot differs; differences between the two
 * blur shots (timers such as the scrollbar fading) are noise.
 */
async function compare(name) {
  await variant('blur')
  const a1 = await win.screenshot()
  await variant('none')
  const b = await win.screenshot()
  await variant('asis')
  const c = await win.screenshot()
  const settled = await win.evaluate(
    (sel) =>
      document.querySelector(sel)?.hasAttribute('data-cp-settled') ?? false,
    SELECTOR,
  )
  await variant('blur')
  const a2 = await win.screenshot()
  fs.writeFileSync(path.join(outDir, `${name}-blur.png`), a1)
  fs.writeFileSync(path.join(outDir, `${name}-none.png`), b)
  fs.writeFileSync(path.join(outDir, `${name}-build.png`), c)
  const r = {
    frame: name,
    blurVsNone: diffStable(a1, a2, b),
    blurVsBuild: diffStable(a1, a2, c),
    buildSettled: settled,
    noise: diff(a1, a2),
  }
  console.log(JSON.stringify(r))
  results.push(r)
}

// A paused song with a cover, then the next one.
const album = await findAlbum('Fault Test')
await go(win, `/library/albums/${album.id}`, 2500)
await win
  .getByRole('button', { name: /^(Play all|Pause)$/ })
  .first()
  .click()
await sleep(1500)
await win.evaluate(() =>
  window.__cp.player.getState().actions.setPlayingState(false),
)
await sleep(500)

// ---- open animation, paused at each time
await cdp.send('Animation.enable')
for (const t of OPEN_MS) {
  await win.evaluate(() =>
    window.__cp.player.getState().fullscreen.setIsFullscreen(false),
  )
  await sleep(1200)
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 })
  await win.evaluate(() =>
    window.__cp.player.getState().fullscreen.setIsFullscreen(true),
  )
  await sleep(600)
  // The backdrop's cover arrives on a frozen clock: let it be fully faded in.
  await setClock((await clock()) + 5000)
  await win.evaluate((ms) => {
    for (const a of document.getAnimations()) {
      a.pause()
      a.currentTime = ms
    }
  }, t)
  await sleep(300)
  await compare(`open-${t}ms`)
}
await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
await win.evaluate(() => {
  for (const a of document.getAnimations()) a.finish?.()
})
await sleep(1500)

// ---- static
await setClock((await clock()) + 5000)
await sleep(300)
await compare('static')

// ---- song change: the backdrop cross-fades to the next cover
await win.evaluate(() => {
  const st = window.__cp.player.getState()
  st.actions.playNextSong()
})
await sleep(400)
await win.evaluate(() =>
  window.__cp.player.getState().actions.setPlayingState(false),
)
await sleep(2000) // the new cover loads; its fade starts at the frozen clock
const fadeStart = await clock()
await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 })
for (const t of FADE_MS) {
  await setClock(fadeStart + t)
  await sleep(300)
  await compare(`song-change-${t}ms`)
}
await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })

const drawer = await win.evaluate((sel) => {
  document.getElementById('fs-variant')?.remove()
  const d = document.querySelector(sel)
  return d ? getComputedStyle(d).backdropFilter : null
}, SELECTOR)
const worst = Math.max(...results.map((r) => r.blurVsNone.pixels))
const worstBuild = Math.max(...results.map((r) => r.blurVsBuild.pixels))
const noise = Math.max(...results.map((r) => r.noise.pixels))
const out = {
  size: `${WIDTH}x${HEIGHT}`,
  buildBackdropFilter: drawer,
  worstBlurVsNonePixels: worst,
  worstBlurVsBuildPixels: worstBuild,
  worstNoisePixels: noise,
  frames: results,
  screenshots: outDir,
}
console.log(
  JSON.stringify({
    size: out.size,
    buildBackdropFilter: drawer,
    worstBlurVsNonePixels: worst,
    worstBlurVsBuildPixels: worstBuild,
    worstNoisePixels: noise,
    screenshots: outDir,
  }),
)
writeResult(`fs-pixels-${WIDTH}x${HEIGHT}`, out)
await s.close()
