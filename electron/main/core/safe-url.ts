/**
 * URL checks for the main process. Pure functions (no Electron imports), so
 * tools/dev-rig/security-unit.mjs can run them under plain Node.
 */

const EXTERNAL_SCHEMES = new Set(['https:', 'http:', 'mailto:'])

function parse(url: unknown): URL | null {
  if (typeof url !== 'string') return null
  // A URL with leading/trailing whitespace or control characters is not one
  // the app ever builds; refuse it instead of letting the parser trim it.
  if (url !== url.trim() || url.length === 0) return null
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * Links the app may hand to the operating system (default browser, mail app).
 * Everything else — file:, javascript:, data:, ms-settings:, smb:, custom
 * protocol handlers — is refused.
 */
export function isSafeExternalUrl(url: unknown): boolean {
  // The URL parser lower-cases the scheme and drops tabs and newlines inside
  // it, so "FILE:", "Java\tScript:" and the like end up as what they are.
  const parsed = parse(url)
  return parsed !== null && EXTERNAL_SCHEMES.has(parsed.protocol)
}

/**
 * True when `target` is the app's own page: the same file for a packaged
 * build (file://…/renderer/index.html, any hash or query), the same origin
 * for the dev server.
 */
export function isAppUrl(target: string, appEntry: string): boolean {
  const t = parse(target)
  const app = parse(appEntry)
  if (!t || !app) return false
  if (app.protocol === 'file:') {
    return (
      t.protocol === 'file:' &&
      t.host === app.host &&
      t.pathname === app.pathname
    )
  }
  return t.origin === app.origin
}

/** Origin of an http(s) URL, or '' for anything else. */
export function httpOrigin(url: string): string {
  const parsed = parse(url)
  if (!parsed) return ''
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
  return parsed.origin
}

export type MpvSourceKind = 'song' | 'stream'

/**
 * What mpv may open. Songs: only the current server and the local library
 * server. Internet radio and podcast episodes ("stream") live on other hosts
 * by design, so they only need http(s). Never local files or mpv's own
 * protocols (file:, av://, lavfi://, memory://, edl://, …).
 */
export function isAllowedMpvUrl(
  url: string,
  kind: MpvSourceKind,
  allowedOrigins: string[],
): boolean {
  const origin = httpOrigin(url)
  if (!origin) return false
  if (kind === 'stream') return true
  return allowedOrigins.some((o) => o !== '' && o === origin)
}
