// Usage: xvfb-run -a node e2e-engine.mjs   (pnpm electron:build first)
// Engine choice: the built-in engine is the default, choosing mpv asks for a
// restart, and a missing mpv falls back to the built-in engine with a clear
// message instead of going silent.
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const app = path.resolve(here, '../..')
const rig = process.env.RIG || '/tmp/clearplay-rig'
let failed = 0
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!cond) failed++
}

async function launch(userData, env = {}) {
  const ea = await electron.launch({
    executablePath: path.join(app, 'node_modules/electron/dist/electron'),
    args: [app, '--no-sandbox', '--disable-gpu-sandbox', `--user-data-dir=${userData}`],
    cwd: app,
    env: { ...process.env, CLEARPLAY_E2E: '1', ...env },
    timeout: 60000,
  })
  const win = await ea.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await ea.evaluate(({ webContents, BrowserWindow }) => {
    const bw = webContents.getAllWebContents().map((c) => BrowserWindow.fromWebContents(c)).find(Boolean)
    bw.setSize(1440, 900)
  })
  await win.waitForTimeout(2500)
  if (await win.locator('input[name="url"]').count()) {
    await win.fill('input[name="url"]', 'http://127.0.0.1:4533')
    await win.fill('input[name="username"]', 'admin')
    await win.fill('input[name="password"]', 'test1234')
    await win.keyboard.press('Enter')
    await win.waitForTimeout(4000)
  }
  return { ea, win }
}
async function openAudio(win) {
  await win.locator('nav button:has(svg.lucide-settings)').click()
  await win.waitForTimeout(600)
  await win.getByText(/^Player & Audio$/).first().click()
  await win.waitForTimeout(600)
}

// 1. Fresh profile: built-in by default; choosing mpv asks for a restart.
{
  const dir = path.join(rig, 'userdata-engine')
  fs.rmSync(dir, { recursive: true, force: true })
  const { ea, win } = await launch(dir)
  const status = await win.evaluate(() => window.__cp.mpv.getState().status)
  check(status.sessionEngine === 'builtin' && status.savedEngine === 'builtin', 'built-in engine is the default')
  await openAudio(win)
  const text = await win.evaluate(() => document.querySelector('[role=dialog]').innerText)
  check(/Audio engine[\s\S]*Built-in/.test(text), 'engine select shows Built-in')
  check(/Output details are shown with the mpv engine/.test(text), 'note instead of output info')
  check(!/Off with the mpv engine/.test(text), 'EQ etc. not marked off in built-in mode')
  await win.screenshot({ path: '/tmp/engine-builtin.png' })
  const combo = win.getByText('Audio engine', { exact: true }).nth(1).locator('xpath=ancestor::div[.//*[@role="combobox"]][1]').locator('[role=combobox]').first()
  await combo.click()
  await win.waitForTimeout(300)
  await win.getByRole('option', { name: 'mpv (bit-perfect)' }).click()
  await win.waitForTimeout(800)
  check(await win.locator('[data-testid=engine-restart]').count() === 1, 'restart prompt after choosing mpv')
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'store', 'audio-engine.json'), 'utf8'))
  check(saved.engine === 'mpv', 'choice saved for the next launch')
  const still = await win.evaluate(() => window.__cp.mpv.getState().status.sessionEngine)
  check(still === 'builtin', 'this session keeps playing on the built-in engine')
  await win.screenshot({ path: '/tmp/engine-restart.png' })
  await ea.close()
}

// 2. mpv chosen but missing: built-in engine, clear message.
{
  const dir = path.join(rig, 'userdata-engine')
  const { ea, win } = await launch(dir, { CLEARPLAY_MPV: '/nonexistent/mpv' })
  const status = await win.evaluate(() => window.__cp.mpv.getState().status)
  check(status.savedEngine === 'mpv' && status.sessionEngine === 'builtin' && !status.available, 'missing mpv: falls back to built-in')
  await openAudio(win)
  const msg = await win.evaluate(() => document.querySelector('[data-testid=mpv-missing]')?.textContent ?? '')
  check(/mpv is not installed\. Install it \(Fedora: sudo dnf install mpv\)/.test(msg), `message: ${msg}`)
  check(await win.locator('[data-testid=engine-restart]').count() === 0, 'no restart prompt while mpv is missing')
  await win.screenshot({ path: '/tmp/engine-missing.png' })
  await ea.close()
}

console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
