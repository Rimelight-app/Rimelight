import { BrowserWindow, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'
import { IpcChannels } from '../../preload/types'

const { autoUpdater } = electronUpdater

let updateWindow: BrowserWindow | null = null

export function setUpdaterWindow(window: BrowserWindow | null) {
  updateWindow = window
}

export function initAutoUpdater() {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.forceDevUpdateConfig = false

  // IPC Handlers
  ipcMain.handle(IpcChannels.CheckForUpdates, async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result) return null
      // Send plain data only: the full result also carries a cancellation
      // token and a download promise, which cannot cross IPC.
      return {
        isUpdateAvailable: result.isUpdateAvailable,
        updateInfo: result.updateInfo,
        versionInfo: result.versionInfo,
      }
    } catch (e) {
      console.error('Failed to check for updates:', e)
      return null
    }
  })

  ipcMain.on(IpcChannels.DownloadUpdate, () => {
    autoUpdater.downloadUpdate()
  })

  ipcMain.on(IpcChannels.QuitAndInstall, () => {
    autoUpdater.quitAndInstall()
  })

  // Updater Events
  autoUpdater.on('checking-for-update', () => {
    // Optional: notify renderer if needed
  })

  autoUpdater.on('update-available', (info) => {
    updateWindow?.webContents.send(IpcChannels.UpdateAvailable, info)
  })

  autoUpdater.on('update-not-available', () => {
    updateWindow?.webContents.send(IpcChannels.UpdateNotAvailable)
  })

  autoUpdater.on('error', (err) => {
    updateWindow?.webContents.send(IpcChannels.UpdateError, err.message)
  })

  autoUpdater.on('download-progress', (progressObj) => {
    updateWindow?.webContents.send(IpcChannels.DownloadProgress, progressObj)
  })

  autoUpdater.on('update-downloaded', (info) => {
    updateWindow?.webContents.send(IpcChannels.UpdateDownloaded, info)
  })
}
