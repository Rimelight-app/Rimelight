import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/**
 * The app was called ClearPlay up to 0.6.1. Electron names the data folder
 * after the app, so after the rename it would look in "Rimelight" and start
 * empty: no servers, settings, queue or local library. On the first launch
 * as Rimelight, move the old folder to the new name.
 *
 * If the move can't happen (ClearPlay still running, a file locked on
 * Windows, something unexpected already called Rimelight), use the old folder
 * for this session and try again on the next start. Nothing is ever deleted
 * except an empty folder.
 *
 * Imported first in main/index.ts: every store and the single-instance lock
 * read the data folder, so this must run before any of them.
 */
const LEGACY_NAME = 'ClearPlay'

/** Folders that hold the user's data (renderer storage and the main stores). */
const DATA_ENTRIES = ['Local Storage', 'IndexedDB', 'store', 'local-library']

function hasData(dir: string) {
  return DATA_ENTRIES.some((name) => fs.existsSync(path.join(dir, name)))
}

function migrate() {
  const current = app.getPath('userData')
  const legacy = path.join(app.getPath('appData'), LEGACY_NAME)

  if (path.resolve(current) === path.resolve(legacy)) return
  if (!fs.existsSync(legacy) || !hasData(legacy)) return

  if (fs.existsSync(current)) {
    // Already moved, or a fresh Rimelight install that has its own data.
    if (hasData(current)) return

    if (fs.readdirSync(current).length > 0) {
      app.setPath('userData', legacy)
      return
    }

    fs.rmdirSync(current)
  }

  fs.renameSync(legacy, current)
}

// Runs before anything else in the app, so it must never throw: on any error
// keep the user's data by using the ClearPlay folder for this session.
try {
  migrate()
} catch (error) {
  console.warn('[migrate-user-data] using the ClearPlay folder:', error)
  const legacy = path.join(app.getPath('appData'), LEGACY_NAME)
  if (fs.existsSync(legacy)) app.setPath('userData', legacy)
}
