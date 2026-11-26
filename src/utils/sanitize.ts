import DOMPurify from 'dompurify'

/**
 * The one sanitizer for HTML that Rimelight didn't write itself: comments in
 * music files, artist and album bios from the server, podcast descriptions and
 * release notes. Only a few formatting tags survive; every other tag is
 * dropped and its text kept. Links keep only http, https and mailto targets
 * and always open outside the app (the main process checks them again).
 */

/** Comments and bios. */
const BASIC_TAGS = ['a', 'br', 'p', 'b', 'strong', 'i', 'em']

/** Release notes and podcast descriptions: also headings and lists. */
const RICH_TAGS = [
  ...BASIC_TAGS,
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'code',
  'pre',
  'blockquote',
  'hr',
  'u',
]

const SAFE_HREF = /^(?:https?:|mailto:)/i

export type SanitizeProfile = 'basic' | 'rich'

type Purifier = ReturnType<typeof DOMPurify>

let purifier: Purifier | null = null

function getPurifier(): Purifier {
  if (purifier) return purifier
  purifier = DOMPurify(window)
  purifier.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName !== 'A') return
    const href = (node.getAttribute('href') ?? '').trim()
    if (/^https?:/i.test(href)) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noreferrer nofollow')
    } else if (/^mailto:/i.test(href)) {
      // As linkifyText writes them; the main process hands them to the mail app.
      node.removeAttribute('target')
      node.removeAttribute('rel')
    } else {
      // Not a link we'd open: unwrapped to plain text below.
      node.removeAttribute('href')
      node.removeAttribute('target')
      node.removeAttribute('rel')
    }
  })
  return purifier
}

export function sanitizeHtml(
  html: string | null | undefined,
  profile: SanitizeProfile = 'basic',
): string {
  if (!html) return ''
  const fragment = getPurifier().sanitize(html, {
    ALLOWED_TAGS: profile === 'rich' ? RICH_TAGS : BASIC_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: SAFE_HREF,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  })
  for (const a of Array.from(fragment.querySelectorAll('a:not([href])'))) {
    a.replaceWith(...Array.from(a.childNodes))
  }
  const holder = fragment.ownerDocument.createElement('div')
  holder.append(fragment)
  return holder.innerHTML
}
