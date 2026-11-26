import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { is } from '@electron-toolkit/utils'
import { shell } from 'electron'
import { isSafeExternalUrl } from './safe-url'

/** The page the main window loads (see window.ts). */
export function appEntryUrl(): string {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    return process.env.ELECTRON_RENDERER_URL
  }
  return pathToFileURL(join(__dirname, '../renderer/index.html')).href
}

/** The only way the app opens a URL outside itself. */
export function openExternalIfSafe(url: string) {
  if (!isSafeExternalUrl(url)) {
    console.warn('[security] refused to open', String(url).slice(0, 200))
    return
  }
  shell.openExternal(url).catch(() => {})
}
