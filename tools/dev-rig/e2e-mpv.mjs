// Usage: node e2e-mpv.mjs [filter]   (run through tools/dev-rig/e2e-mpv.sh)
// Checks the mpv (bit-perfect) engine against the rig's Navidrome, with a
// pretend sound card: tools/dev-rig/fake-audio holds /proc/asound files of a
// SIMGOT EW200 DSP (44.1/48/96 kHz, 16/24-bit, USB full speed) and a laptop
// HDA card, plus a fake `amixer` with a "Speaker" control. The fake devices
// play on mpv's null output (real time) via CLEARPLAY_MPV_DEVICE_MAP.
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const app = path.resolve(here, '../..')
const rig = process.env.RIG || '/tmp/clearplay-rig'
const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null
const ND = 'http://127.0.0.1:4533'
const fake = path.join(here, 'fake-audio')
const state = fs.mkdtempSync('/tmp/cp-fake-audio-')
const userData = path.join(rig, 'userdata-mpv')
const EW200 = 'alsa:hw:CARD=SIMGOT,DEV=0'

fs.mkdirSync(path.join(userData, 'store'), { recursive: true })
fs.writeFileSync(path.join(userData, 'store', 'audio-engine.json'), JSON.stringify({ engine: process.env.ENGINE || 'mpv' }))

const electronApp = await electron.launch({
  executablePath: path.join(app, 'node_modules/electron/dist/electron'),
  args: [app, '--no-sandbox', '--disable-gpu-sandbox', `--user-data-dir=${userData}`],
  cwd: app,
  env: {
    ...process.env,
    CLEARPLAY_E2E: '1',
    CLEARPLAY_ASOUND_ROOT: path.join(fake, 'asound'),
    FAKE_AUDIO_STATE: state,
    PATH: `${path.join(fake, 'bin')}:${process.env.PATH}`,
    CLEARPLAY_MPV_DEVICE_MAP: [
      'alsa/hw:CARD=SIMGOT,DEV=0=null',
      'auto=null',
      ...(process.env.EXTRA_MAP ? [process.env.EXTRA_MAP] : []),
    ].join(';'),
  },
  timeout: 60000,
})
const win = await electronApp.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
win.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200))
})
await win.waitForLoadState('domcontentloaded')
await electronApp.evaluate(({ webContents, BrowserWindow }) => {
  const bw = webContents.getAllWebContents().map((c) => BrowserWindow.fromWebContents(c)).find(Boolean)
  bw.setMinimumSize(400, 300)
  bw.setSize(1600, 960)
})
await win.waitForTimeout(2500)
if (await win.locator('input[name="url"]').count()) {
  await win.fill('input[name="url"]', ND)
  await win.fill('input[name="username"]', 'admin')
  await win.fill('input[name="password"]', 'test1234')
  await win.keyboard.press('Enter')
  await win.waitForTimeout(4000)
}

const sleep = (ms) => win.waitForTimeout(ms)
const go = async (hash) => {
  await win.evaluate((h) => { window.location.hash = h }, hash)
  await sleep(1200)
}
async function until(fn, ms = 6000) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    last = await fn()
    if (last) return last
    await sleep(150)
  }
  return last
}
const snap = () =>
  win.evaluate(() => {
    const p = window.__cp.player.getState()
    return {
      title: p.songlist.currentSong?.title,
      playing: p.playerState.isPlaying,
      volume: p.playerState.volume,
      progress: p.playerProgress.progress,
      index: p.songlist.currentSongIndex,
      el: window.__cp.mpvElement(),
      out: window.__cp.mpv.getState().output,
      status: window.__cp.mpv.getState().status,
      prefs: window.__cp.bitPerfect.getState().devices,
      device: window.__cp.bitPerfect.getState().device,
    }
  })
const mixer = () => {
  const f = path.join(state, 'fake-amixer-card2')
  return fs.existsSync(f) ? Number(fs.readFileSync(f, 'utf8')) : 100
}

