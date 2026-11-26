#!/usr/bin/env node
// Fault proxy: sits between a client (Rimelight desktop, Rimelight for Android
// in an emulator, anything that speaks Subsonic) and a real server, and breaks
// chosen requests on purpose. Plain Node (18+), no dependencies, no Electron.
//
// Usage:
//   node fault-proxy.mjs [PORT] [--listen ADDR] [--port PORT]
//                        [--upstream URL] [--rule RULE]... [--rules-file FILE]
// Environment (used when the argument is missing):
//   FAULT_LISTEN (default 127.0.0.1), FAULT_PORT (default 4534),
//   FAULT_UPSTREAM (default http://127.0.0.1:4533), FAULT_RULES (JSON array)
//
// Point the client at http://ADDR:PORT instead of the server. For the Android
// emulator: --listen 0.0.0.0, and the app uses http://10.0.2.2:PORT.
//
// RULE, short form:  ENDPOINT[:key=value...]:ACTION[:times=N][:after=N]
//   ENDPOINT  Subsonic endpoint without "/rest/" and ".view" (stream,
//             getAlbum, search3, ping, ...) or * for every request
//   key=value only requests whose query has this value (e.g. id=abc)
//   ACTION    404 | 500 | 503 | any HTTP status
//             badjson      200 with a body that isn't JSON
//             error40      Subsonic error 40 (wrong username or password);
//             error41, error44, error70 (not found), any errorNN
//             drop         close the connection without an answer
//             hang         never answer
//             delay=MS     wait, then pass the request on
//             down         like the server being off: every request is dropped
//   times=N   apply to the first N matching requests only
//   after=N   let the first N matching requests through first
// Examples:
//   --rule stream:id=50Jsn...:404            song 3 of 5 is gone
//   --rule getAlbum:500   --rule getAlbum:badjson   --rule getAlbum:error40
//   --rule search3:drop:after=3              Stats: the 4th page fails
//   --rule '*:down'                          server unreachable
// RULE, JSON form (FAULT_RULES, --rules-file, or the control API):
//   {"endpoint":"stream","query":{"id":"abc"},"action":"404","times":1,"after":0}
//
// Control API, on the same port (for tests that change faults mid-run):
//   GET  /__fault/rules           current rules
//   POST /__fault/rules           replace the rules (JSON array, short strings or objects)
//   POST /__fault/clear           no faults
//   GET  /__fault/log             requests per endpoint, faults applied, and the
//                                 last 5 000 requests (endpoint, id, size, offset)
//   POST /__fault/log/reset
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'

// ---------------------------------------------------------------- options
function parseArgs(argv) {
  const out = { rules: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--listen') out.listen = next()
    else if (a === '--port') out.port = Number(next())
    else if (a === '--upstream') out.upstream = next()
    else if (a === '--rule') out.rules.push(next())
    else if (a === '--rules-file')
      out.rules.push(...JSON.parse(fs.readFileSync(next(), 'utf8')))
    else if (a === '-h' || a === '--help') {
      console.log(
        fs
          .readFileSync(new URL(import.meta.url), 'utf8')
          .split('\n')
          .filter((l) => l.startsWith('//'))
          .map((l) => l.slice(3))
          .join('\n'),
      )
      process.exit(0)
    } else if (/^\d+$/.test(a)) out.port = Number(a)
    else throw new Error(`unknown argument: ${a}`)
  }
  return out
}

/** "stream:id=x:404:times=1" -> { endpoint, query, action, times, after } */
export function parseRule(rule) {
  if (typeof rule === 'object' && rule)
    return { query: {}, ...rule, action: String(rule.action) }
  const parts = String(rule).split(':')
  const r = {
    endpoint: parts.shift(),
    query: {},
    action: null,
    times: undefined,
    after: 0,
  }
  for (const p of parts) {
    const [k, v] = p.split('=')
    if (k === 'times') r.times = Number(v)
    else if (k === 'after') r.after = Number(v)
    else if (k === 'delay') r.action = `delay=${v}`
    else if (v !== undefined && r.action === null) r.query[k] = v
    else r.action = p
  }
  if (!r.endpoint || !r.action) throw new Error(`bad rule: ${rule}`)
  return r
}

const cli = parseArgs(process.argv.slice(2))
const LISTEN = cli.listen ?? process.env.FAULT_LISTEN ?? '127.0.0.1'
const PORT = cli.port ?? Number(process.env.FAULT_PORT ?? 4534)
const UPSTREAM = new URL(
  cli.upstream ?? process.env.FAULT_UPSTREAM ?? 'http://127.0.0.1:4533',
)
let rules = []
const setRules = (list) => {
  rules = list.map(parseRule).map((r) => ({ ...r, seen: 0, applied: 0 }))
}
setRules([
  ...(process.env.FAULT_RULES ? JSON.parse(process.env.FAULT_RULES) : []),
  ...cli.rules,
])

const log = { requests: {}, faults: [], recent: [] }
const RECENT = 5000

