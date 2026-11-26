// Song progress on the Windows taskbar button: the state -> bar mapping and
// the throttle (src/service/taskbar-progress-rules.ts).
// Usage: node tools/dev-rig/taskbar-unit.mjs   (Node 22.18+)
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const r = await import(pathToFileURL(path.resolve(here, '../../src/service/taskbar-progress-rules.ts')).href)

let passed = 0
let failed = 0
const t = (name, fn) => {
  try {
    fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}: ${e.message.split('\n').slice(0, 4).join(' ')}`)
    process.exitCode = 1
  }
}
const tp = (o) => r.taskbarProgress({ state: 'playing', positionMs: 30_000, durationMs: 120_000, error: false, ...o })

t('playing: position / duration, normal', () => assert.deepEqual(tp({}), { progress: 0.25, mode: 'normal' }))
t('paused: same value, paused', () => assert.deepEqual(tp({ state: 'paused' }), { progress: 0.25, mode: 'paused' }))
t('stopped / empty queue: removed', () => assert.deepEqual(tp({ state: 'stopped' }), { progress: -1, mode: 'none' }))
t('duration 0: removed', () => assert.deepEqual(tp({ durationMs: 0 }), { progress: -1, mode: 'none' }))
t('duration unknown (NaN): removed', () => assert.deepEqual(tp({ durationMs: Number.NaN }), { progress: -1, mode: 'none' }))
t('position past the end: clamped to 1', () => assert.deepEqual(tp({ positionMs: 200_000 }), { progress: 1, mode: 'normal' }))
t('negative position: 0', () => assert.deepEqual(tp({ positionMs: -5 }), { progress: 0, mode: 'normal' }))
t('error: red at the position', () => assert.deepEqual(tp({ error: true }), { progress: 0.25, mode: 'error' }))
t('error while paused: still red', () => assert.equal(tp({ error: true, state: 'paused' }).mode, 'error'))
t('error with no duration: a full red bar', () => assert.deepEqual(tp({ error: true, durationMs: 0 }), { progress: 1, mode: 'error' }))
t('buffering = playing with a still position: same value, no indeterminate', () => {
  assert.deepEqual(tp({}), tp({}))
  assert.notEqual(tp({}).mode, 'indeterminate')
})

function run(events) {
  let clock = 0
  const sent = []
  const th = r.createProgressThrottle((p) => sent.push({ ...p, at: clock }), () => clock)
  for (const e of events) {
    clock = e.at
    th.update(e.p, e.immediate)
  }
  return sent
}

t('10 minutes of 250 ms time updates: at most one call per second', () => {
  const events = []
  const duration = 600_000
  for (let at = 0; at <= duration; at += 250) {
    events.push({ at, p: r.taskbarProgress({ state: 'playing', positionMs: at, durationMs: duration, error: false }) })
  }
  const sent = run(events)
  for (let i = 1; i < sent.length; i++) assert.ok(sent[i].at - sent[i - 1].at >= 1000, `two calls ${sent[i].at - sent[i - 1].at} ms apart`)
  assert.ok(sent.length <= 601 && sent.length >= 150, `${sent.length} calls`)
})
t('a 10-hour song: 0.5 % steps win over 1 s (fewer calls)', () => {
  const duration = 36_000_000
  const events = []
  for (let at = 0; at <= 600_000; at += 250) events.push({ at, p: r.taskbarProgress({ state: 'playing', positionMs: at, durationMs: duration, error: false }) })
  const sent = run(events)
  // 0.5 % of 10 h is 3 min: the first value and one every 3 minutes.
  assert.equal(sent.length, 4, `${sent.length} calls in 10 minutes`)
})
t('unchanged value: not sent again', () => {
  const p = { progress: 0.5, mode: 'paused' }
  assert.equal(run([{ at: 0, p }, { at: 5000, p }, { at: 9000, p, immediate: true }]).length, 1)
})
for (const [what, mode] of [['pause', 'paused'], ['error', 'error'], ['play', 'normal']]) {
  t(`${what}: sent at once`, () => {
    const start = mode === 'normal' ? 'paused' : 'normal'
    const sent = run([{ at: 0, p: { progress: 0.3, mode: start } }, { at: 100, p: { progress: 0.3, mode } }])
    assert.equal(sent.length, 2)
    assert.equal(sent[1].at, 100)
  })
}
t('seek and song change (immediate): sent at once', () => {
  const sent = run([
    { at: 0, p: { progress: 0.3, mode: 'normal' } },
    { at: 200, p: { progress: 0.8, mode: 'normal' }, immediate: true },
    { at: 300, p: { progress: 0, mode: 'normal' }, immediate: true },
  ])
  assert.deepEqual(sent.map((s) => s.at), [0, 200, 300])
})

console.log(`\n${passed} passed, ${failed} failed`)
