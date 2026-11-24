// Lyrics of local songs ("Music on this computer") and the fullscreen LRC
// parser. Usage: node tools/dev-rig/local-lyrics-unit.mjs   (Node 22.18+)
// Fixtures: tools/dev-rig/fixtures, rebuilt by make-lyrics-fixtures.sh.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseFile } from 'music-metadata'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const fixtures = path.join(here, 'fixtures')
const { parseLyrics, readLyrics, syltLyrics } = await import(
  pathToFileURL(path.join(root, 'electron/main/core/local-library/lyrics.ts'))
    .href
)
const { parseLrc } = await import(
  pathToFileURL(path.join(root, 'src/app/components/fullscreen/lrc.ts')).href
)

let passed = 0
let failed = 0
const t = async (name, fn) => {
  try {
    await fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}: ${e.message.split('\n').slice(0, 6).join(' ')}`)
    process.exitCode = 1
  }
}

// The LYRICS tag of fixtures/local-lyrics.flac.
const FIXTURE = [
  '[ar:Test]',
  '[offset:+300]',
  '[00:05.00]First line',
  '[00:08]No fraction line',
  '[00:10.50][01:20.00]Chorus line (repeats)',
  '[0:15.00]One-digit minute',
  '[00:20.00]<00:20.00>Word <00:20.60>by <00:21.10>word',
].join('\n')

const EXPECTED = [
  { start: 4700, value: 'First line' },
  { start: 7700, value: 'No fraction line' },
  { start: 10200, value: 'Chorus line (repeats)' },
  { start: 14700, value: 'One-digit minute' },
  { start: 19700, value: 'Word by word' },
  { start: 79700, value: 'Chorus line (repeats)' },
]

await t(
  'parseLyrics: the fixture text gives 6 timed lines, offset applied',
  () => {
    const r = parseLyrics(FIXTURE)
    assert.equal(r.synced, true)
    assert.deepEqual(r.lines, EXPECTED)
  },
)

await t('parseLyrics: no <…> markers and no [ar:] left', () => {
  const text = parseLyrics(FIXTURE)
    .lines.map((l) => l.value)
    .join('\n')
  assert.ok(!/[<>]/.test(text), text)
  assert.ok(!text.includes('Test'), text)
})

await t('parseLyrics: plain text is unsynced', () => {
  const r = parseLyrics('First line\nSecond line\n\n[ar:Someone]\nThird')
  assert.equal(r.synced, false)
  assert.deepEqual(
    r.lines.map((l) => l.value),
    ['First line', 'Second line', 'Third'],
  )
  assert.ok(r.lines.every((l) => l.start === undefined))
})

await t('parseLyrics: [mm:ss:xx], [m:ss.xx], [mm:ss], several stamps', () => {
  const r = parseLyrics(
    '[01:02:50]Colon\n[1:03.25]Short minute\n[01:04]No fraction\n[00:01.00][00:02.00]Twice',
  )
  assert.deepEqual(r.lines, [
    { start: 1000, value: 'Twice' },
    { start: 2000, value: 'Twice' },
    { start: 62500, value: 'Colon' },
    { start: 63250, value: 'Short minute' },
    { start: 64000, value: 'No fraction' },
  ])
})

await t(
  'parseLyrics: negative offset is later; a line never goes below 0',
  () => {
    assert.deepEqual(parseLyrics('[offset:-250]\n[00:01.00]A').lines, [
      { start: 1250, value: 'A' },
    ])
    assert.deepEqual(parseLyrics('[offset:+5000]\n[00:01.00]A').lines, [
      { start: 0, value: 'A' },
    ])
    assert.deepEqual(parseLyrics('[offset: 200 ]\n[00:01.00]A').lines, [
      { start: 800, value: 'A' },
    ])
  },
)

await t(
  'parseLyrics: lyrics text with < and > but no markers is untouched',
  () => {
    assert.deepEqual(parseLyrics('[00:01.00]a <3 b  > c').lines, [
      { start: 1000, value: 'a <3 b  > c' },
    ])
  },
)

await t('readLyrics on the FLAC fixture returns all 6 lines', async () => {
  const r = await readLyrics({
    path: path.join(fixtures, 'local-lyrics.flac'),
    hasEmbeddedLyrics: true,
  })
  assert.equal(r.synced, true)
  assert.deepEqual(r.lines, EXPECTED)
})

await t(
  "0.5.2's way (music-metadata common.lyrics) loses 3 of them",
  async () => {
    const meta = await parseFile(path.join(fixtures, 'local-lyrics.flac'), {
      skipCovers: true,
      duration: false,
    })
    const sync = meta.common.lyrics?.find((l) => l.syncText?.length)?.syncText
    assert.deepEqual(
      sync.map((l) => [l.timestamp, l.text]),
      [
        [5000, 'First line'],
        [10500, '[01:20.00]Chorus line (repeats)'],
        [20000, '<00:20.00>Word <00:20.60>by <00:21.10>word'],
      ],
    )
  },
)

await t(
  'readLyrics: a sidecar .lrc still wins over embedded lyrics',
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-lyrics-'))
    const song = path.join(dir, 'song.flac')
    fs.copyFileSync(path.join(fixtures, 'local-lyrics.flac'), song)
    fs.writeFileSync(path.join(dir, 'song.lrc'), '[00:03.00]Sidecar')
    try {
      const r = await readLyrics({ path: song, hasEmbeddedLyrics: true })
      assert.deepEqual(r.lines, [{ start: 3000, value: 'Sidecar' }])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  },
)

await t('readLyrics: ID3 SYLT in ms, syllables joined into lines', async () => {
  const r = await readLyrics({
    path: path.join(fixtures, 'sylt-ms.mp3'),
    hasEmbeddedLyrics: true,
  })
  assert.equal(r.synced, true)
  assert.deepEqual(r.lines, [
    { start: 1000, value: 'Hello world' },
    { start: 4000, value: 'Second line' },
    { start: 9000, value: 'Third line' },
  ])
})

await t('readLyrics: ID3 SYLT in MPEG frames is unsynced', async () => {
  const r = await readLyrics({
    path: path.join(fixtures, 'sylt-frames.mp3'),
    hasEmbeddedLyrics: true,
  })
  assert.equal(r.synced, false)
  assert.deepEqual(
    r.lines.map((l) => l.value),
    ['Hello world', 'Second line', 'Third line'],
  )
  assert.ok(r.lines.every((l) => l.start === undefined))
})

await t('SYLT without line breaks keeps one line per entry', () => {
  const native = {
    'ID3v2.4': [
      {
        id: 'SYLT',
        value: {
          timeStampFormat: 2,
          syncText: [
            { text: 'One line', timestamp: 1000 },
            { text: 'Another line', timestamp: 3000 },
            { text: 'Last line', timestamp: 6000 },
          ],
        },
      },
    ],
  }
  assert.deepEqual(syltLyrics(native), {
    synced: true,
    lines: [
      { start: 1000, value: 'One line' },
      { start: 3000, value: 'Another line' },
      { start: 6000, value: 'Last line' },
    ],
  })
})

await t('parseLrc (fullscreen): markers stripped, both chorus times', () => {
  const lines = parseLrc(FIXTURE)
  assert.deepEqual(
    lines.map((l) => [l.time, l.text]),
    [
      [5000, 'First line'],
      [8000, 'No fraction line'],
      [10500, 'Chorus line (repeats)'],
      [15000, 'One-digit minute'],
      [20000, 'Word by word'],
      [80000, 'Chorus line (repeats)'],
    ],
  )
})

await t('parseLrc: what the renderer gets back from the server', () => {
  // service/lyrics.ts turns structured lines into "[mm:ss.xx] text".
  const lines = parseLrc('[00:04.70] First line\n[01:19.70] Chorus')
  assert.deepEqual(lines, [
    { time: 4700, text: 'First line' },
    { time: 79700, text: 'Chorus' },
  ])
})

console.log(`${passed} passed, ${failed} failed`)
