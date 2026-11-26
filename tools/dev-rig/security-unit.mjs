// Security checks: which URLs the app opens outside itself, which pages the
// window may show, what mpv may load, and the HTML sanitizer.
// Usage: node tools/dev-rig/security-unit.mjs   (Node 22.18+ runs the .ts files)
// The sanitizer runs on jsdom here; tools/dev-rig/perf/inject.mjs repeats the
// comment check in the real app.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const load = (p) => import(pathToFileURL(path.join(root, p)).href)

const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document

const { isSafeExternalUrl, isAppUrl, isAllowedMpvUrl, httpOrigin } = await load(
  'electron/main/core/safe-url.ts',
)
const { sanitizeHtml } = await load('src/utils/sanitize.ts')
const { linkifyText } = await load('src/utils/parseTexts.ts')

let passed = 0
let failed = 0
const t = (name, fn) => {
  try {
    fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}: ${e.message.split('\n').slice(0, 6).join(' ')}`)
    process.exitCode = 1
  }
}

// ---------- isSafeExternalUrl ----------

for (const url of [
  'https://example.com',
  'https://www.last.fm/music/Ivo?x=1#y',
  'http://example.com/path',
  'mailto:info@label.bg',
]) {
  t(`isSafeExternalUrl yes: ${url}`, () =>
    assert.equal(isSafeExternalUrl(url), true),
  )
}

for (const url of [
  'file:///C:/Windows/System32/calc.exe',
  'file:///etc/passwd',
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'ms-settings:privacy',
  'smb://attacker/share',
  'FILE:///C:/Windows/System32/calc.exe',
  'JAVASCRIPT:alert(1)',
  'JavaScript:alert(1)',
  'DATA:text/html,x',
  'MS-SETTINGS:privacy',
  'SMB://attacker/share',
  '  javascript:alert(1)',
  'javascript:alert(1)  ',
  '\tfile:///etc/passwd',
  ' ms-settings:privacy ',
  '\nsmb://attacker/share',
  ' https://example.com',
  'java\tscript:alert(1)',
  'vbscript:msgbox',
  'ftp://example.com',
  'about:blank',
  '',
  'not a url',
  null,
  undefined,
  42,
]) {
  t(`isSafeExternalUrl no: ${JSON.stringify(url)}`, () =>
    assert.equal(isSafeExternalUrl(url), false),
  )
}

// ---------- isAppUrl (navigation guard) ----------

const prodEntry =
  'file:///opt/Rimelight/resources/app.asar/out/renderer/index.html'
const winEntry =
  'file:///C:/Users/a/AppData/Local/Programs/Rimelight/resources/app.asar/out/renderer/index.html'
t('isAppUrl: same file with a hash route', () =>
  assert.equal(isAppUrl(`${prodEntry}#/albums`, prodEntry), true),
)
t('isAppUrl: same file with ?e2e=1', () =>
  assert.equal(isAppUrl(`${prodEntry}?e2e=1#/`, prodEntry), true),
)
t('isAppUrl: Windows path', () =>
  assert.equal(isAppUrl(`${winEntry}#/library`, winEntry), true),
)
for (const target of [
  'https://example.com',
  'file:///etc/passwd',
  'file:///opt/Rimelight/resources/app.asar/out/renderer/other.html',
  'file:///C:/Windows/System32/calc.exe',
  'http://127.0.0.1:47470/',
  'data:text/html,hi',
  'javascript:alert(1)',
]) {
  t(`isAppUrl no: ${target}`, () =>
    assert.equal(isAppUrl(target, prodEntry), false),
  )
}
t('isAppUrl: dev server same origin', () =>
  assert.equal(
    isAppUrl('http://localhost:5173/#/x', 'http://localhost:5173'),
    true,
  ),
)
t('isAppUrl: dev server other origin', () =>
  assert.equal(
    isAppUrl('http://localhost:5174/', 'http://localhost:5173'),
    false,
  ),
)

// ---------- mpv sources ----------

