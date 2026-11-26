// Runs every shared case in queue-handoff-cases.json against
// src/service/queue-handoff.ts ("Continue on other devices").
// Usage: node tools/dev-rig/queue-handoff-unit.mjs   (Node 22.18+ runs the .ts file directly)
// Rimelight for Android runs the same file against QueueHandoff.kt.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const h = await import(
  pathToFileURL(path.join(root, 'src/service/queue-handoff.ts')).href
)
const cases = JSON.parse(
  fs.readFileSync(path.join(here, 'queue-handoff-cases.json'), 'utf8'),
)

let passed = 0
let failed = 0
const t = (name, fn) => {
  try {
    fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}: ${e.message.split('\n').slice(0, 6).join(' ')}`)
    process.exitCode = 1
  }
}

/** Expands {"generate": {...}} lists (see "about" in the cases file). */
function ids(list) {
  if (!list?.generate) return list
  const { prefix, from, to, step } = list.generate
  const out = []
  for (let i = from; i < to; i += step) out.push(`${prefix}${i}`)
  return out
}
function songs(list) {
  if (!list?.generate) return list
  const every = list.generate.localEvery
  return ids(list).map((id) => {
    const i = Number(id.slice(list.generate.prefix.length))
    return { id, local: Boolean(every) && i % every === every - 1 }
  })
}

assert.equal(cases.version, 4, 'cases file version')
assert.equal(cases.thisApp.desktop, h.DESKTOP_APP)
assert.equal(cases.thisApp.android, h.ANDROID_APP)
assert.deepEqual(cases.legacyNames, { ...h.LEGACY_NAMES })

for (const c of cases.deviceName)
  t(`deviceName: ${c.input}`, () =>
    assert.equal(h.deviceName(c.input), c.expected),
  )

for (const c of cases.saveWindow)
  t(`saveWindow: ${c.name}`, () => {
    const got = h.saveWindow(songs(c.input.songs), c.input.currentIndex)
    const want = c.expected && { ...c.expected, ids: ids(c.expected.ids) }
    assert.deepEqual(got, want)
  })

for (const c of cases.shouldSave)
  t(`shouldSave: ${c.name}`, () =>
    assert.equal(h.shouldSave(c.input), c.expected),
  )

for (const c of cases.debounce)
  t(`debounce: ${c.name}`, () => {
    // A pretend clock: timers fire when time is moved past them.
    let now = 0
    let timers = []
    const saves = []
    const d = h.createSaveDebouncer(
      (event) => saves.push({ at: now, event }),
      (fn, ms) => {
        const timer = { at: now + ms, fn }
        timers.push(timer)
        return timer
      },
      (timer) => {
        timers = timers.filter((x) => x !== timer)
      },
    )
    const runUntil = (time) => {
      for (;;) {
        const next = timers
          .filter((x) => x.at <= time)
          .sort((a, b) => a.at - b.at)[0]
        if (!next) break
        timers = timers.filter((x) => x !== next)
        now = next.at
        next.fn()
      }
      now = time
    }
    for (const e of c.events) {
      runUntil(e.at)
      d.event(e.event)
    }
    runUntil(Number.MAX_SAFE_INTEGER / 2)
    assert.deepEqual(saves, c.expected)
  })

for (const c of cases.offer)
  t(`offer: ${c.name}`, () => {
    // The rules never read this device's clock; nowMs is only to show it.
    const realNow = Date.now
    if (c.nowMs) Date.now = () => c.nowMs
    try {
      assert.deepEqual(h.offer(c.input), c.expected)
    } finally {
      Date.now = realNow
    }
  })

for (const c of cases.leftBehindCandidate)
  t(`leftBehindCandidate: ${c.name}`, () =>
    assert.deepEqual(h.leftBehindCandidate(c.input), c.expected),
  )

for (const c of cases.leftBehind)
  t(`leftBehind: ${c.name}`, () =>
    assert.deepEqual(h.leftBehind(c.input), c.expected),
  )

for (const c of cases.isNaturalEnd)
  t(`isNaturalEnd: ${c.name}`, () =>
    assert.equal(
      h.isNaturalEnd(c.input.positionS, c.input.durationS),
      c.expected,
    ),
  )

for (const c of cases.isQueueCleared)
  t(`isQueueCleared: ${c.name}`, () =>
    assert.equal(
      h.isQueueCleared(
        c.input.previousIds,
        c.input.currentIds,
        c.input.previousCurrentId,
      ),
      c.expected,
    ),
  )

for (const c of cases.ageText)
  t(`ageText: ${c.name}`, () =>
    assert.deepEqual(h.ageText(c.input.changed, c.input.nowMs), c.expected),
  )

console.log(`${passed} passed, ${failed} failed`)
