// Usage: node shoot.mjs <outdir> <step...>
// Launches the built ClearPlay (out/main) under the current DISPLAY, logs in to the
// local Navidrome if needed, and runs named steps that each save a screenshot.
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const app = process.env.CLEARPLAY_APP || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const rig = process.env.RIG || '/tmp/clearplay-rig'
const out = process.argv[2]
const steps = process.argv.slice(3)
fs.mkdirSync(out, { recursive: true })

const electronApp = await electron.launch({
  executablePath: path.join(app, 'node_modules/electron/dist/electron'),
  args: [app, '--no-sandbox', '--disable-gpu-sandbox', ...(process.env.SCALE ? [`--force-device-scale-factor=${process.env.SCALE}`] : [])],
  cwd: app,
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', CLEARPLAY_USER_DATA: path.join(rig, 'userdata') },
  timeout: 60000,
})
const win = await electronApp.firstWindow()
win.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)) })
win.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
for (let i = 0; i < 40; i++) {
  const ok = await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (!w) return false
    w.setSize(1440, 900); w.center(); w.show()
    return true
  })
  if (ok) break
  await new Promise((r) => setTimeout(r, 250))
}
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2500)

const shot = async (name) => {
  await win.waitForTimeout(1200)
  await win.screenshot({ path: path.join(out, `${name}.png`) })
  console.log('saved', name)
}

if (await win.locator('input[name="url"]').count()) {
  await win.fill('input[name="url"]', 'http://127.0.0.1:4533')
  await win.fill('input[name="username"]', 'admin')
  await win.fill('input[name="password"]', 'test1234')
  await win.keyboard.press('Enter')
  await win.waitForTimeout(4000)
}

const go = async (hash) => {
  await win.evaluate((h) => { window.location.hash = h }, hash)
  await win.waitForTimeout(1500)
}

for (const step of steps) {
  try {
    const i = step.indexOf('='); const kind = i < 0 ? step : step.slice(0, i); const arg = i < 0 ? '' : step.slice(i + 1)
    if (kind === 'shot') await shot(arg)
    else if (kind === 'go') await go(arg)
    else if (kind === 'click') await win.locator(arg).first().click()
    else if (kind === 'hover') await win.locator(arg).first().hover()
    else if (kind === 'rclick') await win.locator(arg).first().click({ button: 'right' })
    else if (kind === 'rclicktext') await win.getByText(arg, { exact: true }).first().click({ button: 'right' })
    else if (kind === 'jitterclick') { const [x, y] = arg.split(',').map(Number); await win.mouse.move(x, y); await win.mouse.down(); await win.mouse.move(x + 2, y + 3, { steps: 3 }); await win.mouse.up() }
    else if (kind === 'clickat') { const [x, y] = arg.split(',').map(Number); await win.mouse.click(x, y) }
    else if (kind === 'mouse') { const [x, y] = arg.split(',').map(Number); await win.mouse.move(x, y) }
    else if (kind === 'snap') { await win.screenshot({ path: path.join(out, `${arg}.png`) }); console.log('saved', arg) }
    else if (kind === 'clicktext') await win.getByText(arg, { exact: true }).first().click()
    else if (kind === 'dblclicktext') await win.getByText(arg, { exact: true }).first().dblclick()
    else if (kind === 'key') await win.keyboard.press(arg)
    else if (kind === 'wait') await win.waitForTimeout(Number(arg))
    else if (kind === 'eval') console.log('eval:', JSON.stringify(await win.evaluate(arg)))
    else if (kind === 'mainjs') console.log('main:', JSON.stringify(await electronApp.evaluate(new Function('e', arg))))
  } catch (e) {
    console.log('step failed', step, String(e).split('\n')[0])
  }
}
await electronApp.close()
