// Unit checks for the reportPlayback decisions (src/service/playback-report.ts).
// Usage: node tools/dev-rig/playback-report-unit.mjs   (Node 22.18+ runs the .ts file directly)
// The end-to-end checks against a real server are in e2e-playback-report.mjs.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { createPlaybackReportLogic, HEARTBEAT_MS } = await import(
  pathToFileURL(path.join(root, 'src/service/playback-report.ts')).href
)

let n = 0
const t = (name, fn) => {
  try {
    fn()
    n++
    console.log(`PASS  ${name}`)
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message.split('\n').slice(0, 4).join(' ')}`)
    process.exitCode = 1
  }
}

/** A pretend player: change its state, then see what was reported. */
function rig() {
  let clock = 0
  const sent = []
  const logic = createPlaybackReportLogic(
    (r) => sent.push(r),
    () => clock,
  )
  const s = {
    songId: null,
    isPlaying: false,
    position: 0,
    listened: 0,
    playbackRate: 1,
  }
  const set = (patch) => {
    Object.assign(s, patch)
    logic.update({ ...s })
  }
  /** Plays `seconds`, one engine tick per second, like the progress store. */
  const play = (seconds) => {
    for (let i = 0; i < seconds; i++) {
      clock += 1000
      set({ position: s.position + 1, listened: s.listened + 1 })
    }
  }
  const states = () => sent.map((r) => r.state)
  return { logic, sent, s, set, play, states, tick: (ms) => (clock += ms) }
}

t(
  'a song that starts playing: starting, then playing once the position moves',
  () => {
    const r = rig()
    r.set({ songId: 'a', isPlaying: true })
    assert.deepEqual(r.states(), ['starting'])
    r.set({}) // still buffering
    assert.deepEqual(r.states(), ['starting'])
    r.play(1)
    assert.deepEqual(r.states(), ['starting', 'playing'])
    assert.equal(r.sent[1].positionMs, 1000)
    assert.equal(r.sent[0].mediaId, 'a')
  },
)

t('pause sends paused once', () => {
  const r = rig()
  r.set({ songId: 'a', isPlaying: true })
  r.play(5)
  r.set({ isPlaying: false })
  r.set({}) // other store changes while paused
  r.tick(HEARTBEAT_MS * 3)
  r.set({})
  assert.deepEqual(r.states(), ['starting', 'playing', 'paused'])
  assert.equal(r.sent[2].positionMs, 5000)
})

t('resume sends playing (after the position moves)', () => {
  const r = rig()
  r.set({ songId: 'a', isPlaying: true })
  r.play(5)
  r.set({ isPlaying: false })
  r.set({ isPlaying: true })
  assert.deepEqual(r.states(), ['starting', 'playing', 'paused'])
  r.play(1)
  assert.deepEqual(r.states(), ['starting', 'playing', 'paused', 'playing'])
  assert.equal(r.sent.at(-1).positionMs, 6000)
})

t('every pause and resume is reported, each once', () => {
  const r = rig()
  r.set({ songId: 'a', isPlaying: true })
  r.play(2)
  for (let i = 0; i < 3; i++) {
    r.set({ isPlaying: false })
    r.set({ isPlaying: true })
    r.play(1)
  }
  assert.deepEqual(r.states(), [
    'starting',
    'playing',
    'paused',
    'playing',
    'paused',
    'playing',
    'paused',
    'playing',
  ])
})

t('while playing: the position again every 30 s, not more', () => {
  const r = rig()
  r.set({ songId: 'a', isPlaying: true })
  r.play(1)
  r.play(29)
  assert.equal(r.states().filter((x) => x === 'playing').length, 1)
  r.play(1)
  assert.equal(r.states().filter((x) => x === 'playing').length, 2)
  r.play(30)
  assert.equal(r.states().filter((x) => x === 'playing').length, 3)
})

t('seeking while playing or paused is reported with the new position', () => {
  const r = rig()
  r.set({ songId: 'a', isPlaying: true })
  r.play(10)
  r.set({ position: 120 })
  assert.deepEqual(r.sent.at(-1), {
    mediaId: 'a',
    state: 'playing',
    positionMs: 120000,
    playbackRate: 1,
  })
  r.set({ position: 30 })
  assert.equal(r.sent.at(-1).positionMs, 30000)
  r.set({ isPlaying: false })
  r.set({ position: 90 })
  assert.deepEqual(r.sent.at(-1), {
    mediaId: 'a',
    state: 'paused',
    positionMs: 90000,
    playbackRate: 1,
  })
})

t('next song: stopped for the old one, starting for the new one', () => {
  const r = rig()
  r.set({ songId: 'a', isPlaying: true })
  r.play(200)
  r.sent.length = 0
  r.set({ songId: 'b', position: 0, listened: 0 })
  assert.deepEqual(
    r.sent.map((x) => [x.mediaId, x.state, x.positionMs]),
    [
      ['a', 'stopped', 200000],
      ['b', 'starting', 0],
    ],
  )
})

t('the same song again (repeat one) is a new start', () => {
  const r = rig()
  r.set({ songId: 'a', isPlaying: true })
  r.play(180)
  r.sent.length = 0
  r.set({ position: 0, listened: 0 })
  assert.deepEqual(r.states(), ['stopped', 'starting'])
  r.play(1)
  assert.deepEqual(r.states(), ['stopped', 'starting', 'playing'])
})

t('end of the queue (nothing left) sends stopped', () => {
  const r = rig()
  r.set({ songId: 'a', isPlaying: true })
  r.play(3)
  r.set({ songId: null, isPlaying: false, position: 0, listened: 0 })
  assert.deepEqual(r.states(), ['starting', 'playing', 'stopped'])
  assert.equal(r.logic.active, false)
})

t('a song loaded paused (app start) is not reported until it plays', () => {
  const r = rig()
  r.set({ songId: 'a', isPlaying: false, position: 42 })
  r.set({})
  assert.deepEqual(r.states(), [])
  r.set({ isPlaying: true })
  assert.deepEqual(r.sent[0], {
    mediaId: 'a',
    state: 'starting',
    positionMs: 42000,
    playbackRate: 1,
  })
})

t('skipping to another song while paused ends the session', () => {
  const r = rig()
  r.set({ songId: 'a', isPlaying: true })
  r.play(3)
  r.set({ isPlaying: false })
  r.set({ songId: 'b', position: 0, listened: 0 })
  assert.deepEqual(r.states(), ['starting', 'playing', 'paused', 'stopped'])
})

t('stop() (quit) sends stopped once, then nothing', () => {
  const r = rig()
  r.set({ songId: 'a', isPlaying: true })
  r.play(7)
  r.logic.stop()
  r.logic.stop()
  assert.deepEqual(r.states(), ['starting', 'playing', 'stopped'])
  assert.equal(r.sent.at(-1).positionMs, 7000)
})

t('drop() (server changed) forgets the session without a report', () => {
  const r = rig()
  r.set({ songId: 'a', isPlaying: true })
  r.logic.drop()
  r.logic.stop()
  assert.deepEqual(r.states(), ['starting'])
})

t('a speed change while playing is reported', () => {
  const r = rig()
  r.set({ songId: 'a', isPlaying: true })
  r.play(2)
  r.set({ playbackRate: 1.25 })
  assert.deepEqual(r.sent.at(-1), {
    mediaId: 'a',
    state: 'playing',
    positionMs: 2000,
    playbackRate: 1.25,
  })
})

t('pause before the audio ever started: paused, then playing on resume', () => {
  const r = rig()
  r.set({ songId: 'a', isPlaying: true })
  r.set({ isPlaying: false })
  r.set({ isPlaying: true })
  r.play(1)
  assert.deepEqual(r.states(), ['starting', 'paused', 'playing'])
})

console.log(`${n} passed`)