let failed = 0
let passed = 0
async function test(name, fn) {
  if (filter && !filter.test(name)) return
  try {
    await fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}: ${String(e?.message || e).split('\n')[0].slice(0, 300)}`)
    await win.screenshot({ path: `/tmp/e2e-mpv-fail-${name.replace(/\W+/g, '_')}.png` }).catch(() => {})
    await win.keyboard.press('Escape').catch(() => {})
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}
const eq = (a, b, what) =>
  expect(JSON.stringify(a) === JSON.stringify(b), `${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)

async function playTrack(album, track) {
  await go('/library/albums')
  await win.getByText(album, { exact: true }).first().click()
  await sleep(1200)
  await win.getByText(track, { exact: true }).first().dblclick()
  await until(async () => {
    const s = await snap()
    return s.title === track && s.playing && s.out && s.el?.time > 0.2
  }, 10000)
}
const outFor = (track) =>
  until(async () => {
    const s = await snap()
    return s.title === track && s.out?.output ? s : null
  }, 10000)
const lineText = () =>
  win.evaluate(() => document.querySelector('[data-testid=output-line]')?.dataset.output || null)


// ======================= checks =======================

await test('session runs on mpv', async () => {
  const s = await snap()
  eq(s.status?.sessionEngine, 'mpv', 'session engine')
  expect(s.status?.available, 'mpv not available')
})

await test('device list has the fake EW200, laptop speakers and HDMI', async () => {
  const list = await win.evaluate(() => window.api.mpv.devices())
  const keys = list.map((d) => `${d.key}|${d.name}|${d.kind}|${d.detail}`)
  expect(keys.includes(`${EW200}|SIMGOT EW200 DSP|exclusive|USB · full speed`), keys.join(', '))
  expect(keys.some((k) => k.startsWith('alsa:hw:CARD=PCH,DEV=0|HDA Intel PCH · ALC257 Analog|exclusive')), keys.join(', '))
  expect(keys.some((k) => k.startsWith('alsa:hw:CARD=PCH,DEV=3|HDA Intel PCH · HDMI 0|exclusive|HDMI')), keys.join(', '))
  expect(keys[0].startsWith('system|'), 'system default first')
})

await test('caps of the EW200 come from the kernel file', async () => {
  const caps = await win.evaluate((k) => window.api.mpv.caps(k, true), EW200)
  eq(caps.rates, [44100, 48000, 96000], 'rates')
  eq(caps.depths, [16, 24], 'depths')
  eq(caps.hwVolume, true, 'hardware volume')
  eq(caps.volumeControl, 'Speaker', 'control')
  eq(caps.source, 'kernel', 'source')
})


async function openAudioSettings() {
  if (!(await win.locator('[data-testid=output-info]').count())) {
    await win.locator('nav button:has(svg.lucide-settings)').click()
    await sleep(600)
    await win.getByText(/^Player & Audio$/).first().click()
    await sleep(600)
  }
}
async function closeSettings() {
  await win.keyboard.press('Escape')
  await sleep(400)
}
/** Picks an option in the settings select on the row with this label. */
async function pickSelect(rowLabel, optionText) {
  const combo = win
    .getByText(rowLabel, { exact: true })
    .first()
    .locator('xpath=ancestor::div[.//*[@role="combobox"]][1]')
    .locator('[role=combobox]')
    .first()
  await combo.scrollIntoViewIfNeeded()
  await combo.click()
  await sleep(300)
  await win.getByRole('option', { name: optionText }).first().click()
  await sleep(500)
}
const infoNow = () => win.evaluate(() => document.querySelector('[data-testid=output-info-now]')?.textContent ?? null)
const infoText = () => win.evaluate(() => document.querySelector('[data-testid=output-info]')?.innerText ?? '')

await test('settings: engine shows mpv, effects are off with reasons', async () => {
  await openAudioSettings()
  const text = await win.evaluate(() => document.querySelector('[role=dialog]').innerText)
  expect(/mpv \(bit-perfect\)/.test(text), 'engine select does not show mpv')
  expect(await win.locator('[data-testid=fx-off-note]').count(), 'no note about EQ being off')
  expect(/Off with the mpv engine: changing the level/.test(text), 'no ReplayGain note')
  await win.screenshot({ path: '/tmp/mpv-settings-1.png' })
})

await test('settings: choose the EW200 by name; info shows what it supports', async () => {
  await openAudioSettings()
  await pickSelect('Output device', /SIMGOT EW200 DSP · USB · full speed/)
  await until(async () => /44\.1, 48, 96 kHz · 16, 24-bit/.test(await infoText()))
  const text = await infoText()
  expect(/SIMGOT EW200 DSP \(USB · full speed\)/.test(text), `device row: ${text}`)
  expect(/44\.1, 48, 96 kHz · 16, 24-bit · reported by the device/.test(text), `supports row: ${text}`)
  expect(/Hardware volume\s+Yes \(Speaker\)/.test(text), `hw row: ${text}`)
  expect(/Exclusive: ClearPlay has the device to itself/.test(text), `access row: ${text}`)
  eq((await snap()).device, EW200, 'saved device')
  await win.screenshot({ path: '/tmp/mpv-settings-2.png' })
  await closeSettings()
})

await test('96/24 plays bit-perfect; quiet start sets about -40 dB', async () => {
  await playTrack('Rates and Depths', '96 kHz 24-bit')
  const s = await outFor('96 kHz 24-bit')
  eq(s.out.exclusive, true, 'exclusive')
  eq([s.out.source.rate, s.out.output.rate], [96000, 96000], 'rates')
  eq(mixer(), 60, 'hardware level (raw 60 = -40 dB on the fake card)')
  eq(s.out.hwDb, -40, 'reported dB')
  eq(s.volume, 60, 'slider follows the hardware level')
  eq(s.prefs[EW200].started, true, 'quiet start remembered')
  await openAudioSettings()
  eq(await infoNow(), 'Bit-perfect · 96 kHz · 24-bit', 'output info')
})

await test('placement drop-down puts the output line in the player bar', async () => {
  await openAudioSettings()
  expect(!(await lineText()), 'line shown before choosing the player bar')
  await pickSelect('Show output info', 'In Settings and the player bar')
  await closeSettings()
  await until(async () => (await lineText()) === 'Bit-perfect')
  eq(await lineText(), 'Bit-perfect', 'player bar line')
  const q = await win.evaluate(() => document.querySelector('[data-testid=track-quality]').innerText)
  expect(/24-bit · 96 kHz/.test(q.replace(/\s+/g, ' ')), `quality line: ${q}`)
  await win.locator('footer').screenshot({ path: '/tmp/mpv-player-bar.png' })
})

await test('88.2 kHz converts to 44.1, 192 kHz to 96, both say so', async () => {
  await playTrack('Rates and Depths', '88.2 kHz 24-bit')
  let s = await outFor('88.2 kHz 24-bit')
  eq([s.out.source.rate, s.out.output.rate, s.out.requestedRate], [88200, 44100, 44100], '88.2 rates')
  await until(async () => (await lineText()) === 'Converted to 44.1 kHz')
  eq(await lineText(), 'Converted to 44.1 kHz', 'player bar')
  await playTrack('Rates and Depths', '192 kHz 24-bit')
  s = await outFor('192 kHz 24-bit')
  eq([s.out.source.rate, s.out.output.rate], [192000, 96000], '192 rates')
  await until(async () => (await lineText()) === 'Converted to 96 kHz')
  eq(await lineText(), 'Converted to 96 kHz', 'player bar')
})

await test('44.1/16 and 48/24 are bit-perfect', async () => {
  await playTrack('Rates and Depths', '44.1 kHz 16-bit')
  let s = await outFor('44.1 kHz 16-bit')
  eq([s.out.source.rate, s.out.output.rate, s.out.requestedRate], [44100, 44100, 0], '44.1')
  await openAudioSettings()
  await until(async () => (await infoNow()) === 'Bit-perfect · 44.1 kHz · 16-bit')
  eq(await infoNow(), 'Bit-perfect · 44.1 kHz · 16-bit', 'info 44.1')
  await closeSettings()
  await playTrack('Rates and Depths', '48 kHz 24-bit')
  s = await outFor('48 kHz 24-bit')
  eq([s.out.source.rate, s.out.output.rate], [48000, 48000], '48')
})

await test('volume slider moves the hardware volume', async () => {
  const slider = win.locator('[data-testid=player-volume-slider]').first()
  await slider.scrollIntoViewIfNeeded()
  const box = await slider.boundingBox()
  expect(box, 'no volume slider (window too narrow?)')
  await win.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2)
  await sleep(600)
  const s = await snap()
  expect(Math.abs(s.volume - 30) <= 3, `slider at ${s.volume}`)
  expect(Math.abs(mixer() - s.volume) <= 1, `mixer ${mixer()} vs slider ${s.volume}`)
  eq(s.out.softVolume, 100, 'mpv volume untouched')
  eq(s.prefs[EW200].level, s.volume, 'level saved for the device')
})

