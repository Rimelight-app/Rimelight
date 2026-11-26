import { is, platform } from '@electron-toolkit/utils'
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  powerMonitor,
} from 'electron'
import {
  IpcChannels,
  OverlayColors,
  PlayerStatePayload,
  SaveQueueReason,
} from '../../preload/types'
import { isQuitting } from '../index'
import { tray, updateTray } from '../tray'
import { colorsState } from './colors'
import { updateDockMenu } from './dockMenu'
import { appEntryUrl, openExternalIfSafe } from './external'
import { playerState } from './playerState'
import { isAppUrl } from './safe-url'
import { getAppSetting, ISettingPayload, saveAppSettings } from './settings'
import { setTaskbarButtons } from './taskbar'
import { DEFAULT_TITLE_BAR_HEIGHT } from './titleBarOverlay'

export function setupEvents(window: BrowserWindow | null) {
  if (!window) return

  window.on('ready-to-show', async () => {
    window.show()
  })

  window.on('show', () => {
    setTaskbarButtons()
    updateTray()
    updateDockMenu()
  })

  window.on('hide', () => {
    updateTray()
  })

  window.webContents.once('did-finish-load', () => {
    nativeTheme.on('updated', () => {
      setTaskbarButtons()
    })
  })

  // Links never open inside the app: http(s) and mailto go to the system's
  // browser or mail app, anything else (file:, ms-settings:, …) is dropped.
  window.webContents.setWindowOpenHandler((details) => {
    openExternalIfSafe(details.url)
    return { action: 'deny' }
  })

  // The window only ever shows the app itself. A link or script that tries to
  // load another page into it is stopped (that page would get the preload
  // API); a safe link opens in the browser instead.
  const stayOnApp = (event: Electron.Event, url: string) => {
    if (isAppUrl(url, appEntryUrl())) return
    event.preventDefault()
    openExternalIfSafe(url)
  }
  window.webContents.on('will-navigate', (event) => stayOnApp(event, event.url))
  window.webContents.on('will-redirect', (event) => stayOnApp(event, event.url))

  window.on('enter-full-screen', () => {
    window.webContents.send(IpcChannels.FullscreenStatus, true)
  })

  window.on('leave-full-screen', () => {
    window.webContents.send(IpcChannels.FullscreenStatus, false)
  })

  window.on('maximize', () => {
    window.webContents.send(IpcChannels.MaximizedStatus, true)
  })

  window.on('unmaximize', () => {
    window.webContents.send(IpcChannels.MaximizedStatus, false)
  })

  // Before the window closes for good (quit, or closed without the tray), the
  // renderer tells the server that playback stopped. Waits at most 1.5 s.
  let playbackFinished = false
  window.on('close', (event) => {
    const closing = isQuitting || is.dev || !getAppSetting('minimizeToTray')
    if (closing && !playbackFinished) {
      playbackFinished = true
      event.preventDefault()
      finishPlayback(window).finally(() => {
        if (window.isDestroyed()) return
        if (isQuitting) app.quit()
        else window.close()
      })
      return
    }

    if (isQuitting) {
      if (tray && !tray.isDestroyed()) tray.destroy()
      return
    }

    if (is.dev || !getAppSetting('minimizeToTray')) {
      if (tray && !tray.isDestroyed()) tray.destroy()
      return
    }

    event.preventDefault()
    window.hide()
  })

  window.on('page-title-updated', (_, title) => {
    updateTray(title)
  })

  watchSleepAndLock(window)
}

let sleepWindow: BrowserWindow | null = null

/**
 * Queue handoff: on system sleep and screen lock the renderer saves the queue
 * right away. Electron has lock-screen on Windows and macOS only; on Linux
 * only sleep is seen.
 */
function watchSleepAndLock(window: BrowserWindow) {
  const first = sleepWindow === null
  sleepWindow = window
  if (!first) return
  const ask = (reason: SaveQueueReason) => {
    const target = sleepWindow
    if (!target || target.isDestroyed() || target.webContents.isDestroyed())
      return
    target.webContents.send(IpcChannels.SaveQueueNow, reason)
  }
  powerMonitor.on('suspend', () => ask('sleep'))
  powerMonitor.on('lock-screen', () => ask('lock'))
}