const allowed = [
  httpOrigin('https://music.example.org/navidrome'),
  'http://127.0.0.1:47470',
]
t('httpOrigin keeps scheme, host and port only', () =>
  assert.equal(allowed[0], 'https://music.example.org'),
)
t('mpv song from the server', () =>
  assert.equal(
    isAllowedMpvUrl(
      'https://music.example.org/navidrome/rest/stream?id=1&u=a',
      'song',
      allowed,
    ),
    true,
  ),
)
t('mpv song from the local library server', () =>
  assert.equal(
    isAllowedMpvUrl('http://127.0.0.1:47470/rest/stream?id=x', 'song', allowed),
    true,
  ),
)
for (const url of [
  'https://attacker.invalid/a.mp3',
  'http://music.example.org/rest/stream?id=1', // http vs https: other origin
  'https://music.example.org:8443/rest/stream',
  'file:///etc/passwd',
  'av://lavfi:sine',
  'lavfi://sine',
  'memory://hello',
  'edl://file:///etc/passwd',
  '/home/user/Music/a.flac',
  'ytdl://x',
]) {
  t(`mpv song refused: ${url}`, () =>
    assert.equal(isAllowedMpvUrl(url, 'song', allowed), false),
  )
}
t('mpv song refused when no server is known', () =>
  assert.equal(
    isAllowedMpvUrl('https://music.example.org/rest/stream', 'song', ['', '']),
    false,
  ),
)
t('mpv radio/podcast: any http(s) host', () => {
  assert.equal(
    isAllowedMpvUrl('http://radio.example.net:8000/live', 'stream', allowed),
    true,
  )
  assert.equal(
    isAllowedMpvUrl('https://cdn.podcasts.example/ep1.mp3', 'stream', allowed),
    true,
  )
})
for (const url of [
  'file:///etc/passwd',
  'av://lavfi:sine',
  'memory://x',
  'C:\\x.mp3',
]) {
  t(`mpv radio/podcast refused: ${url}`, () =>
    assert.equal(isAllowedMpvUrl(url, 'stream', allowed), false),
  )
}

// ---------- sanitizer ----------

/** Parses HTML into a throwaway element and returns what the DOM holds. */
const render = (html) => {
  const d = document.createElement('div')
  d.innerHTML = html
  return d
}
const noActiveContent = (html) => {
  const d = render(html)
  for (const el of d.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      assert.ok(
        !/^on/i.test(attr.name),
        `event handler ${attr.name} on <${el.tagName}>`,
      )
      assert.ok(
        ['href', 'target', 'rel'].includes(attr.name),
        `attribute ${attr.name}`,
      )
    }
    assert.ok(
      ['A', 'BR', 'P', 'B', 'STRONG', 'I', 'EM'].includes(el.tagName),
      `tag <${el.tagName.toLowerCase()}> kept`,
    )
  }
  for (const a of d.querySelectorAll('a')) {
    assert.match(a.getAttribute('href'), /^(https?:|mailto:)/i)
  }
  return d
}

const attacks = {
  'img onerror': [
    'Liner notes <img src="x" onerror="document.title=\'CP-INJECTED\'">',
    'Liner notes ',
  ],
  'svg onload': [
    'before<svg onload="alert(1)"><circle r="1"/></svg>after',
    'beforeafter',
  ],
  'a javascript:': ['<a href="javascript:alert(1)">click me</a>', 'click me'],
  'a JavaScript: with entities': [
    '<a href="jav&#x09;ascript:alert(1)">x</a>',
    'x',
  ],
  'a data:': [
    '<a href="data:text/html,<script>alert(1)</script>">open</a>',
    'open',
  ],
  iframe: ['a<iframe src="https://attacker.invalid"></iframe>b', 'ab'],
  style: ['<style>body{display:none}</style>visible', 'visible'],
  script: ['<script>alert(1)</script>text', 'text'],
  'form/input': [
    '<form action="https://x"><input name="p" value="v"></form>ok',
    'ok',
  ],
  'object/embed': ['<object data="x.swf"></object><embed src="x">ok', 'ok'],
  'meta refresh': [
    '<meta http-equiv="refresh" content="0;url=https://x">ok',
    'ok',
  ],
  'base href': ['<base href="https://attacker.invalid/">ok', 'ok'],
  'link import': ['<link rel="stylesheet" href="https://x/a.css">ok', 'ok'],
  'b with onclick': [
    '<b onclick="alert(1)" style="color:red" class="x" data-x="1">bold</b>',
    'bold',
  ],
  'nested mXSS': [
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    '',
  ],
}
for (const [name, [input, text]] of Object.entries(attacks)) {
  t(`sanitizer: ${name}`, () => {
    const out = sanitizeHtml(input)
    const d = noActiveContent(out)
    assert.equal(d.textContent, text)
  })
}