await test('pause stops time; play resumes; seek jumps', async () => {
  const btn = win.locator('[data-testid=player-button-pause]').or(win.locator('[data-testid=player-button-play]'))
  await btn.first().click()
  await sleep(700)
  const a = (await snap()).el.time
  await sleep(1200)
  const b = (await snap()).el.time
  expect(Math.abs(b - a) < 0.15, `time moved while paused (${a} → ${b})`)
  await btn.first().click()
  await sleep(1500)
  const c = (await snap()).el.time
  expect(c > b + 0.8, `time did not resume (${b} → ${c})`)
  const bar = win.locator('[data-testid=player-progress-slider]')
  const box = await bar.boundingBox()
  await win.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2)
  await sleep(900)
  const d = await snap()
  expect(d.el.time > 15, `did not seek (${d.el.time})`)
  expect(Math.abs(d.progress - d.el.time) < 1.5, 'progress bar out of step')
  const ref = await win.evaluate(() => window.__cp.player.getState().playerState.audioPlayerRef?.currentTime)
  expect(Math.abs(ref - d.el.time) < 1, 'queue sync would read a wrong position')
})

await test('song end moves to the next song; repeat-one restarts it', async () => {
  let s = await snap()
  const idx = s.index
  await win.evaluate(() => window.__cp.player.getState().playerState.audioPlayerRef.currentTime = 23.5)
  await until(async () => (await snap()).index === idx + 1, 8000)
  s = await snap()
  eq(s.index, idx + 1, 'advanced')
  eq(s.title, '88.2 kHz 24-bit', 'next title')
  await until(async () => (await snap()).out?.source?.rate === 88200, 8000)
  // Repeat one
  while ((await snap()) && (await win.evaluate(() => window.__cp.player.getState().playerState.loopState)) !== 2)
    await win.locator('[data-testid=player-button-loop]').click()
  await sleep(300)
  await win.evaluate(() => window.__cp.player.getState().playerState.audioPlayerRef.currentTime = 23.5)
  await sleep(3500)
  s = await snap()
  eq(s.title, '88.2 kHz 24-bit', 'same song')
  expect(s.el.time < 3, `did not restart (${s.el.time})`)
  while ((await win.evaluate(() => window.__cp.player.getState().playerState.loopState)) !== 0)
    await win.locator('[data-testid=player-button-loop]').click()
})

