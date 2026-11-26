// "Start radio": seed -> request, and the queue that comes out
// (src/service/radio-rules.ts). The fake server answers are plain lists.
// Usage: node tools/dev-rig/radio-unit.mjs   (Node 22.18+)
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const r = await import(pathToFileURL(path.resolve(here, '../../src/service/radio-rules.ts')).href)

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

t('song -> getSimilarSongs with the song id', () =>
  assert.deepEqual(r.radioRequest({ kind: 'song', id: 'so1', name: 'A' }), {
    path: '/getSimilarSongs', query: { id: 'so1', count: '50' }, key: 'similarSongs',
  }),
)
t('album -> getSimilarSongs with the album id (Navidrome 0.64.2 takes it)', () =>
  assert.deepEqual(r.radioRequest({ kind: 'album', id: 'al1', name: 'B' }), {
    path: '/getSimilarSongs', query: { id: 'al1', count: '50' }, key: 'similarSongs',
  }),
)
t('artist -> getSimilarSongs2 with the artist id', () =>
  assert.deepEqual(r.radioRequest({ kind: 'artist', id: 'ar1', name: 'C' }), {
    path: '/getSimilarSongs2', query: { id: 'ar1', count: '50' }, key: 'similarSongs2',
  }),
)
t('local song ("Music on this computer") -> hidden', () =>
  assert.equal(r.radioRequest({ kind: 'song', id: 'tr-0123456789abcdef', name: 'L' }), null),
)
t('connected to "Music on this computer" -> hidden for every seed', () => {
  for (const kind of ['song', 'album', 'artist']) assert.equal(r.radioRequest({ kind, id: 'x1', name: 'x' }, true), null)
})
t('no id -> hidden', () => assert.equal(r.radioRequest({ kind: 'album', id: '', name: 'x' }), null))

const s = (id) => ({ id, title: id })
t('seed song first, once, duplicates removed', () =>
  assert.deepEqual(r.radioQueue(s('a'), [s('b'), s('a'), s('c'), s('b'), s('d')]).map((x) => x.id), ['a', 'b', 'c', 'd']),
)
t('album / artist: the similar songs, duplicates removed', () =>
  assert.deepEqual(r.radioQueue(null, [s('b'), s('c'), s('b')]).map((x) => x.id), ['b', 'c']),
)
t('empty answer -> empty queue (the old queue stays)', () => {
  assert.deepEqual(r.radioQueue(s('a'), []), [])
  assert.deepEqual(r.radioQueue(null, []), [])
})
t('only the seed came back -> empty queue', () => assert.deepEqual(r.radioQueue(s('a'), [s('a')]), []))

console.log(`\n${passed} passed, ${failed} failed`)
