// "Continue on other devices" at run time: src/service/handoff.ts against a
// fake Navidrome 0.64 that records requests (mirrors ClearPlay Android's
// HandoffTest.kt). Checks when quit, sleep and lock save, Continue's save-back
// and what a failed Continue leaves.
// Usage: node tools/dev-rig/handoff-unit.mjs   (Node 22.18+; jsdom, esbuild via Vite)
import assert from 'node:assert/strict'
import http from 'node:http'
import 'fake-indexeddb/auto'
import { JSDOM } from 'jsdom'
import { importApp } from './lib/bundle.mjs'

// ---------------------------------------------------------------- fake server
const calls = []
const server = { queue: null, nowPlaying: [] }
const fake = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://fake')
  const endpoint = url.pathname.split('/').pop().replace('.view', '')
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    calls.push({ endpoint, method: req.method, form: new URLSearchParams(body) })
    const extra = {
      getOpenSubsonicExtensions: { openSubsonicExtensions: [{ name: 'indexBasedQueue', versions: [1] }, { name: 'playbackReport', versions: [1] }] },
      getPlayQueueByIndex: server.queue ? { playQueueByIndex: server.queue } : {},
      getNowPlaying: { nowPlaying: { entry: server.nowPlaying } },
    }[endpoint] ?? {}
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok', version: '1.16.1', type: 'navidrome', serverVersion: '0.64.2', openSubsonic: true, ...extra } }))
  })
})
await new Promise((r) => fake.listen(0, '127.0.0.1', r))
const URL_ = `http://127.0.0.1:${fake.address().port}`
const saves = () => calls.filter((c) => c.endpoint.startsWith('savePlayQueue'))

// ---------------------------------------------------------------- app
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
for (const k of ['window', 'document', 'navigator', 'localStorage', 'sessionStorage'])
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true })
dom.window.fetch = (...a) => fetch(...a)

const app = await importApp(`
export * as handoff from '@/service/handoff'
export { queueSync } from '@/service/queue-sync'
export { usePlayerStore } from '@/store/player.store'
export { useAppStore } from '@/store/app.store'
export { useRimelightSettings } from '@/store/rimelight-settings.store'
export { useHandoffStore } from '@/store/handoff.store'
`)
const { handoff, queueSync, usePlayerStore, useAppStore, useRimelightSettings, useHandoffStore } = app

useAppStore.setState((s) => {
  s.data.url = URL_
  s.data.username = 'toni'
  s.data.password = 'token'
  s.data.authType = 1
  s.data.isServerConfigured = true
  s.data.serverType = 'navidrome'
  s.data.extensionsSupported = { indexBasedQueue: [1], playbackReport: [1] }
})
useRimelightSettings.getState().set({ syncQueue: true })

const songs = Array.from({ length: 12 }, (_, i) => ({ id: `s${i + 1}`, title: `Song ${i + 1}`, artist: 'A', album: 'B', duration: 200, coverArt: '' }))
const realStart = queueSync.startQueueAt

/** A fresh state for each case: queue s1..s12 at song 4, nothing pending. */
async function reset({ playing = false } = {}) {
  handoff.pauseHere() // cancels a waiting save, clears "dirty"
  handoff.takePauseHere()
  useHandoffStore.setState({ offer: null, leftBehind: null, leftBehindShown: false })
  usePlayerStore.setState((s) => {
    s.songlist.currentList = songs
    s.songlist.originalList = songs
    s.songlist.currentSongIndex = 3
    s.songlist.currentSong = songs[3]
    s.playerState.mediaType = 'song'
    s.playerState.isPlaying = playing
  })
  server.queue = null
  server.nowPlaying = []
  queueSync.startQueueAt = realStart
  await new Promise((r) => setTimeout(r, 20))
  calls.length = 0
}

