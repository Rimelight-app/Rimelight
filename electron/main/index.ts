import { electronApp, optimizer, platform } from '@electron-toolkit/utils'
import { app } from 'electron'
import { initLocalLibrary } from './core/local-library'
import { createAppMenu } from './core/menu'
import { decideEngineAtLaunch } from './core/mpv/config'
import { mpvEngine } from './core/mpv/engine'
import { initAutoUpdater } from './core/updater'
import { createWindow, mainWindow } from './window'

export let isQuitting = false

const currentDesktop = process.env.XDG_CURRENT_DESKTOP ?? ''

if (platform.isLinux && currentDesktop.toLowerCase().includes('gnome')) {
  process.env.XDG_CURRENT_DESKTOP = 'Unity'
}

// The audio engine is fixed for the session (see core/mpv/config.ts).
decideEngineAtLaunch()

const instanceLock = app.requestSingleInstanceLock()

if (!instanceLock) {
  app.quit()
} else {
  createAppMenu()
  initLocalLibrary()

  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    } else if (!mainWindow.isVisible()) {
      mainWindow.show()
    }

    mainWindow.focus()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.tonihk00.clearplay')

    initAutoUpdater()
    createWindow()
  })

  app.on('activate', function () {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
      return
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    } else if (!mainWindow.isVisible()) {
      mainWindow.show()
    }

    mainWindow.focus()
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)

    window.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F11') {
        event.preventDefault()
      }
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  // Close mpv first (and give a held audio device back), at most 1.5 s.
  let mpvClosed = false
  app.on('will-quit', (event) => {
    if (mpvClosed) return
    event.preventDefault()
    mpvClosed = true
    // The quit already ran its events; app.exit finishes it once mpv is closed.
    Promise.race([
      mpvEngine.shutdown().catch(() => {}),
      new Promise((r) => setTimeout(r, 1500)),
    ]).finally(() => app.exit(0))
  })

  app.on('window-all-closed', () => {
    if (!platform.isMacOS) {
      app.quit()
    }
  })
}
