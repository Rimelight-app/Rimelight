// Usage: node soak.mjs <minutes> [album] [track]
// Plays an album with repeat on, opens the fullscreen player and samples
// performance once a minute: frames per second, JS heap, DOM nodes, running
// animations and event listeners. Used to find slowdowns over long sessions.
import { _electron as electron } from 'playwright-core'
import path from 'node:path'

const app = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const rig = process.env.RIG || '/tmp/rimelight-rig'
const minutes = Number(process.argv[2] || 5)
const album = process.argv[3] || 'Neon Tides'
const track = process.argv[4] || 'Signal'

const electronApp = await electron.launch({
  executablePath: path.join(app, 'node_modules/electron/dist/electron'),
  args: [app, '--no-sandbox', '--disable-gpu-sandbox', `--user-data-dir=${path.join(rig, 'userdata')}`, '--enable-precise-memory-info'],
  cwd: app,
  env: { ...process.env },
  timeout: 60000,
})
const win = await electronApp.firstWindow()
win.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(3000)

const cdp = await win.context().newCDPSession(win)
await cdp.send('Performance.enable')

await win.evaluate(() => { window.location.hash = '/library/albums' })
await win.waitForTimeout(1500)
await win.getByText(album, { exact: true }).first().click()
await win.waitForTimeout(1500)
await win.getByText(track, { exact: true }).first().dblclick()
await win.waitForTimeout(1500)
// Repeat all, so the queue never ends.
const loop = win.locator('[data-testid=player-button-loop]')
if ((await loop.getAttribute('data-state')) !== 'active') await loop.click()
await win.locator('[data-testid=track-fullscreen-button]').click()
await win.waitForTimeout(2000)

async function sample(label) {
  const page = await win.evaluate(async () => {
    const frames = await new Promise((resolve) => {
      let n = 0
      const end = performance.now() + 1000
      const tick = () => {
        n++
        if (performance.now() < end) requestAnimationFrame(tick)
        else resolve(n)
      }
      requestAnimationFrame(tick)
    })
    return {
      fps: frames,
      heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
      nodes: document.getElementsByTagName('*').length,
      animations: document.getAnimations().length,
      title: document.querySelector('[data-testid=track-title]')?.textContent,
    }
  })
  // CPU per process over the last interval: the GPU process does the
  // compositing (software GL here), so it shows how heavy drawing is.
  const procs = await electronApp.evaluate(({ app }) =>
    app.getAppMetrics().map((p) => [p.type, Math.round(p.cpu.percentCPUUsage)]),
  )
  const { metrics } = await cdp.send('Performance.getMetrics')
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]))
  console.log(
    JSON.stringify({
      t: label,
      ...page,
      listeners: m.JSEventListeners,
      docs: m.Documents,
      frames: m.Frames,
      layouts: m.LayoutCount,
      recalcs: m.RecalcStyleCount,
      cpu: Object.fromEntries(procs.filter(([t]) => t === 'GPU' || t === 'Tab')),
    }),
  )
}

const every = Number(process.env.EVERY || 60)
await sample('0s')
for (let i = 1; i <= (minutes * 60) / every; i++) {
  await win.waitForTimeout(every * 1000)
  await sample(`${i * every}s`)
}
await electronApp.close()