/** Asks the renderer to report "stopped" and waits for it (1.5 s at most). */
function finishPlayback(window: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    const contents = window.webContents
    const done = () => {
      clearTimeout(timer)
      ipcMain.removeListener(IpcChannels.PlaybackFinished, onFinished)
      resolve()
    }
    const onFinished = (event: Electron.IpcMainEvent) => {
      if (event.sender === contents) done()
    }
    const timer = setTimeout(done, 1500)
    ipcMain.on(IpcChannels.PlaybackFinished, onFinished)
    if (contents.isDestroyed() || contents.isCrashed()) done()
    else contents.send(IpcChannels.FinishPlayback)
  })
}

function resetIpcEvents() {
  const eventsToReset = [
    IpcChannels.ToggleFullscreen,
    IpcChannels.ToggleMaximize,
    IpcChannels.ToggleMinimize,
    IpcChannels.CloseWindow,
    IpcChannels.ThemeChanged,
    IpcChannels.UpdateNativeTheme,
    IpcChannels.UpdatePlayerState,
    IpcChannels.SetTaskbarProgress,
    IpcChannels.SaveAppSettings,
    IpcChannels.MpvRelaunch,
  ]

  eventsToReset.forEach((event) => ipcMain.removeAllListeners(event))
}

export function setupIpcEvents(window: BrowserWindow | null) {
  if (!window) return

  resetIpcEvents()

  // Taskbar button progress (Windows). On Linux Electron 42 only has it
  // through libunity; that comes with a later Electron.
  ipcMain.on(
    IpcChannels.SetTaskbarProgress,
    (_, progress: unknown, mode: unknown) => {
      if (!platform.isWindows || window.isDestroyed()) return
      const p =
        typeof progress === 'number' && Number.isFinite(progress)
          ? progress
          : -1
      const m =
        mode === 'normal' || mode === 'paused' || mode === 'error'
          ? mode
          : 'none'
      window.setProgressBar(p < 0 ? -1 : Math.min(1, p), { mode: m })
    },
  )

  ipcMain.on(IpcChannels.ToggleFullscreen, (_, isFullscreen: boolean) => {
    window.setFullScreen(isFullscreen)
  })

  ipcMain.removeHandler(IpcChannels.IsFullScreen)
  ipcMain.handle(IpcChannels.IsFullScreen, () => {
    return window.isFullScreen()
  })

  ipcMain.removeHandler(IpcChannels.IsMaximized)
  ipcMain.handle(IpcChannels.IsMaximized, () => {
    return window.isMaximized()
  })

  ipcMain.on(IpcChannels.ToggleMaximize, (_, isMaximized: boolean) => {
    if (isMaximized) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  })

  ipcMain.on(IpcChannels.ToggleMinimize, () => {
    window.minimize()
  })

  ipcMain.on(IpcChannels.CloseWindow, () => {
    window.close()
  })

  ipcMain.on(IpcChannels.ThemeChanged, (_, colors: OverlayColors) => {
    const { color, symbol, bgColor } = colors

    if (bgColor) {
      colorsState.set('bgColor', bgColor)
    }

    if (platform.isMacOS || platform.isLinux) return

    window.setTitleBarOverlay({
      color,
      height: DEFAULT_TITLE_BAR_HEIGHT,
      symbolColor: symbol,
    })
  })

  ipcMain.on(IpcChannels.UpdateNativeTheme, (_, isDark: boolean) => {
    nativeTheme.themeSource = isDark ? 'dark' : 'light'
  })

  ipcMain.on(
    IpcChannels.UpdatePlayerState,
    (_, payload: PlayerStatePayload) => {
      playerState.setAll(payload)

      setTimeout(() => {
        setTaskbarButtons()
        updateTray()
        updateDockMenu()
      }, 150)
    },
  )

  ipcMain.on(IpcChannels.SaveAppSettings, (_, payload: ISettingPayload) => {
    saveAppSettings(payload)
  })

  // Switching the audio engine needs a fresh start (see core/mpv/config.ts).
  ipcMain.on(IpcChannels.MpvRelaunch, () => {
    app.relaunch()
    app.quit()
  })
}