// ---------------------------------------------------------------- faults
function endpointOf(url) {
  const m = url.pathname.match(/\/rest\/([^/.?]+)/)
  return m ? m[1] : url.pathname
}

function matching(url) {
  const ep = endpointOf(url)
  for (const r of rules) {
    if (r.endpoint !== '*' && r.endpoint !== ep) continue
    if (
      !Object.entries(r.query ?? {}).every(
        ([k, v]) => url.searchParams.get(k) === v,
      )
    )
      continue
    r.seen++
    if (r.seen <= (r.after ?? 0)) continue
    if (r.times !== undefined && r.applied >= r.times) continue
    r.applied++
    return r
  }
  return null
}

function subsonicError(url, code) {
  const messages = {
    10: 'Required parameter is missing.',
    40: 'Wrong username or password.',
    41: 'Token authentication not supported.',
    44: 'Invalid API key.',
    50: 'User is not authorized.',
    70: 'The requested data was not found.',
  }
  const body = {
    'subsonic-response': {
      status: 'failed',
      version: '1.16.1',
      type: 'navidrome',
      serverVersion: 'fault-proxy',
      openSubsonic: true,
      error: { code, message: messages[code] ?? 'Error' },
    },
  }
  if (url.searchParams.get('f') === 'json')
    return ['application/json', JSON.stringify(body)]
  return [
    'text/xml',
    `<?xml version="1.0" encoding="UTF-8"?><subsonic-response xmlns="http://subsonic.org/restapi" status="failed" version="1.16.1"><error code="${code}" message="${body['subsonic-response'].error.message}"/></subsonic-response>`,
  ]
}

/** Returns true when the fault answered the request itself. */
async function applyFault(rule, url, req, res) {
  const a = rule.action
  // Like the real server (Navidrome sends CORS headers on every answer), so
  // a browser client sees the fault and not a CORS failure.
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*')
  log.faults.push({
    t: Date.now(),
    endpoint: endpointOf(url),
    id: url.searchParams.get('id'),
    action: a,
  })
  if (a === 'down' || a === 'drop') {
    req.socket.destroy()
    return true
  }
  if (a === 'hang') return true
  if (a.startsWith('delay=')) {
    await new Promise((r) => setTimeout(r, Number(a.slice(6))))
    return false
  }
  if (a === 'badjson') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"subsonic-response": {"status": "ok", "album": [')
    return true
  }
  const err = a.match(/^error(\d+)$/)
  if (err) {
    const [type, body] = subsonicError(url, Number(err[1]))
    res.writeHead(200, { 'content-type': type })
    res.end(body)
    return true
  }
  if (/^\d{3}$/.test(a)) {
    res.writeHead(Number(a), { 'content-type': 'text/plain' })
    res.end(`fault-proxy: ${a}`)
    return true
  }
  throw new Error(`unknown action ${a}`)
}

// ---------------------------------------------------------------- control API
function control(req, res, url) {
  const send = (obj) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(obj, null, 2))
  }
  const body = () =>
    new Promise((resolve) => {
      let b = ''
      req.on('data', (c) => (b += c))
      req.on('end', () => resolve(b))
    })
  const p = url.pathname
  if (p === '/__fault/rules' && req.method === 'GET') return send(rules)
  if (p === '/__fault/rules' && req.method === 'POST')
    return body().then((b) => {
      setRules(JSON.parse(b || '[]'))
      send(rules)
    })
  if (p === '/__fault/clear') {
    setRules([])
    return send(rules)
  }
  if (p === '/__fault/log' && req.method === 'GET') return send(log)
  if (p === '/__fault/log/reset') {
    log.requests = {}
    log.faults = []
    log.recent = []
    return send(log)
  }
  res.writeHead(404).end()
}

// ---------------------------------------------------------------- proxy
const client = UPSTREAM.protocol === 'https:' ? https : http
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'proxy'}`)
  if (url.pathname.startsWith('/__fault/')) return control(req, res, url)
  const ep = endpointOf(url)
  log.requests[ep] = (log.requests[ep] ?? 0) + 1
  log.recent.push({
    t: Date.now(),
    endpoint: ep,
    id: url.searchParams.get('id'),
    size: url.searchParams.get('size'),
    offset:
      url.searchParams.get('offset') ?? url.searchParams.get('songOffset'),
  })
  if (log.recent.length > RECENT)
    log.recent.splice(0, log.recent.length - RECENT)
  const rule = matching(url)
  if (rule && (await applyFault(rule, url, req, res))) return
  const headers = { ...req.headers, host: UPSTREAM.host }
  const up = client.request(
    {
      protocol: UPSTREAM.protocol,
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port,
      method: req.method,
      path: url.pathname + url.search,
      headers,
    },
    (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, upRes.headers)
      upRes.pipe(res)
    },
  )
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
  req.pipe(up)
})
server.keepAliveTimeout = 1000
server.listen(PORT, LISTEN, () => {
  console.log(
    `fault-proxy on http://${LISTEN}:${PORT} -> ${UPSTREAM.origin}; ${rules.length} rule(s)`,
  )
})
