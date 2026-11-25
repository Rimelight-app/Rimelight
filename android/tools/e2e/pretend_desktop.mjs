// The desktop's side of "Continue on other devices", for the Android end-to-end tests.
// Talks to Navidrome as c=ClearPlay (form-POST savePlayQueueByIndex, reportPlayback,
// getPlayQueueByIndex, getNowPlaying) and decides with the desktop's own rules:
// src/service/queue-handoff.ts from tag v0.6.0 (RULES=<path to that file>, Node 22.18+).
//
// Usage: node pretend_desktop.mjs <command> [json-args]
//   save {"ids":[...],"index":2,"position":61000}          savePlayQueueByIndex as the desktop
//   report {"id":"…","state":"paused","positionMs":5000}   reportPlayback as the desktop
//   queue                                                   the server's queue (raw)
//   nowPlaying                                              getNowPlaying entries (raw)
//   offer {"handledChanged":null,"playingHere":false}       rules.offer() as the desktop sees it
//   leftBehind {"queueIds":[...]}                           rules.leftBehind() for a desktop playing queueIds
// Prints one JSON line.
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'

const BASE = process.env.ND || 'http://127.0.0.1:4544'
const USER = process.env.ND_USER || 'admin'
const PASS = process.env.ND_PASS || 'test1234'
const rules = await import(pathToFileURL(process.env.RULES).href)
const APP = rules.DESKTOP_APP

function auth(client = APP) {
  const salt = crypto.randomBytes(6).toString('hex')
  const token = crypto.createHash('md5').update(`${PASS}${salt}`).digest('hex')
  return { u: USER, t: token, s: salt, v: '1.16.1', c: client, f: 'json' }
}
async function get(endpoint, params = {}, client = APP) {
  const q = new URLSearchParams({ ...auth(client), ...params })
  const res = await fetch(`${BASE}/rest/${endpoint}?${q}`)
  return (await res.json())['subsonic-response']
}
async function post(endpoint, pairs, client = APP) {
  const body = new URLSearchParams([...Object.entries(auth(client)), ...pairs])
  const res = await fetch(`${BASE}/rest/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  return (await res.json())['subsonic-response']
}
async function savedQueue() {
  const q = (await get('getPlayQueueByIndex')).playQueueByIndex
  if (!q) return null
  return {
    entries: (q.entry ?? []).map((e) => ({ id: e.id, title: e.title })),
    currentIndex: q.currentIndex ?? 0,
    positionMs: q.position ?? 0,
    changed: q.changed ?? '',
    changedBy: q.changedBy ?? '',
  }
}
async function nowPlaying() {
  const list = (await get('getNowPlaying')).nowPlaying?.entry ?? []
  return list.map((e) => ({
    username: e.username,
    playerName: e.playerName ?? '',
    state: e.state ?? '',
    positionMs: e.positionMs ?? 0,
    id: e.id,
    title: e.title,
  }))
}

const [cmd, raw] = process.argv.slice(2)
const a = raw ? JSON.parse(raw) : {}
let out
switch (cmd) {
  case 'save':
    out = await post('savePlayQueueByIndex', [
      ...a.ids.map((id) => ['id', id]),
      ['currentIndex', String(a.index)],
      ['position', String(a.position ?? 0)],
    ])
    break
  case 'report':
    out = await get('reportPlayback', {
      mediaId: a.id,
      mediaType: 'song',
      positionMs: String(a.positionMs ?? 0),
      state: a.state,
      ignoreScrobble: 'true',
    })
    break
  case 'queue':
    out = await savedQueue()
    break
  case 'nowPlaying':
    out = await nowPlaying()
    break
  case 'offer': {
    const [queue, np] = await Promise.all([savedQueue(), nowPlaying()])
    out = rules.offer({
      thisApp: APP,
      username: USER,
      queue,
      handledChanged: a.handledChanged ?? null,
      playingHere: a.playingHere ?? false,
      nowPlaying: np,
    })
    break
  }
  case 'leftBehind': {
    const np = await nowPlaying()
    const input = {
      publishing: true,
      playingHere: true,
      thisApp: APP,
      username: USER,
      nowPlaying: np,
      queueIds: a.queueIds,
      alreadyShown: false,
    }
    const candidate = rules.leftBehindCandidate(input)
    const queue = candidate ? await savedQueue() : null
    out = { candidate, leftBehind: rules.leftBehind({ ...input, serverChangedBy: queue?.changedBy ?? null }) }
    break
  }
  default:
    throw new Error(`unknown command ${cmd}`)
}
console.log(JSON.stringify(out ?? null))
