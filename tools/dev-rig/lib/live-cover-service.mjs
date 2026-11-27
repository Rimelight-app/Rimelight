// A local stand-in for the live (animated) album-cover service
// (src/api/artworkClient.ts: GET /api/v1/artwork/search?artist=…&album=… →
// { url: <HLS .m3u8> }), plus the HLS stream it points to.
//
//   const svc = await startLiveCoverService({ rig, known: { 'Neon Tides': ['Mira Vale'] } })
//   svc.url        base URL to put in Settings → custom artwork service
//   svc.searches   every search: { artist, album, status, t }
//   svc.hls()      { <album key>: { playlist: n, segments: n } }
//   svc.reset()    clears both counters
//   svc.setMode('ok' | 'down' | 'broken')
//       down: every request's connection is dropped (service unreachable)
//       broken: searches answer with a stream whose segments are not video
//   svc.close()
//
// known: album name → the single artist names the service knows for it. Like
// the real service, a search only finds a stream for one of those exact
// names; any other artist string (two names joined, "A • B", "A; B") gets a
// 404. known: null answers every search with a stream (perf/csp.mjs).
//
// clip: 'framecode' (default) is 2 s at 30 fps where every frame is one solid
// colour that encodes its frame number (decodeFrame below), so a screenshot
// tells which frame each screen shows. 'testsrc' is ffmpeg's test pattern
// (8 s at 25 fps), as perf/csp.mjs has always used.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

export const FRAMES = 60
export const FPS = 30
const LEVELS = [20, 90, 160, 230]

/** Colour of frame n (0…59): base-4 digits of n in R, G, B. */
export function frameColour(n) {
  return [
    LEVELS[n % 4],
    LEVELS[Math.floor(n / 4) % 4],
    LEVELS[Math.floor(n / 16) % 4],
  ]
}

/** Frame number from an [r, g, b] pixel, or null if it isn't a frame colour. */
export function decodeFrame([r, g, b]) {
  const digit = (v) => {
    let best = 0
    for (let i = 1; i < LEVELS.length; i++)
      if (Math.abs(LEVELS[i] - v) < Math.abs(LEVELS[best] - v)) best = i
    return Math.abs(LEVELS[best] - v) <= 30 ? best : null
  }
  const d = [digit(r), digit(g), digit(b)]
  if (d.some((x) => x === null)) return null
  const n = d[0] + 4 * d[1] + 16 * d[2]
  return n < FRAMES ? n : null
}

/** Distance between two frame numbers on the looping clip (0…30). */
export function frameDistance(a, b) {
  const d = Math.abs(a - b) % FRAMES
  return Math.min(d, FRAMES - d)
}

function makeFrameCodeClip(dir) {
  const size = 320
  const raw = Buffer.alloc(size * size * 3 * FRAMES)
  for (let n = 0; n < FRAMES; n++) {
    const [r, g, b] = frameColour(n)
    const base = n * size * size * 3
    for (let p = 0; p < size * size; p++) {
      raw[base + p * 3] = r
      raw[base + p * 3 + 1] = g
      raw[base + p * 3 + 2] = b
    }
  }
  const res = spawnSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-s',
      `${size}x${size}`,
      '-r',
      String(FPS),
      '-i',
      '-',
      '-vf',
      'scale=out_color_matrix=bt709:out_range=tv',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '12',
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-g',
      String(FPS),
      '-keyint_min',
      String(FPS),
      '-sc_threshold',
      '0',
      '-f',
      'hls',
      '-hls_time',
      '1',
      '-hls_playlist_type',
      'vod',
      path.join(dir, 'index.m3u8'),
    ],
    { input: raw, maxBuffer: 1 << 26 },
  )
  if (res.status !== 0) throw new Error(`ffmpeg: ${res.stderr}`)
}

function makeTestSrcClip(dir) {
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x320:rate=25:duration=8',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-g',
    '25',
    '-f',
    'hls',
    '-hls_time',
    '2',
    '-hls_playlist_type',
    'vod',
    path.join(dir, 'index.m3u8'),
  ])
}

const albumKey = (album) =>
  album
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'album'

export async function startLiveCoverService({
  rig = process.env.RIG || '/tmp/rimelight-rig',
  clip = 'framecode',
  known = null,
  port = 0,
} = {}) {
  // perf/csp.mjs has always kept its test pattern in $RIG/hls.
  const dir = path.join(rig, clip === 'testsrc' ? 'hls' : 'hls-framecode')
  if (!fs.existsSync(path.join(dir, 'index.m3u8'))) {
    fs.mkdirSync(dir, { recursive: true })
    if (clip === 'testsrc') makeTestSrcClip(dir)
    else makeFrameCodeClip(dir)
  }
  const brokenDir = path.join(rig, 'hls-broken')
  if (!fs.existsSync(path.join(brokenDir, 'index.m3u8'))) {
    fs.mkdirSync(brokenDir, { recursive: true })
    fs.writeFileSync(
      path.join(brokenDir, 'index.m3u8'),
      '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:1.0,\nbad0.ts\n#EXTINF:1.0,\nbad1.ts\n#EXT-X-ENDLIST\n',
    )
    fs.writeFileSync(path.join(brokenDir, 'bad0.ts'), Buffer.alloc(18800, 0x47))
    fs.writeFileSync(path.join(brokenDir, 'bad1.ts'), Buffer.alloc(18800, 0x47))
  }

  const knownSets = known
    ? Object.fromEntries(
        Object.entries(known).map(([a, names]) => [a, new Set(names)]),
      )
    : null
  const searches = []
  let hls = {}
  let mode = 'ok'

  const server = http.createServer((req, res) => {
    if (mode === 'down') {
      req.socket.destroy()
      return
    }
    res.setHeader('Access-Control-Allow-Origin', '*')
    const url = new URL(req.url, 'http://x')
    const base = `http://127.0.0.1:${server.address().port}`
    if (url.pathname === '/api/v1/artwork/search') {
      const artist = url.searchParams.get('artist') ?? ''
      const album = url.searchParams.get('album') ?? ''
      const found = knownSets ? knownSets[album]?.has(artist) : true
      searches.push({ artist, album, status: found ? 200 : 404, t: Date.now() })
      if (!found) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'not found' }))
        return
      }
      const key =
        mode === 'broken' ? `broken~${albumKey(album)}` : albumKey(album)
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ url: `${base}/hls/${key}/index.m3u8` }))
      return
    }
    const m = url.pathname.match(/^\/hls\/(?:([^/]+)\/)?([^/]+)$/)
    if (m) {
      const key = m[1] ?? 'default'
      const name = m[2]
      const from = key.startsWith('broken~') ? brokenDir : dir
      const c = (hls[key] ??= { playlist: 0, segments: 0 })
      if (name.endsWith('.m3u8')) c.playlist++
      else c.segments++
      const file = path.join(from, path.basename(name))
      if (!fs.existsSync(file)) return res.writeHead(404).end()
      res.setHeader(
        'content-type',
        file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
      )
      fs.createReadStream(file).pipe(res)
      return
    }
    res.writeHead(404).end()
  })
  await new Promise((r) => server.listen(port, '127.0.0.1', r))
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    searches,
    hls: () => structuredClone(hls),
    reset: () => {
      searches.length = 0
      hls = {}
    },
    setMode: (m) => {
      mode = m
    },
    close: () => new Promise((r) => server.close(r)),
    albumKey,
  }
}
