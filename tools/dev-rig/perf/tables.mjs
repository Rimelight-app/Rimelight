// Section 2 checks on the big tables (run on the old and the new build and
// compare): the 10 000-song playlist scrolls to its last song; Back / Forward
// scroll position; search inside the playlist; the multi-disc album's disc
// headers and row heights; row context menu; Ctrl+A / Esc selection and
// shift-click range selection.
// Usage (from tools/dev-rig): perf/xrun.sh node perf/tables.mjs
import {
  findAlbum,
  findPlaylist,
  go,
  launch,
  sleep,
  writeResult,
} from './lib.mjs'

const s = await launch()
const { win } = s
const out = {}
const viewport = '#main-scroll-area [data-radix-scroll-area-viewport]'
const scrollTop = () =>
  win.evaluate((sel) => document.querySelector(sel)?.scrollTop ?? -1, viewport)
const rowsText = () =>
  win.evaluate(() =>
    [...document.querySelectorAll('[data-testid="data-table"] [role="row"]')]
      .slice(1)
      .map((r) => r.innerText.split('\n')[0]),
  )

// ---- 10 000-song playlist: scroll to the end
const big = await findPlaylist('Big Playlist 10000')
await go(win, `/library/playlists/${big.id}`, 4000)
for (let i = 0; i < 60; i++) {
  await win.evaluate((sel) => {
    const v = document.querySelector(sel)
    v.scrollTop = v.scrollHeight
  }, viewport)
  await sleep(100)
}
await sleep(1000)
const lastRows = await rowsText()
out.scrolledToEnd = {
  lastIndexShown: lastRows.at(-1),
  rowsInDom: lastRows.length,
}

// ---- Back / Forward
await win.evaluate((sel) => {
  document.querySelector(sel).scrollTop = 60000
}, viewport)
await sleep(800)
const before = await scrollTop()
const album = await findAlbum('Three Discs')
await go(win, `/library/albums/${album.id}`, 2500)
await win.goBack()
await sleep(3000)
const afterBack = await scrollTop()
const rowsAfterBack = (await rowsText()).slice(0, 2)
await win.goForward()
await sleep(2500)
await win.goBack()
await sleep(3000)
out.backForward = {
  scrollTopBefore: before,
  afterBack,
  rowsAfterBack,
  afterBackForwardBack: await scrollTop(),
}

// ---- search inside the playlist
await win.evaluate((sel) => {
  document.querySelector(sel).scrollTop = 0
}, viewport)
await sleep(500)
// The playlist's own search button (tooltip "Search in playlist").
const searchBtn = win
  .locator('#main-scroll-area button:has(svg.lucide-search)')
  .first()
if (await searchBtn.count()) await searchBtn.click().catch(() => {})
await sleep(600)
const input = win.locator('[data-testid="table-search"] input').first()
if (await input.count()) {
  await input.fill('Ember')
  await sleep(1500)
  const rows = await win.evaluate(() =>
    [...document.querySelectorAll('[data-testid="data-table"] [role="row"]')]
      .slice(1)
      .map((r) => r.innerText.replace(/\s+/g, ' ')),
  )
  out.search = {
    query: 'Ember',
    rowsInDom: rows.length,
    rowsWithoutQuery: rows.filter((t) => !/ember/i.test(t)).length,
    first: rows[0]?.slice(0, 80),
  }
  await input.fill('')
  await sleep(800)
} else out.search = 'no search field found'

// ---- multi-disc album: headers and row heights
await go(win, `/library/albums/${album.id}`, 3000)
out.multiDisc = await win.evaluate(() => {
  const table = document.querySelector('[data-testid="data-table"]')
  const headers = [...table.querySelectorAll('*')].filter(
    (e) => /^Disc \d+$/.test(e.innerText?.trim()) && e.children.length <= 2,
  )
  const rows = [...table.querySelectorAll('[role="row"]')].slice(1)
  const boxes = rows.map((r) => r.getBoundingClientRect())
  let overlaps = 0
  for (let i = 1; i < boxes.length; i++)
    if (boxes[i].top < boxes[i - 1].bottom - 0.5) overlaps++
  const hb = headers.map((h) => h.getBoundingClientRect())
  let headerOverlaps = 0
  for (const h of hb)
    for (const b of boxes)
      if (h.bottom > b.top + 0.5 && h.top < b.bottom - 0.5) headerOverlaps++
  return {
    discHeaders: headers.map((h) => h.innerText.trim()),
    rows: rows.length,
    rowOverlaps: overlaps,
    headerOverlapsRow: headerOverlaps,
    rowHeights: [...new Set(boxes.map((b) => Math.round(b.height)))],
  }
})

// ---- context menu on a row
await go(
  win,
  `/library/playlists/${(await findPlaylist('Playlist 300')).id}`,
  3000,
)
const row = win.locator('[data-testid="data-table"] [role="row"]').nth(3)
await row.click({ button: 'right' })
await sleep(700)
out.contextMenu = await win.evaluate(() => {
  const m = document.querySelector('[role="menu"]')
  return m ? m.innerText.split('\n').slice(0, 6) : null
})
await win.keyboard.press('Escape')
await sleep(400)

// ---- selection: click, shift-click, Ctrl+A, Esc
const selected = () =>
  win.evaluate(
    () =>
      document.querySelectorAll(
        '[data-testid="data-table"] [role="row"][data-state="selected"]',
      ).length,
  )
await win.locator('[data-testid="data-table"] [role="row"]').nth(2).click()
await win
  .locator('[data-testid="data-table"] [role="row"]')
  .nth(6)
  .click({ modifiers: ['Shift'] })
await sleep(300)
const afterShift = await selected()
await win.keyboard.press('Control+a')
await sleep(500)
const afterCtrlA = await selected()
await win.keyboard.press('Escape')
await sleep(500)
out.selection = {
  afterShiftClick: afterShift,
  afterCtrlA: afterCtrlA,
  afterEsc: await selected(),
}

// Drag to reorder lives in the fullscreen queue (its own list, not
// DataTable); it isn't checked here.
out.pageErrors = s.errors

console.log(JSON.stringify(out, null, 2))
writeResult('tables', out)
await s.close()