let passed = 0
let failed = 0
async function t(name, fn) {
  try {
    await fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}: ${String(e.message).split('\n').slice(0, 4).join(' ')}`)
    process.exitCode = 1
  }
}

const androidSaved = {
  entry: songs.slice(0, 6),
  currentIndex: 2,
  position: 61_000,
  changed: new Date(Date.now() - 120_000).toISOString(),
  changedBy: 'ClearPlay-Android',
}

for (const reason of ['quit', 'sleep', 'lock']) {
  await t(`untouched, paused: ${reason} sends nothing`, async () => {
    await reset()
    assert.equal(await handoff.saveNow(reason), false)
    assert.equal(saves().length, 0)
  })
}

await t('played (then paused): lock saves once', async () => {
  await reset()
  handoff.played()
  usePlayerStore.setState((s) => {
    s.playerState.isPlaying = false
  })
  assert.equal(await handoff.saveNow('lock'), true)
  assert.equal(saves().length, 1)
  assert.equal(saves()[0].endpoint, 'savePlayQueueByIndex')
  assert.equal(saves()[0].form.get('currentIndex'), '3')
})

await t('a song change here, paused: quit saves once', async () => {
  await reset()
  handoff.publishEvent('songChange')
  assert.equal(await handoff.saveNow('quit'), true)
  assert.equal(saves().length, 1)
})

await t('after a save, paused: a second quit sends nothing', async () => {
  await reset()
  handoff.played()
  usePlayerStore.setState((s) => {
    s.playerState.isPlaying = false
  })
  await handoff.saveNow('lock')
  calls.length = 0
  assert.equal(await handoff.saveNow('quit'), false)
  assert.equal(saves().length, 0)
})

await t('playing here, nobody took over: lock saves once', async () => {
  await reset({ playing: true })
  assert.equal(await handoff.saveNow('lock'), true)
  assert.equal(saves().length, 1)
  assert.ok(calls.some((c) => c.endpoint === 'getNowPlaying'), 'asked Now Playing first')
})

await t('left behind -> Pause here -> lock sends nothing', async () => {
  await reset({ playing: true })
  handoff.publishEvent('songChange')
  useHandoffStore.setState({ leftBehind: { device: 'ClearPlay Android', song: null }, leftBehindShown: true })
  handoff.pauseHere()
  assert.equal(await handoff.saveNow('lock'), false)
  assert.equal(saves().length, 0)
})

await t('playing, phone took over, no check run yet: lock sends nothing', async () => {
  await reset({ playing: true })
  server.nowPlaying = [{ id: 's5', username: 'toni', playerName: 'ClearPlay-Android', state: 'playing', positionMs: 5000, minutesAgo: 0 }]
  server.queue = { ...androidSaved }
  assert.equal(await handoff.saveNow('lock'), false)
  assert.equal(saves().length, 0)
  assert.ok(useHandoffStore.getState().leftBehind, '"Continued on" shows')
})

await t('playing, the check gets no answer in time: nothing is saved', async () => {
  await reset({ playing: true })
  const slow = http.createServer(() => {}) // never answers
  await new Promise((r) => slow.listen(0, '127.0.0.1', r))
  const real = useAppStore.getState().data.url
  useAppStore.setState((s) => {
    s.data.url = `http://127.0.0.1:${slow.address().port}`
  })
  const t0 = Date.now()
  const r = await handoff.saveNow('quit')
  const ms = Date.now() - t0
  useAppStore.setState((s) => {
    s.data.url = real
  })
  slow.closeAllConnections?.()
  slow.close()
  assert.equal(r, false)
  assert.ok(ms < 1500, `took ${ms} ms (quit budget 1.5 s)`)
})

await t('Continue: saves back once, even before the player reports playing', async () => {
  await reset()
  server.queue = { ...androidSaved }
  await handoff.look()
  assert.ok(useHandoffStore.getState().offer, 'offer shows')
  queueSync.startQueueAt = async (entries, index) => {
    usePlayerStore.setState((s) => {
      s.songlist.currentList = entries
      s.songlist.currentSongIndex = index
      s.songlist.currentSong = entries[index]
      s.playerState.isPlaying = false // not reported yet
    })
    return true
  }
  calls.length = 0
  assert.equal(await handoff.continueOffer(), true)
  assert.equal(saves().length, 1)
  assert.equal(saves()[0].form.get('currentIndex'), '2')
  assert.equal(useHandoffStore.getState().offer, null)
})

await t('Continue with startQueueAt failing: the offer is still there', async () => {
  await reset()
  server.queue = { ...androidSaved, changed: new Date().toISOString() }
  await handoff.look()
  assert.ok(useHandoffStore.getState().offer, 'offer shows')
  queueSync.startQueueAt = async () => false
  calls.length = 0
  assert.equal(await handoff.continueOffer(), false)
  assert.ok(useHandoffStore.getState().offer, 'offer kept')
  assert.equal(saves().length, 0)
  // And it can be pressed again.
  queueSync.startQueueAt = async () => true
  assert.equal(await handoff.continueOffer(), true)
  assert.equal(useHandoffStore.getState().offer, null)
})

await t('Continue that throws: the offer is still there', async () => {
  await reset()
  server.queue = { ...androidSaved, changed: new Date(Date.now() + 1000).toISOString() }
  await handoff.look()
  queueSync.startQueueAt = async () => {
    throw new Error('network')
  }
  assert.equal(await handoff.continueOffer(), false)
  assert.ok(useHandoffStore.getState().offer, 'offer kept')
})

console.log(`\n${passed} passed, ${failed} failed`)
fake.close()
process.exit(failed ? 1 : 0)
