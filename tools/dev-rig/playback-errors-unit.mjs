// Rules for songs that can't be played, the server-reachability retry
// schedule and how a failed page load is shown (src/service/playback-errors-rules.ts).
// Usage: node tools/dev-rig/playback-errors-unit.mjs   (Node 22.18+)
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const r = await import(pathToFileURL(path.join(root, 'src/service/playback-errors-rules.ts')).href)

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
const d = (o) => r.decideOnError({ reachable: true, retries: 0, failuresInARow: 0, hasNext: true, ...o })

t('server unreachable: pause, never skip (even after a retry)', () => {
  assert.equal(d({ reachable: false }), 'offline')
  assert.equal(d({ reachable: false, retries: 1, failuresInARow: 2 }), 'offline')
})
t('first failure: retry the same song', () => assert.equal(d({}), 'retry'))
t('failed again: skip to the next song', () => assert.equal(d({ retries: 1 }), 'skip'))
t('failed again on the last song: stop there', () => assert.equal(d({ retries: 1, hasNext: false }), 'stopAtEnd'))
t('second song in a row: still skips', () => assert.equal(d({ retries: 1, failuresInARow: 1 }), 'skip'))
t('third song in a row: stop', () => assert.equal(d({ retries: 1, failuresInARow: 2 }), 'stopLimit'))
t('third in a row on the last song: the limit message wins', () =>
  assert.equal(d({ retries: 1, failuresInARow: 2, hasNext: false }), 'stopLimit'),
)
t('limit is 3', () => assert.equal(r.MAX_FAILURES_IN_A_ROW, 3))

t('retry schedule: 5 s, 15 s, 30 s, then every 60 s', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(r.retryDelayMs), [5000, 15000, 30000, 60000, 60000, 60000])
})

for (const [input, kind] of [
  [{ subsonicCode: 70 }, 'notFound'],
  [{ status: 404 }, 'notFound'],
  [{ subsonicCode: 40 }, 'auth'],
  [{ subsonicCode: 41 }, 'auth'],
  [{ subsonicCode: 44 }, 'auth'],
  [{ status: 401 }, 'auth'],
  [{ status: 500 }, 'server'],
  [{ status: 503 }, 'server'],
  [{ status: 0 }, 'server'],
  [{ badBody: true }, 'server'],
  [{ subsonicCode: 0 }, 'server'],
  [{ subsonicCode: 10 }, 'server'],
  [{}, 'server'],
]) {
  t(`page error ${JSON.stringify(input)} -> ${kind}`, () => assert.equal(r.classifyPageError(input), kind))
}

console.log(`\n${passed} passed, ${failed} failed`)
