// Breakage checks (B8, B9, B10, B11) through the fault proxy. Prints
// PASS/FAIL against Rimelight 0.6.1's behaviour, with what happened.
// CASES=comma list (default all): song404, three404, serverDown, corruptLocal,
//   pageErrors, offlineStart, lastSong
// Usage (from tools/dev-rig): ENGINE=html perf/xrun.sh node perf/break.mjs
//                             ENGINE=mpv  perf/xrun.sh node perf/break.mjs
import crypto from 'node:crypto'
import path from 'node:path'
import {
  api,
  findAlbum,
  go,
  launch,
  login,
  RIG,
  sleep,
  startProxy,
  writeResult,
} from './lib.mjs'

const CASES = (
  process.env.CASES ||
  'song404,three404,serverDown,corruptLocal,pageErrors,offlineStart,lastSong'
).split(',')
const proxy = await startProxy(Number(process.env.FAULT_PORT || 4536))
const results = []
let failed = 0
const check = (name, ok, detail) => {
  if (!ok) failed++
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`)
}

const album = await findAlbum('Fault Test')
const songs = (await api('getAlbum', { id: album.id })).album.song

async function start(opts = {}) {
  const s = await launch({ fresh: true, login: false, ...opts })
  await login(s.win, proxy.url)
  return s
}
const state = (win) =>
  win.evaluate(() => {
    const p = window.__cp.player.getState()
    const pills = [
      ...document.querySelectorAll(
        '[data-testid$="-pill"], [data-testid="queue-pill"]',
      ),
    ].map((e) => e.innerText.replace(/\s+/g, ' ').trim())
    return {
      index: p.songlist.currentSongIndex,
      queue: p.songlist.currentList.length,
      playing: p.playerState.isPlaying,
      error: p.playerState.playbackError ?? null,
      progress: Math.round(p.playerProgress.progress * 10) / 10,
      pills,
    }
  })
/** Samples the player every 250 ms for `ms`; returns the samples. */
async function watch(win, ms) {
  const out = []
  const end = Date.now() + ms
  while (Date.now() < end) {
    out.push(await state(win))
    await sleep(250)
  }
  return out
}
const streamsFor = async (id) =>
  (await proxy.log()).recent.filter(
    (r) => r.endpoint === 'stream' && r.id === id,
  ).length
async function playAlbum(s, startIndex = 0) {
  await go(s.win, `/library/albums/${album.id}`, 2500)
  await s.win
    .getByRole('button', { name: /^(Play all|Pause)$/ })
    .first()
    .click()
  await sleep(2500)
  for (let i = 0; i < startIndex; i++) {
    await s.win.evaluate(() =>
      window.__cp.player.getState().actions.playNextSong(),
    )
    await sleep(300)
  }
}
const pillsSeen = (samples) => [...new Set(samples.flatMap((x) => x.pills))]

// ---------------------------------------------------------------- song404
if (CASES.includes('song404')) {
  await proxy.setRules([`stream:id=${songs[2].id}:404`])
  await proxy.resetLog()
  const s = await start()
  await playAlbum(s, 1)
  // Every playbackError value, not just the 250 ms samples.
  await s.win.evaluate(() => {
    window.__errs = []
    window.__cp.player.subscribe((st) => {
      const e = st.playerState.playbackError
      if (e && window.__errs.at(-1) !== e.songId) window.__errs.push(e.songId)
    })
  })
  await s.win.evaluate(() =>
    window.__cp.player.getState().actions.playNextSong(),
  ) // -> song 3 (404)
  const samples = await watch(s.win, 12000)
  const last = samples.at(-1)
  const sawError = (await s.win.evaluate(() => window.__errs)).includes(
    songs[2].id,
  )
  check(
    '404 on song 3: retried once (HTML audio may ask twice per load)',
    (await streamsFor(songs[2].id)) <= 4,
    { streamRequestsForSong3: await streamsFor(songs[2].id) },
  )
  check(
    '404 on song 3: moves on to song 4 and plays',
    last.index === 3 && last.playing && last.progress > 0,
    last,
  )
  check(
    '404 on song 3: "Couldn\'t play" pill',
    pillsSeen(samples).some(
      (p) => /Couldn.t play/.test(p) && p.includes(songs[2].title),
    ),
    pillsSeen(samples),
  )
  check(
    '404 on song 3: playbackError set, then cleared when song 4 plays',
    sawError && last.error === null,
    { sawError, end: last.error },
  )
  await s.close()
}

// ---------------------------------------------------------------- three404
if (CASES.includes('three404')) {
  await proxy.setRules([1, 2, 3].map((i) => `stream:id=${songs[i].id}:404`))
  const s = await start()
  await playAlbum(s, 0)
  await s.win.evaluate(() =>
    window.__cp.player.getState().actions.playNextSong(),
  ) // -> song 2
  const samples = await watch(s.win, 20000)
  const last = samples.at(-1)
  check('three 404s in a row: stops', !last.playing && last.index === 3, last)
  check(
    'three 404s in a row: pill',
    pillsSeen(samples).some((p) => /3 songs in a row/.test(p)),
    pillsSeen(samples),
  )
  await s.close()
}

// ---------------------------------------------------------------- serverDown
if (CASES.includes('serverDown')) {
  await proxy.clear()
  const s = await start()
  await playAlbum(s, 0)
  await proxy.setRules(['*:down'])
  await s.win.evaluate(() =>
    window.__cp.player.getState().actions.playNextSong(),
  ) // -> song 2, unreachable
  const samples = await watch(s.win, 12000)
  const last = samples.at(-1)
  const reloaded = await s.win.evaluate(
    () => performance.getEntriesByType('navigation')[0]?.type,
  )
  check(
    'server down: stays on song 2, paused (no skipping)',
    last.index === 1 &&
      !last.playing &&
      Math.max(...samples.map((x) => x.index)) === 1,
    last,
  )
  check(
    'server down: "Can\'t reach" pill',
    pillsSeen(samples).some((p) => /Can.t reach/.test(p)),
    pillsSeen(samples),
  )
  check('server down: the window did not reload', reloaded !== 'reload', {
    navigationType: reloaded,
  })
  await proxy.clear()
  await s.close()
}

// ---------------------------------------------------------------- corruptLocal
if (CASES.includes('corruptLocal')) {
  await proxy.clear()
  const s = await launch({ fresh: true, login: false })
  const { win } = s
  await win.evaluate(
    (p) => window.api.localLibrary.addPath(p),
    path.join(RIG, 'local'),
  )
  for (let i = 0; i < 60; i++) {
    const st = await win.evaluate(() => window.api.localLibrary.state())
    if (!st.scanning && st.tracks) break
    await sleep(500)
  }
  await win.locator('[data-testid=login-local]').click()
  await sleep(4000)
  // Queue: one corrupt file, then real songs (the local server speaks Subsonic).
  const c = await win.evaluate(() => window.api.localLibrary.connect())
  const local = async (endpoint, params = {}) => {
    const salt = crypto.randomBytes(6).toString('hex')
    const t = crypto
      .createHash('md5')
      .update(c.password + salt)
      .digest('hex')
    const q = new URLSearchParams({
      u: c.username,
      t,
      s: salt,
      v: '1.16.1',
      c: 'perf',
      f: 'json',
      ...params,
    })
    return (await (await fetch(`${c.url}/rest/${endpoint}?${q}`)).json())[
      'subsonic-response'
    ]
  }
  const all = (
    await local('search3', {
      query: '',
      songCount: 100,
      albumCount: 0,
      artistCount: 0,
    })
  ).searchResult3.song
  const corrupt = all.find((x) => /Empty/.test(x.title ?? x.path ?? ''))
  const real = all
    .filter((x) => /^Local Song/.test(x.title))
    .sort((a, b) => a.track - b.track)
    .slice(0, 4)
  const titles = [corrupt, ...real].map((x) => x?.title)
  await win.evaluate(
    (list) => window.__cp.player.getState().actions.setSongList(list, 0),
    [corrupt, ...real],
  )
  const samples = await watch(win, 14000)
  const last = samples.at(-1)
  check(
    'corrupt local file first: skips to song 2 and plays',
    last.playing && last.progress > 0 && last.index === 1,
    { queue: titles, last, indexes: [...new Set(samples.map((x) => x.index))] },
  )
  await s.close()
}

// ---------------------------------------------------------------- pageErrors
if (CASES.includes('pageErrors')) {
  const s = await start()
  const pageText = () =>
    s.win.evaluate(
      () =>
        document
          .querySelector('#main-scroll-area')
          ?.innerText.replace(/\s+/g, ' ')
          .slice(0, 200) ?? '',
    )
  // A different album each time: a cached album would just show.
  const others = (
    await api('getAlbumList2', {
      type: 'alphabeticalByName',
      size: 10,
      offset: 100,
    })
  ).albumList2.album
  for (const [i, [rule, expect]] of [
    ['getAlbum:500', /Couldn.t load this page/],
    ['getAlbum:badjson', /Couldn.t load this page/],
    ['getAlbum:error40', /rejected your login/],
    ['getAlbum:error70', /404|Not Found/i],
  ].entries()) {
    const target = others[i]
    await proxy.setRules([rule])
    await go(s.win, '/', 1500)
    await go(s.win, `/library/albums/${target.id}`, 4000)
    const text = await pageText()
    check(`${rule}: right page`, expect.test(text), text)
    if (/Couldn.t load/.test(text)) {
      await proxy.clear()
      await s.win
        .getByRole('button', { name: /Retry/i })
        .first()
        .click()
        .catch(() => {})
      await sleep(3000)
      const after = await pageText()
      check(
        `${rule}: Retry shows the album`,
        after.includes(target.name) && !/Couldn.t load/.test(after),
        after,
      )
    }
    if (/rejected/.test(text)) {
      const btn = await s.win
        .getByRole('button', { name: /Log in again/i })
        .count()
      check(`${rule}: "Log in again" button`, btn > 0, { buttons: btn })
    }
  }
  await proxy.clear()
  await s.close()
}

// ---------------------------------------------------------------- offlineStart
if (CASES.includes('offlineStart')) {
  await proxy.clear()
  // A profile that has logged in once.
  let s = await start()
  const userData = s.userData
  await go(s.win, '/', 1500)
  await s.close()
  await proxy.setRules(['*:down'])
  s = await launch({ userData, fresh: false, login: false })
  await sleep(4000)
  const hash = await s.win.evaluate(() => location.hash)
  const pills = await s.win.evaluate(() =>
    [...document.querySelectorAll('[data-testid$="-pill"]')].map(
      (e) => e.innerText,
    ),
  )
  check(
    'server off at start: no login screen',
    !hash.includes('server-config'),
    { hash },
  )
  check(
    'server off at start: "Can\'t reach … Retrying" pill',
    pills.some((p) => /Can.t reach/.test(p)),
    pills,
  )
  await proxy.clear()
  const t0 = Date.now()
  let gone = false
  while (Date.now() - t0 < 25000) {
    const p = await s.win.evaluate(
      () =>
        [...document.querySelectorAll('[data-testid="offline-pill"]')].length,
    )
    if (p === 0) {
      gone = true
      break
    }
    await sleep(500)
  }
  const hash2 = await s.win.evaluate(() => location.hash)
  check(
    'server back: pill goes, no re-login',
    gone && !hash2.includes('server-config'),
    { secondsToRecover: Math.round((Date.now() - t0) / 1000), hash: hash2 },
  )
  await s.close()
}

// ---------------------------------------------------------------- lastSong
if (CASES.includes('lastSong')) {
  await proxy.clear()
  const s = await start()
  await playAlbum(s, 4)
  // HTML audio: jump to the last seconds. mpv: the 20-second song plays out.
  await s.win.evaluate(() => {
    const a = document.querySelector('audio[data-testid="player-song-audio"]')
    if (a && Number.isFinite(a.duration)) a.currentTime = a.duration - 1.5
  })
  const samples = await watch(
    s.win,
    process.env.ENGINE === 'mpv' ? 22000 : 6000,
  )
  const last = samples.at(-1)
  check(
    'last song ends: queue kept, paused on the last song at 0',
    last.queue === 5 &&
      last.index === 4 &&
      !last.playing &&
      last.progress === 0,
    last,
  )
  await s.close()
}

writeResult('break', { results, failed })
proxy.stop()
process.exit(failed ? 1 : 0)
