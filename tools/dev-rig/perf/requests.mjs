// Requests per action, counted at the server side by the fault proxy (so the
// covers Chromium fetches for the OS media controls are counted too).
// SCENARIO=stats | albums | media | all (default all)
//   stats  (P3 / B4): Stats cold, leave after 1 s -> search3 requests after
//          leaving (10 s); Stats cold left open -> renderer heap peak; one
//          search3 page dropped mid-load -> what the page shows, and whether
//          a later visit shows those numbers again (cached)
//   albums (P4): scroll Albums down 5 pages, open an album, go Back ->
//          getAlbumList2 requests on return
//   media  (P5): play 10 six-second songs with the window hidden for 60 s ->
//          getCoverArt size=192 per song; then play/pause 10 times -> covers
// Usage (from tools/dev-rig): perf/xrun.sh node perf/requests.mjs
import {
  findAlbum,
  go,
  heapMB,
  launch,
  login,
  sleep,
  startProxy,
  writeResult,
} from './lib.mjs'

const SCENARIO = process.env.SCENARIO || 'all'
const proxy = await startProxy()
const out = {}
const on = (name) => SCENARIO === 'all' || SCENARIO === name

/** A fresh profile signed in to the proxy. */
async function start() {
  const s = await launch({ fresh: true, login: false })
  await login(s.win, proxy.url)
  return s
}

if (on('stats')) {
  // Left after 1 s
  let s = await start()
  await go(s.win, '/', 1500)
  await proxy.resetLog()
  await go(s.win, '/stats', 1000)
  const before = (await proxy.log()).requests.search3 ?? 0
  await go(s.win, '/', 0)
  await sleep(10000)
  const after = (await proxy.log()).requests.search3 ?? 0
  out.statsLeftEarly = {
    search3BeforeLeaving: before,
    search3AfterLeaving: after - before,
  }
  console.log('stats left early', JSON.stringify(out.statsLeftEarly))
  await s.close()

  // Heap peak during a full load
  s = await start()
  await go(s.win, '/', 1500)
  const base = await heapMB(s.cdp)
  let peak = base
  let done = false
  await proxy.resetLog()
  const t0 = Date.now()
  await go(s.win, '/stats', 0)
  while (!done && Date.now() - t0 < 120000) {
    peak = Math.max(peak, await heapMB(s.cdp, false))
    const log = await proxy.log()
    const pending = await s.win.evaluate(
      () =>
        /Library explored|songs/i.test(document.body.innerText) &&
        !document.querySelector('.animate-pulse'),
    )
    done =
      pending &&
      Date.now() - t0 > 2000 &&
      (log.recent.at(-1)?.t ?? 0) < Date.now() - 1500
    await sleep(200)
  }
  const loadMs = Date.now() - t0
  out.statsHeap = {
    baseMB: base,
    peakMB: peak,
    afterGcMB: await heapMB(s.cdp),
    loadMs,
    search3: (await proxy.log()).requests.search3,
  }
  console.log('stats heap', JSON.stringify(out.statsHeap))
  await s.close()

  // A dropped page
  s = await start()
  await go(s.win, '/', 1500)
  await proxy.setRules(['search3:drop:after=6'])
  await go(s.win, '/stats', 12000)
  const shown = await s.win.evaluate(
    () =>
      document
        .querySelector('main, #main-scroll-area')
        ?.innerText.slice(0, 600) ?? document.body.innerText.slice(0, 600),
  )
  await proxy.clear()
  await go(s.win, '/', 1500)
  await go(s.win, '/stats', 4000)
  const again = await s.win.evaluate(
    () =>
      document
        .querySelector('main, #main-scroll-area')
        ?.innerText.slice(0, 600) ?? '',
  )
  out.statsDroppedPage = {
    shown: shown.replace(/\s+/g, ' '),
    afterRecoveryRevisit: again.replace(/\s+/g, ' '),
  }
  console.log('stats dropped page', JSON.stringify(out.statsDroppedPage))
  await s.close()
}

if (on('albums')) {
  const s = await start()
  await go(s.win, '/library/albums', 3000)
  const pages = async () =>
    (await proxy.log()).recent.filter((r) => r.endpoint === 'getAlbumList2')
      .length
  const first = await pages()
  // Scroll until 5 more pages of 128 albums have loaded.
  for (let k = 0; k < 400 && (await pages()) < first + 5; k++) {
    await s.win.mouse.move(900, 500)
    await s.win.mouse.wheel(0, 600)
    await sleep(150)
  }
  await sleep(1500)
  const pagesLoaded = (await proxy.log()).recent.filter(
    (r) => r.endpoint === 'getAlbumList2',
  ).length
  const album = await findAlbum('Fault Test')
  await go(s.win, `/library/albums/${album.id}`, 2500)
  await proxy.resetLog()
  await s.win.goBack()
  await sleep(5000)
  const log = await proxy.log()
  out.albumsReturn = {
    pagesLoadedBefore: pagesLoaded,
    getAlbumList2OnReturn: log.requests.getAlbumList2 ?? 0,
    coversOnReturn: log.requests.getCoverArt ?? 0,
  }
  console.log('albums return', JSON.stringify(out.albumsReturn))
  await s.close()
}

if (on('media')) {
  const s = await start()
  const a = await findAlbum('Neon Neon 00000')
  const album = a ?? (await findAlbum('Fault Test'))
  await go(s.win, `/library/albums/${album.id}`, 2500)
  await proxy.resetLog()
  await s.win
    .getByRole('button', { name: /^(Play all|Pause)$/ })
    .first()
    .click()
  await sleep(1000)
  await s.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.hide()),
  )
  await sleep(60000)
  await s.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w) => w.show()),
  )
  let log = await proxy.log()
  const covers192 = log.recent.filter(
    (r) => r.endpoint === 'getCoverArt' && r.size === '192',
  )
  const songs = log.recent.filter((r) => r.endpoint === 'stream').length
  const byId = {}
  for (const c of covers192) byId[c.id] = (byId[c.id] ?? 0) + 1
  // Play/pause 10 times on one song.
  await s.win.evaluate(() =>
    window.__cp.player.getState().actions.setPlayingState(false),
  )
  await sleep(1000)
  await proxy.resetLog()
  for (let i = 0; i < 10; i++) {
    await s.win.evaluate(() =>
      window.__cp.player.getState().actions.togglePlayPause(),
    )
    await sleep(700)
  }
  await sleep(1500)
  log = await proxy.log()
  out.mediaSession = {
    streamsIn60s: songs,
    cover192In60s: covers192.length,
    cover192PerCoverId: byId,
    coverRequestsOnPlayPause: log.recent.filter(
      (r) => r.endpoint === 'getCoverArt',
    ).length,
    cover192OnPlayPause: log.recent.filter(
      (r) => r.endpoint === 'getCoverArt' && r.size === '192',
    ).length,
  }
  console.log('media session', JSON.stringify(out.mediaSession))
  await s.close()
}

writeResult(`requests-${SCENARIO}`, out)
proxy.stop()
