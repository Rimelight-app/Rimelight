// B3: object URLs made for covers, and main-process memory, while scrolling
// the album grid down and up three times. With the 0.6.0 "Cache images"
// setting it turns the setting on first (it no longer exists from 0.6.1).
//
// COMMENT=1 (B2): opens the "Comment Injection" album (make_big_library.py)
// and checks that the comment's markup doesn't run, that its text shows, and
// that the renderer can neither open file:/ms-settings: URLs nor navigate
// the window away from the app (shell.openExternal is stubbed).
//
// Usage (from tools/dev-rig): perf/xrun.sh node perf/imgcache.mjs
//                             COMMENT=1 perf/xrun.sh node perf/imgcache.mjs
import {
  findAlbum,
  go,
  launch,
  processMetrics,
  sleep,
  writeResult,
} from './lib.mjs'

const s = await launch()
const { app, win } = s
let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`,
  )
}

if (process.env.COMMENT === '1') {
  // Stub openExternal in the main process and record what reaches it.
  await app.evaluate(({ shell }) => {
    globalThis.__opened = []
    shell.openExternal = async (url) => {
      globalThis.__opened.push(url)
    }
  })
  const opened = () => app.evaluate(() => globalThis.__opened.slice())

  const album = await findAlbum('Comment Injection')
  const titleBefore = await win.title()
  await go(win, `/library/albums/${album.id}`, 3000)
  const titleAfter = await win.title()
  check(
    'injected comment did not run (title unchanged)',
    !/CP-INJECTED/.test(titleAfter),
    `before "${titleBefore}", after "${titleAfter}"`,
  )
  const comment = await win.evaluate(() => {
    const el = [...document.querySelectorAll('p.html')].find((p) =>
      /Liner notes/.test(p.textContent),
    )
    return el
      ? {
          text: el.textContent,
          html: el.innerHTML,
          imgs: el.querySelectorAll('img').length,
        }
      : null
  })
  check(
    'comment text visible',
    !!comment && /Liner notes/.test(comment.text),
    comment ? JSON.stringify(comment.html) : 'no comment element',
  )
  check(
    'no <img> from the comment in the page',
    !!comment && comment.imgs === 0,
  )

  for (const url of [
    'file:///C:/Windows/System32/calc.exe',
    'ms-settings:privacy',
    'smb://attacker.invalid/share',
  ]) {
    const before = (await opened()).length
    await win.evaluate((u) => window.open(u), url)
    await sleep(400)
    check(
      `window.open(${url}) -> no openExternal call`,
      (await opened()).length === before,
    )
  }
  {
    const before = (await opened()).length
    await win.evaluate(() => window.open('https://example.com'))
    await sleep(400)
    const after = await opened()
    check(
      'window.open(https://example.com) -> one openExternal call',
      after.length === before + 1 && after.at(-1) === 'https://example.com/',
      JSON.stringify(after.slice(before)),
    )
  }
  {
    const urlBefore = await win.evaluate(() => location.href)
    const before = (await opened()).length
    await win.evaluate(() => {
      location.href = 'https://example.com'
    })
    await sleep(1500)
    const urlAfter = await win
      .evaluate(() => location.href)
      .catch((e) => `error: ${e.message}`)
    check(
      'location.href = https://example.com -> window stays on the app',
      urlAfter.startsWith('file:') &&
        urlAfter.split('#')[0] === urlBefore.split('#')[0],
      urlAfter,
    )
    const after = await opened()
    console.log(
      `      (that navigation went to the browser instead: ${JSON.stringify(after.slice(before))})`,
    )
    const before2 = after.length
    await win.evaluate(() => {
      location.href = 'file:///etc/passwd'
    })
    await sleep(1000)
    const urlAfter2 = await win
      .evaluate(() => location.href)
      .catch((e) => `error: ${e.message}`)
    check(
      'location.href = file:///etc/passwd -> stays, nothing opened',
      urlAfter2.split('#')[0] === urlBefore.split('#')[0] &&
        (await opened()).length === before2,
      urlAfter2,
    )
  }
  const csp = await win.evaluate(
    () =>
      document.querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.content ?? null,
  )
  console.log(`      CSP: ${csp ?? 'none'}`)
  console.log(
    `      CSP violations: ${s.csp.length}; page errors: ${s.errors.length}`,
  )
  for (const e of [...s.csp, ...s.errors]) console.log(`        ${e}`)
  writeResult('inject', {
    comment,
    failed,
    csp,
    violations: s.csp,
    errors: s.errors,
  })
} else {
  await win.addInitScript?.(() => {})
  await win.evaluate(() => {
    const created = []
    let revoked = 0
    const c = URL.createObjectURL.bind(URL)
    const r = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (o) => {
      const u = c(o)
      created.push(u)
      return u
    }
    URL.revokeObjectURL = (u) => {
      revoked++
      r(u)
    }
    window.__blobs = () => ({ created: created.length, revoked })
  })
  const hasSetting = await win.evaluate(
    () =>
      typeof window.__cp.app.getState().pages.setImagesCacheLayerEnabled ===
      'function',
  )
  if (hasSetting)
    await win.evaluate(() =>
      window.__cp.app.getState().pages.setImagesCacheLayerEnabled(true),
    )
  const mainMB = async () =>
    (await processMetrics(app)).find((m) => m.type === 'Browser').memMB
  await go(win, '/library/albums', 3000)
  const before = await mainMB()
  for (let round = 0; round < 3; round++) {
    for (const dir of [1, -1]) {
      for (let i = 0; i < 40; i++) {
        await win.mouse.move(900, 500)
        await win.mouse.wheel(0, dir * 1500)
        await sleep(120)
      }
      await sleep(800)
    }
  }
  await sleep(2000)
  const after = await mainMB()
  const blobs = await win.evaluate(() => window.__blobs())
  const out = {
    setting: hasSetting ? 'on' : 'removed',
    blobsCreated: blobs.created,
    blobsRevoked: blobs.revoked,
    mainMB: { before, after, delta: after - before },
  }
  console.log(JSON.stringify(out))
  writeResult('imgcache', out)
}

await s.close()
process.exit(failed ? 1 : 0)