await test('switching a rate off converts songs at that rate', async () => {
  await playTrack('Rates and Depths', '96 kHz 24-bit')
  await openAudioSettings()
  await win.locator('[data-testid=rate-96000]').click()
  await sleep(300)
  await until(async () => (await snap()).out?.output?.rate === 48000, 8000)
  const s = await snap()
  eq([s.out.source.rate, s.out.output.rate], [96000, 48000], 'converted after switching 96 off')
  eq(s.prefs[EW200].disabledRates, [96000], 'saved')
  expect(s.el.time > 0.5, 'position lost on reload')
  await win.screenshot({ path: '/tmp/mpv-settings-3.png' })
  await win.locator('[data-testid=rate-96000]').click()
  await until(async () => (await snap()).out?.output?.rate === 96000, 8000)
  await closeSettings()
})

await test('fixed volume locks the slider; app volume is marked not bit-perfect', async () => {
  await openAudioSettings()
  await pickSelect('Volume', 'Fixed (bit-perfect)')
  await sleep(800)
  let s = await snap()
  eq(s.volume, 100, 'slider at 100 with fixed volume')
  expect(await win.locator('[data-testid=player-volume-slider][data-disabled]').count(), 'slider not disabled')
  await pickSelect('Volume', 'App volume (not bit-perfect)')
  await until(async () => (await snap()).out?.softVolume !== undefined)
  await win.evaluate(() => window.__cp.player.getState().actions.setVolume(50))
  await sleep(800)
  s = await snap()
  eq(s.out.softVolume, 50, 'mpv volume')
  await until(async () => /app volume/.test((await infoNow()) ?? ''))
  expect(/Not bit-perfect: app volume/.test(await infoNow()), `info: ${await infoNow()}`)
  await pickSelect('Volume', /Hardware/)
  await sleep(800)
  await closeSettings()
})

await test('copy button copies the output details', async () => {
  await openAudioSettings()
  await win.locator('[data-testid=output-info-copy]').click()
  await sleep(400)
  const clip = await electronApp.evaluate(({ clipboard }) => clipboard.readText())
  expect(/^ClearPlay output \(mpv engine\)\nDevice: SIMGOT EW200 DSP/.test(clip), clip)
  expect(/Now: Bit-perfect · 96 kHz · 24-bit/.test(clip), clip)
  await closeSettings()
})

await test('sleep timer pauses mpv', async () => {
  await win.evaluate(() => window.__cp.player.getState().actions.setPlayingState(true))
  await sleep(500)
  await win.evaluate(() => window.__cp.sleep?.getState().set(Date.now() + 800))
  await until(async () => !(await snap()).playing, 4000)
  const a = (await snap()).el.time
  await sleep(1000)
  expect(Math.abs((await snap()).el.time - a) < 0.15, 'still playing after the sleep timer')
  await win.evaluate(() => window.__cp.player.getState().actions.setPlayingState(true))
})

