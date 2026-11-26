// Startup (P6, P7):
//   - startup JS: the renderer JS the built index.html loads before first
//     paint (entry script + modulepreloads), from out/renderer
//   - cold start, median of RUNS (default 3): main start -> window shown,
//     -> first paint, -> home with covers
//   - renderer reload -> first paint (the part PROFILE=cpu4 slows)
//   - mpv probe: how long `mpv --no-config --version` takes here, and
//     whether the app ran it during launch (a logging mpv shim, RIMELIGHT_MPV)
// Usage (from tools/dev-rig): perf/xrun.sh node perf/startup.mjs
//                             PROFILE=cpu4 perf/xrun.sh node perf/startup.mjs
//                             ENGINE=mpv perf/xrun.sh node perf/startup.mjs
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  ENGINE,
  launch,
  median,
  PROFILE,
  repo,
  sleep,
  writeResult,
} from './lib.mjs'

const appDir = process.env.RIMELIGHT_APP || repo
const RUNS = Number(process.env.RUNS || 3)

// ---- startup JS from the built HTML
const outDir = path.join(appDir, 'out/renderer')
const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8')
const eager = [
  ...html.matchAll(
    /<(?:script[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="\.\/(assets\/[^"]+\.js)"/g,
  ),
].map((m) => m[1])
const kb = (f) => fs.statSync(path.join(outDir, f)).size / 1024
const startupJs = {
  files: eager.length,
  kb: Math.round(eager.reduce((a, f) => a + kb(f), 0)),
}
const allJs = fs
  .readdirSync(path.join(outDir, 'assets'))
  .filter((f) => f.endsWith('.js'))
startupJs.totalRendererKb = Math.round(
  allJs.reduce((a, f) => a + kb(`assets/${f}`), 0),
)
startupJs.largestEager = eager
  .map((f) => [
    path.basename(f).replace(/-[\w-]{8}\.js$/, ''),
    Math.round(kb(f)),
  ])
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
console.log('startup JS', JSON.stringify(startupJs))

// ---- the mpv probe by itself
const probe = []
for (let i = 0; i < 5; i++) {
  const t = process.hrtime.bigint()
  const r = spawnSync('mpv', ['--no-config', '--version'], { encoding: 'utf8' })
  if (r.status !== 0) break
  probe.push(Number(process.hrtime.bigint() - t) / 1e6)
}
const probeMs = probe.length ? Math.round(median(probe)) : null

// ---- a logging mpv shim: records each --version run with its duration
const shimDir = fs.mkdtempSync('/tmp/cp-mpv-shim-')
const shimLog = path.join(shimDir, 'log')
const realMpv = spawnSync('sh', ['-c', 'command -v mpv'], {
  encoding: 'utf8',
}).stdout.trim()
fs.writeFileSync(
  path.join(shimDir, 'mpv'),
  `#!/bin/bash
case " $* " in
  *" --version "*) s=$(date +%s%N); "${realMpv}" "$@"; rc=$?; e=$(date +%s%N); echo "$s $e" >> "${shimLog}"; exit $rc ;;
  *) exec "${realMpv}" "$@" ;;
esac
`,
  { mode: 0o755 },
)

/** Home shows covers: at least one cover loaded and none still loading. */
const coversShown = (win) =>
  win.evaluate(() => {
    const covers = [...document.images].filter((im) =>
      /getCoverArt/.test(im.src),
    )
    return (
      covers.length > 0 &&
      covers.every((im) => im.complete && im.naturalWidth > 0)
    )
  })

// ---- cold starts
const runs = []
for (let i = 0; i < RUNS; i++) {
  fs.rmSync(shimLog, { force: true })
  const s = await launch({
    login: true,
    env: realMpv ? { RIMELIGHT_MPV: path.join(shimDir, 'mpv') } : {},
  })
  const { app, win, cdp } = s
  // Wait for covers on home.
  const t0 = Date.now()
  while (Date.now() - t0 < 20000) {
    if (await coversShown(win)) break
    await sleep(50)
  }
  const coversAt = Date.now()
  const mainStart = await app.evaluate(
    () => Date.now() - process.uptime() * 1000,
  )
  const probes = fs.existsSync(shimLog)
    ? fs
        .readFileSync(shimLog, 'utf8')
        .trim()
        .split('\n')
        .map((l) => l.split(' ').map((x) => Number(x) / 1e6))
    : []
  const fp = await win.evaluate(() => {
    const p = performance
      .getEntriesByType('paint')
      .find((e) => e.name === 'first-paint')
    return p ? performance.timeOrigin + p.startTime : null
  })
  // Renderer reload alone (what 4x CPU slows).
  if (PROFILE === 'cpu4')
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const r0 = Date.now()
  await win.reload()
  await win.waitForLoadState('domcontentloaded')
  let reloadCovers = null
  while (Date.now() - r0 < 30000) {
    if (await coversShown(win).catch(() => false)) {
      reloadCovers = Date.now() - r0
      break
    }
    await sleep(50)
  }
  const reloadFp = await win.evaluate(
    () =>
      performance
        .getEntriesByType('paint')
        .find((e) => e.name === 'first-paint')?.startTime ?? null,
  )
  const run = {
    mainToFirstPaintMs: fp ? Math.round(fp - mainStart) : null,
    // mpv --version runs that started before first paint, and their time
    probesBeforePaint: probes.filter(([st]) => fp && st < fp).length,
    probeMsAtLaunch: probes
      .filter(([st]) => fp && st < fp)
      .map(([st, en]) => Math.round(en - st)),
    mainToCoversMs: Math.round(coversAt - mainStart),
    reloadToFirstPaintMs: reloadFp ? Math.round(reloadFp) : null,
    reloadToCoversMs: reloadCovers,
  }
  console.log(JSON.stringify(run))
  runs.push(run)
  await s.close()
  await sleep(1000)
}

const med = (k) => median(runs.map((r) => r[k]).filter((x) => x !== null))
const out = {
  profile: PROFILE,
  engine: ENGINE,
  startupJs,
  mpvProbeMs: probeMs,
  median: {
    mainToFirstPaintMs: med('mainToFirstPaintMs'),
    mainToCoversMs: med('mainToCoversMs'),
    reloadToFirstPaintMs: med('reloadToFirstPaintMs'),
    reloadToCoversMs: med('reloadToCoversMs'),
  },
  runs,
}
console.log(JSON.stringify(out))
writeResult('startup', out)
