// Live-cover lookups: which artist names each screen asks the cover service
// for (src/api/artworkArtists.ts). The service matches one artist name, so
// the album page and the song screens must ask the same names for the same
// album. Usage: node tools/dev-rig/artwork-artists-unit.mjs   (Node 22.18+)
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const { albumArtworkArtists, songArtworkArtists, MAX_ARTWORK_ARTISTS } =
  await import(
    pathToFileURL(path.resolve(here, '../../src/api/artworkArtists.ts')).href
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
    console.log(`FAIL  ${name}: ${e.message.split('\n').slice(0, 4).join(' ')}`)
    process.exitCode = 1
  }
}
const a = (name, id = name) => ({ id, name })

// What Navidrome 0.64.2 returns for the rig's "Twin Signals"
// (album artists Rig Artist A and B; "Crossing" features Rig Artist C).
const twinAlbum = {
  artist: 'Rig Artist A • Rig Artist B',
  artists: [a('Rig Artist A'), a('Rig Artist B')],
}
const twinSong = (artist) => ({
  artist,
  albumArtists: [a('Rig Artist A'), a('Rig Artist B')],
  displayAlbumArtist: 'Rig Artist A • Rig Artist B',
})

t('two-artist album page: each album artist, then the joined string', () =>
  assert.deepEqual(albumArtworkArtists(twinAlbum), [
    'Rig Artist A',
    'Rig Artist B',
    'Rig Artist A • Rig Artist B',
  ]),
)
t('two-artist album: its songs ask exactly what the album page asks', () => {
  assert.deepEqual(
    songArtworkArtists(twinSong('Rig Artist A')),
    albumArtworkArtists(twinAlbum),
  )
})
t('featured-artist song asks its album artists, not "A • C"', () => {
  const names = songArtworkArtists(twinSong('Rig Artist A • Rig Artist C'))
  assert.deepEqual(names, albumArtworkArtists(twinAlbum))
  assert.ok(!names.includes('Rig Artist A • Rig Artist C'))
})
t('featured-artist song on a one-artist album: album artist first', () =>
  assert.deepEqual(
    songArtworkArtists({
      artist: 'Don Toliver, Travis Scott',
      albumArtists: [a('Don Toliver')],
      displayAlbumArtist: 'Don Toliver',
    }),
    ['Don Toliver', 'Don Toliver, Travis Scott'],
  ),
)
t('one-artist album: exactly the album artist string (as before 0.6.3)', () => {
  assert.deepEqual(
    albumArtworkArtists({ artist: 'Mira Vale', artists: [a('Mira Vale')] }),
    ['Mira Vale'],
  )
  assert.deepEqual(
    songArtworkArtists({
      artist: 'Mira Vale',
      albumArtists: [a('Mira Vale')],
      displayAlbumArtist: 'Mira Vale',
    }),
    ['Mira Vale'],
  )
})
t('no OpenSubsonic fields: the album artist / the song artist', () => {
  assert.deepEqual(albumArtworkArtists({ artist: 'Kanye West' }), [
    'Kanye West',
  ])
  assert.deepEqual(songArtworkArtists({ artist: 'Kanye West' }), ['Kanye West'])
})
t('local-library song (one album artist, display string)', () =>
  assert.deepEqual(
    songArtworkArtists({
      artist: 'Local Artist',
      albumArtists: [{ id: 'x', name: 'Local Artist' }],
      displayAlbumArtist: 'Local Artist',
    }),
    ['Local Artist'],
  ),
)
t('duplicates: trimmed and case-insensitive, first spelling kept', () =>
  assert.deepEqual(
    albumArtworkArtists({
      artist: ' kanye west ',
      artists: [a('Kanye West'), a('KANYE WEST '), a('Ye')],
    }),
    ['Kanye West', 'Ye'],
  ),
)
t('empty and missing names are skipped', () =>
  assert.deepEqual(
    songArtworkArtists({
      artist: '  ',
      albumArtists: [a(''), { id: 'y' }, a('  Ye  ')],
      displayAlbumArtist: '',
    }),
    ['Ye'],
  ),
)
t(`at most ${MAX_ARTWORK_ARTISTS} names`, () => {
  assert.equal(MAX_ARTWORK_ARTISTS, 3)
  assert.deepEqual(
    albumArtworkArtists({
      artist: 'A • B • C • D',
      artists: [a('A'), a('B'), a('C'), a('D')],
    }),
    ['A', 'B', 'C'],
  )
  assert.deepEqual(
    songArtworkArtists({
      artist: 'A • X',
      albumArtists: [a('A'), a('B')],
      displayAlbumArtist: 'A • B',
    }),
    ['A', 'B', 'A • B'],
  )
})
t('nothing to ask: empty list', () => {
  assert.deepEqual(albumArtworkArtists(undefined), [])
  assert.deepEqual(songArtworkArtists(null), [])
  assert.deepEqual(songArtworkArtists({}), [])
})

console.log(`${passed} passed, ${failed} failed`)
