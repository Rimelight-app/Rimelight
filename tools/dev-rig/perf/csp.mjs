// Content-Security-Policy sweep: opens every view of the built app with the
// console open and reports CSP violations (console messages and
// securitypolicyviolation events) and page errors. Also:
//   - plays an HLS animated cover through hls.js (blob: worker, blob: media)
//     from a local fake artwork service
//   - fakes an available update and checks the release notes render
//     (sanitized: headings and lists kept, an <img onerror> dropped)
// Run once per engine:
//   ENGINE=html perf/xrun.sh node perf/csp.mjs
//   ENGINE=mpv  perf/xrun.sh node perf/csp.mjs
import { startLiveCoverService } from '../lib/live-cover-service.mjs'
import {
  api,
  findAlbum,
  findPlaylist,
  go,
  launch,
  RIG,
  sleep,
  writeResult,
} from './lib.mjs'

// ---- fake animated-artwork service + HLS stream (any artist finds a stream)
const service = await startLiveCoverService({ rig: RIG, clip: 'testsrc' })
const artworkUrl = service.url
const hlsRequests = () =>
  Object.values(service.hls()).reduce((n, c) => n + c.playlist + c.segments, 0)

const s = await launch()
const { app, win } = s
const events = []
await win.evaluate(() => {
  window.__cspEvents = []
  document.addEventListener('securitypolicyviolation', (e) =>
    window.__cspEvents.push(
      `${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`,
    ),
  )
})
const visited = []
const visit = async (name, fn) => {
  const before = s.csp.length + s.errors.length
  try {
    await fn()
  } catch (e) {
    s.errors.push(`${name}: ${e.message.slice(0, 200)}`)
  }
  visited.push(
    `${name}${s.csp.length + s.errors.length > before ? ' (!)' : ''}`,
  )
}

const album = await findAlbum('Fault Test')
const bigAlbum = await findAlbum('Three Discs')
const playlist = await findPlaylist('Playlist 300')
const artist = (await api('getArtists')).artists.index[0].artist[0]

for (const [name, hash] of [
  ['home', '/'],
  ['albums', '/library/albums'],
  ['album', `/library/albums/${album.id}`],
  ['multi-disc album', `/library/albums/${bigAlbum.id}`],
  ['artists', '/library/artists'],
  ['artist', `/library/artists/${artist.id}`],
  ['songs', '/library/songs'],
  ['favorites', '/library/favorites'],
  ['playlists', '/library/playlists'],
  ['playlist', `/library/playlists/${playlist.id}`],
  ['genres', '/library/genres'],
  ['radios', '/library/radios'],
  ['now playing', '/now-playing'],
  ['stats', '/stats'],
  ['search', '/search?query=neon'],
]) {
  await visit(name, () => go(win, hash, 2000))
}

// Play something so the player bar, lyrics and fullscreen have a song.
await visit('play album', async () => {
  await go(win, `/library/albums/${album.id}`, 2000)
  await win
    .getByRole('button', { name: /^(Play all|Pause)$/ })
    .first()
    .click()
  await sleep(3000)
})
await visit('queue panel', async () => {
  await win.evaluate(() =>
    window.__cp.player.getState().actions.setQueueState(true),
  )
  await sleep(1500)
  await win.evaluate(() =>
    window.__cp.player.getState().actions.setQueueState(false),
  )
})
await visit('lyrics panel', async () => {
  await win.evaluate(() =>
    window.__cp.player.getState().actions.setLyricsState?.(true),
  )
  await sleep(1500)
  await win.evaluate(() =>
    window.__cp.player.getState().actions.setLyricsState?.(false),
  )
})
await visit('ctrl+k', async () => {
  await win.keyboard.press('Control+k')
  await sleep(800)
  await win.keyboard.type('fault')
  await sleep(1200)
  await win.keyboard.press('Escape')
})
for (const page of [
  'servers',
  'appearance',
  'language',
  'audio',
  'content',
  'desktop',
  'privacy',
]) {
  await visit(`settings: ${page}`, async () => {
    await win.evaluate((p) => {
      const st = window.__cp.app.getState().settings
      st.setCurrentPage(p)
      st.setOpenDialog(true)
    }, page)
    await sleep(1000)
  })
}
await win.evaluate(() =>
  window.__cp.app.getState().settings.setOpenDialog(false),
)
await sleep(500)

// Animated cover over HLS in the fullscreen player.
let hls = null
await visit('fullscreen + HLS animated cover', async () => {
  await win.evaluate((url) => {
    const a = window.__cp.app.getState().artwork
    a.setCustomUrlEnabled(true)
    a.setBaseUrl(url)
    a.setEnabled(true)
  }, artworkUrl)
  await win.evaluate(
    () =>
      window.__cp.player.getState().actions.setIsFullscreen?.(true) ??
      window.__cp.player.getState().fullscreen.setIsFullscreen(true),
  )
  await sleep(6000)
  hls = await win.evaluate(() => {
    const v = [...document.querySelectorAll('video')].find((x) => x.currentSrc)
    return v
      ? {
          src: v.currentSrc.slice(0, 40),
          time: v.currentTime,
          readyState: v.readyState,
          paused: v.paused,
        }
      : null
  })
  await win.evaluate(() =>
    window.__cp.player.getState().fullscreen.setIsFullscreen(false),
  )
  await sleep(800)
})

// Fake update: stub the main process's update check, reload the renderer.
let notes = null
await visit('update dialog', async () => {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('check-for-updates')
    ipcMain.handle('check-for-updates', () => ({
      isUpdateAvailable: true,
      updateInfo: {
        version: '9.9.9',
        releaseNotes:
          '<h3>Fixed</h3><ul><li>Playback <strong>keeps going</strong> after a broken song.</li><li>See <a href="https://github.com/Rimelight-app/Rimelight">the repo</a>.</li></ul><img src=x onerror="document.title=\'CP-NOTES\'">',
      },
      versionInfo: { version: '9.9.9' },
    }))
  })
  await win.evaluate(() =>
    window.__cp.app.getState().update.setRemindOnNextBoot?.(false),
  )
  await win.reload()
  await win.waitForLoadState('domcontentloaded')
  await sleep(4000)
  notes = await win.evaluate(() => {
    const body = document.querySelector('#update-info-body')
    return body
      ? {
          html: body.innerHTML.replace(/\s+/g, ' ').slice(0, 400),
          title: document.title,
          imgs: body.querySelectorAll('img').length,
        }
      : null
  })
})

const cspEvents = await win
  .evaluate(() => window.__cspEvents ?? [])
  .catch(() => [])
events.push(...cspEvents)
const out = {
  engine: process.env.ENGINE || 'html',
  visited,
  cspViolations: [...s.csp, ...events],
  pageErrors: s.errors,
  hls,
  hlsRequests: hlsRequests(),
  updateNotes: notes,
}
console.log(JSON.stringify(out, null, 2))
writeResult('csp', out)
await s.close()
await service.close()
process.exit(out.cspViolations.length ? 1 : 0)