await test('listening time adds up for scrobbling', async () => {
  const a = await win.evaluate(() => window.__cp.player.getState().listenTime.accumulated)
  await sleep(2500)
  const b = await win.evaluate(() => window.__cp.player.getState().listenTime.accumulated)
  expect(b - a > 1.5, `accumulated ${a} → ${b}`)
})

await test('device that will not open falls back and says so', async () => {
  // The laptop card is not mapped to a test output, so opening hw: fails.
  await openAudioSettings()
  await pickSelect('Output device', /HDA Intel PCH · ALC257 Analog/)
  await until(async () => (await snap()).out?.deviceKey === 'alsa:hw:CARD=PCH,DEV=0', 10000)
  const s = await snap()
  eq([s.out.exclusive, s.out.fallback], [false, 'busy'], 'fallback')
  expect(s.el.time > 0, 'not playing after fallback')
  await until(async () => (await infoNow()) === 'Not bit-perfect: device busy')
  eq(await infoNow(), 'Not bit-perfect: device busy', 'info')
  await win.screenshot({ path: '/tmp/mpv-settings-busy.png' })
  await pickSelect('Output device', /SIMGOT EW200 DSP/)
  await until(async () => (await snap()).out?.exclusive === true, 10000)
  eq((await snap()).volume, (await snap()).prefs[EW200].level, 'EW200 level restored')
  await closeSettings()
})

function mpris(method, ...args) {
  const names = execFileSync('gdbus', ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.ListNames'], { encoding: 'utf8' })
  const name = names.match(/org\.mpris\.MediaPlayer2\.[\w.]+/)?.[0]
  if (!name) return null
  return execFileSync('gdbus', ['call', '--session', '--dest', name, '--object-path', '/org/mpris/MediaPlayer2', '--method', method, ...args], { encoding: 'utf8' })
}
const mprisGet = (prop) => mpris('org.freedesktop.DBus.Properties.Get', 'org.mpris.MediaPlayer2.Player', prop)

await test('MPRIS (Linux media controls) shows the song, state and position', async () => {
  if (!process.env.DBUS_SESSION_BUS_ADDRESS) throw new Error('no session bus (run through e2e-mpv.sh)')
  await win.evaluate(() => window.__cp.player.getState().actions.setPlayingState(true))
  await sleep(2500)
  const status = await until(async () => (/Playing/.test(mprisGet('PlaybackStatus') ?? '') ? 'ok' : null), 5000)
  expect(status, `PlaybackStatus: ${mprisGet('PlaybackStatus')}`)
  const meta = mprisGet('Metadata')
  const title = (await snap()).title
  expect(meta.includes(title), `metadata has no "${title}": ${meta.slice(0, 300)}`)
  expect(/mpris:length.*?(\d+)/.test(meta), 'no length')
  const len = Number(meta.match(/'mpris:length': <(?:int64 |uint64 )?(\d+)>/)?.[1] ?? 0) / 1e6
  expect(Math.abs(len - 25) < 1.5, `length ${len} s (song is 25 s; the silent loop is 10 s)`)
  const pos = Number(mprisGet('Position').match(/int64 (\d+)/)[1]) / 1e6
  const t = (await snap()).el.time
  expect(Math.abs(pos - t) < 2, `MPRIS position ${pos} vs mpv ${t}`)
  // Pause from the system controls.
  mpris('org.mpris.MediaPlayer2.Player.PlayPause')
  await until(async () => !(await snap()).playing, 4000)
  expect(!(await snap()).playing, 'PlayPause from MPRIS did not pause')
  mpris('org.mpris.MediaPlayer2.Player.PlayPause')
  await until(async () => (await snap()).playing, 4000)
  const idx = (await snap()).index
  mpris('org.mpris.MediaPlayer2.Player.Next')
  await until(async () => (await snap()).index === idx + 1, 4000)
  eq((await snap()).index, idx + 1, 'Next from MPRIS')
})

await test('radio and stop: queue clear stops mpv', async () => {
  await win.evaluate(() => window.__cp.player.getState().actions.clearPlayerState())
  await sleep(800)
  const s = await snap()
  eq(s.el, null, 'element gone')
  eq(s.out, null, 'output cleared')
})

await test('no page errors', async () => {
  eq([...new Set(errors)], [], 'page errors')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (errors.length) console.log('page errors:\n' + [...new Set(errors)].slice(0, 10).join('\n'))
await electronApp.close()
fs.rmSync(state, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
