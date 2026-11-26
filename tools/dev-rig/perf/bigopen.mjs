// P1 / B1: opening a big album or playlist.
// TARGET=playlist (10 000 songs) | album500 | playlist300 | multidisc
// Measures, per open (OPENS, default 3, the first after a fresh start):
//   ms until the table shows rows and the page has painted,
//   long tasks (total and longest), rows in the DOM,
//   renderer peak memory (working set, sampled every 250 ms from the main
//   process, which keeps running while the renderer is frozen) and JS heap.
// Usage (from tools/dev-rig): TARGET=playlist perf/xrun.sh node perf/bigopen.mjs
//                             PROFILE=cpu4 TARGET=album500 perf/xrun.sh node perf/bigopen.mjs
// Big library: make_big_library.py ("Big Playlist 10000", "Playlist 300",
// "Big Album", "Three Discs").
import {
  findAlbum,
  findPlaylist,
  go,
  heapMB,
  launch,
  median,
  PROFILE,
  processMetrics,
  sleep,
  writeResult,
} from './lib.mjs'

const TARGET = process.env.TARGET || 'playlist'
const OPENS = Number(process.env.OPENS || 3)
const TIMEOUT = Number(process.env.OPEN_TIMEOUT_MS || 240000)

const targets = {
  playlist: async () =>
    `/library/playlists/${(await findPlaylist('Big Playlist 10000')).id}`,
  playlist300: async () =>
    `/library/playlists/${(await findPlaylist('Playlist 300')).id}`,
  album500: async () =>
    `/library/albums/${process.env.ALBUM500 || (await findAlbum('Big Album')).id}`,
  multidisc: async () =>
    `/library/albums/${(await findAlbum('Three Discs')).id}`,
}
const hash = await targets[TARGET]()

const s = await launch()
const { app, win, cdp } = s
await go(win, '/', 3000)

async function rendererMB() {
  const m = await processMetrics(app)
  return Math.max(...m.filter((x) => x.type === 'Tab').map((x) => x.memMB))
}

// Where each open starts from. The cost of the every-row render grows with
// the size of the page underneath (React Router looks up <base> once per
// link), so this matters: FROM=home (default) | albums | genres.
const FROM = {
  home: '/',
  albums: '/library/albums',
  genres: '/library/genres',
}[process.env.FROM || 'home']

const results = []
for (let i = 0; i < OPENS; i++) {
  await go(win, FROM, 2500)
  const domBefore = await win.evaluate(
    () => document.getElementsByTagName('*').length,
  )
  await win.evaluate(() => {
    window.__maxRows = 0
    window.__mo?.disconnect()
    window.__mo = new MutationObserver(() => {
      const table = document.querySelector('[data-testid="data-table"]')
      if (table)
        window.__maxRows = Math.max(
          window.__maxRows,
          table.querySelectorAll('[role="row"]').length - 1,
        )
    })
    window.__mo.observe(document.body, { childList: true, subtree: true })
    window.__longTasks = []
    window.__lt?.disconnect()
    window.__lt = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__longTasks.push(e.duration)
    })
    window.__lt.observe({ type: 'longtask' })
  })
  let peak = await rendererMB()
  let sampling = true
  const sampler = (async () => {
    while (sampling) {
      peak = Math.max(peak, await rendererMB().catch(() => 0))
      await sleep(250)
    }
  })()
  const t0 = Date.now()
  await win.evaluate((h) => {
    window.location.hash = h
  }, hash)
  let rows = 0
  while (Date.now() - t0 < TIMEOUT) {
    rows = await win.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => {
            const table = document.querySelector('[data-testid="data-table"]')
            resolve(
              table ? table.querySelectorAll('[role="row"]').length - 1 : 0,
            )
          }),
        ),
    )
    if (rows > 0) break
    await sleep(50)
  }
  const visibleMs = Date.now() - t0
  await sleep(1500)
  sampling = false
  await sampler
  const lt = await win.evaluate(() => window.__longTasks)
  const maxRows = await win.evaluate(() => {
    window.__mo.disconnect()
    return window.__maxRows
  })
  const heap = await heapMB(cdp)
  const r = {
    open: i + 1,
    visibleMs,
    rowsInDom: rows,
    maxRowsRendered: maxRows,
    domNodesBefore: domBefore,
    longTasksMs: Math.round(lt.reduce((a, b) => a + b, 0)),
    longestMs: Math.round(Math.max(0, ...lt)),
    rendererPeakMB: peak,
    heapAfterMB: heap,
  }
  console.log(JSON.stringify(r))
  results.push(r)
}

const summary = {
  target: TARGET,
  profile: PROFILE,
  from: process.env.FROM || 'home',
  medianVisibleMs: median(results.map((r) => r.visibleMs)),
  firstVisibleMs: results[0].visibleMs,
  maxPeakMB: Math.max(...results.map((r) => r.rendererPeakMB)),
  medianLongestMs: median(results.map((r) => r.longestMs)),
  results,
}
console.log(JSON.stringify(summary))
writeResult(`bigopen-${TARGET}`, summary)
await s.close()
