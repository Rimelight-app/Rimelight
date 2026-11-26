// Stats: computeStats gives the same numbers on full Navidrome song objects
// and on the fields Stats keeps (statsFields).
// Usage: node tools/dev-rig/stats-unit.mjs   (Node 22.18+)
// Fixture: tools/dev-rig/fixtures/stats-songs.json, real search3 songs from
// Navidrome 0.64.2 (44 fields each) with some plays, dates and FLAC added.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const { computeStats, statsFields } = await import(
  pathToFileURL(path.join(root, 'src/utils/libraryStats.ts')).href
)
const songs = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/stats-songs.json'), 'utf8'))

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

const full = computeStats(songs)
const slim = computeStats(songs.map(statsFields))
const { recent: fullRecent, ...fullRest } = full
const { recent: slimRecent, ...slimRest } = slim

t('fixture has plays, lossless songs and dates', () => {
  assert.ok(full.plays > 0 && full.losslessShare > 0 && fullRecent.length > 0)
})
t('every shown number and list is the same', () => assert.deepEqual(slimRest, fullRest))
t('recent: same songs, same order, same times', () =>
  assert.deepEqual(
    slimRecent.map((s) => [s.id, s.playedAt, s.title, s.artist, s.coverArt]),
    fullRecent.map((s) => [s.id, s.playedAt, s.title, s.artist, s.coverArt]),
  ),
)
t('statsFields keeps 14 fields', () => assert.equal(Object.keys(statsFields(songs[0])).length, 14))
t('a kept song is much smaller', () =>
  assert.ok(JSON.stringify(statsFields(songs[0])).length < JSON.stringify(songs[0]).length / 2),
)

console.log(`\n${passed} passed, ${failed} failed`)