t(
  'sanitizer: comment path (linkify, then sanitize) with injected markup',
  () => {
    const out = sanitizeHtml(
      linkifyText(
        '<p>Liner notes https://ok.example</p><img src="x" onerror="document.title=\'CP-INJECTED\'">',
      ),
    )
    const d = noActiveContent(out)
    assert.equal(d.textContent, 'Liner notes https://ok.example')
    assert.equal(d.querySelectorAll('a').length, 1)
    assert.equal(
      d.querySelector('a').getAttribute('href'),
      'https://ok.example',
    )
  },
)

t('sanitizer: allowed tags stay', () => {
  const out = sanitizeHtml(
    '<p>one <b>b</b> <strong>s</strong> <i>i</i> <em>e</em><br>two</p>',
  )
  assert.equal(
    out,
    '<p>one <b>b</b> <strong>s</strong> <i>i</i> <em>e</em><br>two</p>',
  )
})

t('sanitizer: http(s) links open outside, mailto as written', () => {
  const out = sanitizeHtml(
    '<a href="https://x.example" target="_self" rel="opener">x</a> <a href="mailto:a@b.c" target="_top">m</a>',
  )
  assert.equal(
    out,
    '<a href="https://x.example" target="_blank" rel="noreferrer nofollow">x</a> <a href="mailto:a@b.c">m</a>',
  )
})

t('sanitizer: relative and protocol-less links become text', () => {
  const out = sanitizeHtml(
    '<a href="/#/settings">s</a> <a href="//evil.example">e</a>',
  )
  assert.equal(out, 's e')
})

t('sanitizer: empty input', () => {
  assert.equal(sanitizeHtml(''), '')
  assert.equal(sanitizeHtml(null), '')
  assert.equal(sanitizeHtml(undefined), '')
})

// Rendered by v0.6.0 (linkifyText, no sanitizer); must not change.
const NORMAL_COMMENT =
  'Recorded live in Sofia, 2019.\nMore at https://example.com/live?a=1&b=2 and www.label.bg\n\nContact: info@label.bg\nThanks!'
const NORMAL_COMMENT_V060 =
  'Recorded live in Sofia, 2019.\nMore at <a href="https://example.com/live?a=1&amp;b=2" target="_blank" rel="noreferrer nofollow">https://example.com/live?a=1&amp;b=2</a> and <a href="http://www.label.bg" target="_blank" rel="noreferrer nofollow">www.label.bg</a>\n\nContact: <a href="mailto:info@label.bg">info@label.bg</a>\nThanks!'
t(
  'sanitizer: normal comment with links and line breaks renders as in 0.6.0',
  () => {
    assert.equal(
      render(sanitizeHtml(linkifyText(NORMAL_COMMENT))).innerHTML,
      NORMAL_COMMENT_V060,
    )
  },
)

// Rendered by v0.6.0's sanitizeLinks (a Last.fm bio as Navidrome sends it).
const BIO =
  'Ivo is a Bulgarian composer.<br><br>He studied in Plovdiv. <a href="https://www.last.fm/music/Ivo">Read more on Last.fm</a>. User-contributed text is available under the Creative Commons By-SA License; additional terms may apply.'
const BIO_V060 =
  'Ivo is a Bulgarian composer.<br><br>He studied in Plovdiv. <a href="https://www.last.fm/music/Ivo" target="_blank" rel="noreferrer nofollow">Read more on Last.fm</a>. User-contributed text is available under the Creative Commons By-SA License; additional terms may apply.'
t('sanitizer: normal Last.fm bio renders as in 0.6.0', () => {
  assert.equal(render(sanitizeHtml(BIO)).innerHTML, BIO_V060)
})

t('sanitizer rich profile: release notes keep headings and lists', () => {
  const out = sanitizeHtml(
    '<h3>Fixed</h3><ul><li>One <code>x</code></li></ul><img src=x onerror=alert(1)><script>1</script>',
    'rich',
  )
  assert.equal(out, '<h3>Fixed</h3><ul><li>One <code>x</code></li></ul>')
})

console.log(`\n${passed} passed, ${failed} failed`)
