// P2: fullscreen player cost. Plays the 3-hour song, opens the fullscreen
// player, then measures for SECS (default 15) s: frames per second in the
// page (requestAnimationFrame) and CPU of each process (GPU process included),
// as % of one core.
// VARIANT=asis (default) | noblur | blur forces the fullscreen sheet's
// backdrop-filter with an injected style, to compare in one build.
// Usage (from tools/dev-rig): SIZE=1920x1080 perf/xrun.sh node perf/fullscreen.mjs
//                             SIZE=1280x720  perf/xrun.sh node perf/fullscreen.mjs
import {
  cpuByType,
  findAlbum,
  go,
  HEIGHT,
  launch,
  sleep,
  WIDTH,
  writeResult,
} from './lib.mjs'

const SECS = Number(process.env.SECS || 15)
const VARIANT = process.env.VARIANT || 'asis'

const s = await launch()
const { app, win } = s

const album = await findAlbum('Three Hours')
await go(win, `/library/albums/${album.id}`, 2500)
await win
  .getByRole('button', { name: /^(Play all|Pause)$/ })
  .first()
  .click()
await sleep(2000)

if (VARIANT !== 'asis') {
  await win.evaluate((v) => {
    const st = document.createElement('style')
    st.textContent =
      v === 'noblur'
        ? '[role="dialog"]:has([data-testid="fullscreen-backdrop"]) { backdrop-filter: none !important }'
        : '[role="dialog"]:has([data-testid="fullscreen-backdrop"]) { backdrop-filter: blur(var(--glass-blur)) saturate(150%) !important }'
    document.head.append(st)
  }, VARIANT)
}
await win.evaluate(() =>
  window.__cp.player.getState().fullscreen.setIsFullscreen(true),
)
await sleep(3000)
const drawer = await win.evaluate(() => {
  const d = document
    .querySelector('[data-testid="fullscreen-backdrop"]')
    ?.closest('[role="dialog"]')
  return d
    ? {
        backdropFilter: getComputedStyle(d).backdropFilter,
        className: d.className.slice(0, 200),
      }
    : null
})
const playing = await win.evaluate(
  () => window.__cp.player.getState().playerState.isPlaying,
)

await win.evaluate(() => {
  window.__frames = 0
  const tick = () => {
    window.__frames++
    window.__raf = requestAnimationFrame(tick)
  }
  window.__raf = requestAnimationFrame(tick)
})
const t0 = Date.now()
const cpu = await cpuByType(app, SECS * 1000)
const frames = await win.evaluate(() => {
  cancelAnimationFrame(window.__raf)
  return window.__frames
})
const secs = (Date.now() - t0) / 1000
const gpuInfo = await app.evaluate(({ app: a }) => a.getGPUFeatureStatus())

const out = {
  size: `${WIDTH}x${HEIGHT}`,
  variant: VARIANT,
  fps: Math.round((frames / secs) * 10) / 10,
  gpuProcessCpu: cpu.procPercentOfCore.GPU ?? null,
  cpu,
  playing,
  drawer,
  gpuCompositing: gpuInfo.gpu_compositing,
}
console.log(JSON.stringify(out))
writeResult(`fullscreen-${WIDTH}x${HEIGHT}-${VARIANT}`, out)
await s.close()
