// Section 7 E2E against Navidrome 0.64.2: the desktop saves its queue, then a
// fake Rimelight for Android (c=ClearPlay-Android) saves after it, then the
// desktop quits without anything happening here. The server's queue must
// still be the phone's (changedBy ClearPlay-Android).
// Usage (from tools/dev-rig): perf/xrun.sh node perf/handoff-quit.mjs
import crypto from 'node:crypto'
import { api, findAlbum, go, launch, ND, sleep, writeResult } from './lib.mjs'

async function saveAsAndroid(ids, index, positionMs) {
  const salt = crypto.randomBytes(6).toString('hex')
  const t = crypto.createHash('md5').update(`test1234${salt}`).digest('hex')
  const body = new URLSearchParams([
    ['u', 'admin'],
    ['t', t],
    ['s', salt],
    ['v', '1.16.1'],
    ['c', 'ClearPlay-Android'],
    ['f', 'json'],
    ...ids.map((id) => ['id', id]),
    ['currentIndex', String(index)],
    ['position', String(positionMs)],
  ])
  const res = await fetch(`${ND}/rest/savePlayQueueByIndex`, {
    method: 'POST',
    body,
  })
  return (await res.json())['subsonic-response'].status
}
const queue = async () => (await api('getPlayQueueByIndex')).playQueueByIndex

const s = await launch({ fresh: true })
const { app, win } = s
await win.evaluate(() =>
  window.__cp.settings.getState().set({ syncQueue: true }),
)
const album = await findAlbum('Fault Test')
await go(win, `/library/albums/${album.id}`, 2500)
await win
  .getByRole('button', { name: /^(Play all|Pause)$/ })
  .first()
  .click()
await sleep(3000)
await win.evaluate(() =>
  window.__cp.player.getState().actions.setPlayingState(false),
)
await sleep(2500) // the pause save (0.5 s)
const afterDesktop = await queue()
const ids = afterDesktop.entry.map((e) => e.id)
await sleep(1500)
const status = await saveAsAndroid(ids, 3, 7000)
await sleep(1000)
const afterAndroid = await queue()

// Quit the desktop app, untouched since its own save.
const exited = new Promise((r) => app.process().once('exit', r))
await app.evaluate(({ app: a }) => a.quit())
await Promise.race([exited, sleep(8000)])
await sleep(1500)
const afterQuit = await queue()

const out = {
  desktopSaved: {
    changedBy: afterDesktop.changedBy,
    currentIndex: afterDesktop.currentIndex,
  },
  androidSave: status,
  afterAndroid: {
    changedBy: afterAndroid.changedBy,
    currentIndex: afterAndroid.currentIndex,
    position: afterAndroid.position,
  },
  afterDesktopQuit: {
    changedBy: afterQuit.changedBy,
    currentIndex: afterQuit.currentIndex,
    position: afterQuit.position,
  },
}
const ok =
  afterQuit.changedBy === 'ClearPlay-Android' && afterQuit.currentIndex === 3
console.log(JSON.stringify(out, null, 2))
console.log(
  `${ok ? 'PASS' : 'FAIL'}  desktop quit untouched: the phone's queue stays (changedBy ${afterQuit.changedBy})`,
)
writeResult('handoff-quit', { ...out, ok })
process.exit(ok ? 0 : 1)
