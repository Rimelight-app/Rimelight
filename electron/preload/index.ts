import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'
import {
  IClearPlayAPI,
  IpcChannels,
  MpvEventPayload,
  PlayerStateListenerActions,
} from './types'

// Custom APIs for renderer
const api: IClearPlayAPI = {
  enterFullScreen: () => ipcRenderer.send(IpcChannels.ToggleFullscreen, true),
  exitFullScreen: () => ipcRenderer.send(IpcChannels.ToggleFullscreen, false),
  isFullScreen: () => ipcRenderer.invoke(IpcChannels.IsFullScreen),
  fullscreenStatusListener: (func) => {
    ipcRenderer.on(IpcChannels.FullscreenStatus, (_, status: boolean) =>
      func(status),
    )
  },
  removeFullscreenStatusListener: () => {
    ipcRenderer.removeAllListeners(IpcChannels.FullscreenStatus)
  },
  isMaximized: () => ipcRenderer.invoke(IpcChannels.IsMaximized),
  maximizedStatusListener: (func) => {
    ipcRenderer.on(IpcChannels.MaximizedStatus, (_, status: boolean) =>
      func(status),
    )
  },
  removeMaximizedStatusListener: () => {
    ipcRenderer.removeAllListeners(IpcChannels.MaximizedStatus)
  },
  toggleMaximize: (isMaximized) =>
    ipcRenderer.send(IpcChannels.ToggleMaximize, isMaximized),
  toggleMinimize: () => ipcRenderer.send(IpcChannels.ToggleMinimize),
  closeWindow: () => ipcRenderer.send(IpcChannels.CloseWindow),
  setTitleBarOverlayColors: (color) =>
    ipcRenderer.send(IpcChannels.ThemeChanged, color),
  setNativeTheme: (isDark) =>
    ipcRenderer.send(IpcChannels.UpdateNativeTheme, isDark),
  downloadFile: (payload) =>
    ipcRenderer.send(IpcChannels.HandleDownloads, payload),
  downloadCompletedListener: (func) => {
    ipcRenderer.once(IpcChannels.DownloadCompleted, (_, fileId: string) =>
      func(fileId),
    )
  },
  downloadFailedListener: (func) => {
    ipcRenderer.once(IpcChannels.DownloadFailed, (_, fileId: string) =>
      func(fileId),
    )
  },
  updatePlayerState: (payload) => {
    ipcRenderer.send(IpcChannels.UpdatePlayerState, payload)
  },
  playerStateListener: (func) => {
    ipcRenderer.on(
      IpcChannels.PlayerStateListener,
      (_, state: PlayerStateListenerActions) => func(state),
    )
  },
  onFinishPlayback: (func) => {
    ipcRenderer.removeAllListeners(IpcChannels.FinishPlayback)
    ipcRenderer.on(IpcChannels.FinishPlayback, () => {
      func()
        .catch(() => {})
        .finally(() => ipcRenderer.send(IpcChannels.PlaybackFinished))
    })
  },
  saveAppSettings: (payload) => {
    ipcRenderer.send(IpcChannels.SaveAppSettings, payload)
  },
  checkForUpdates: () => ipcRenderer.invoke(IpcChannels.CheckForUpdates),
  downloadUpdate: () => ipcRenderer.send(IpcChannels.DownloadUpdate),
  quitAndInstall: () => ipcRenderer.send(IpcChannels.QuitAndInstall),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on(IpcChannels.UpdateAvailable, (_, info) => callback(info))
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on(IpcChannels.UpdateNotAvailable, () => callback())
  },
  onUpdateError: (callback) => {
    ipcRenderer.on(IpcChannels.UpdateError, (_, error) => callback(error))
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on(IpcChannels.DownloadProgress, (_, progress) =>
      callback(progress),
    )
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on(IpcChannels.UpdateDownloaded, (_, info) => callback(info))
  },
  localLibrary: {
    state: () => ipcRenderer.invoke(IpcChannels.LocalLibraryState),
    addFolder: () => ipcRenderer.invoke(IpcChannels.LocalLibraryAddFolder),
    addPath: (folder) =>
      ipcRenderer.invoke(IpcChannels.LocalLibraryAddPath, folder),
    removeFolder: (folder) =>
      ipcRenderer.invoke(IpcChannels.LocalLibraryRemoveFolder, folder),
    rescan: () => ipcRenderer.invoke(IpcChannels.LocalLibraryRescan),
    connect: () => ipcRenderer.invoke(IpcChannels.LocalLibraryConnect),
  },
  mpv: {
    status: () => ipcRenderer.invoke(IpcChannels.MpvStatus),
    setEngine: (engine) => ipcRenderer.invoke(IpcChannels.MpvSetEngine, engine),
    relaunch: () => ipcRenderer.send(IpcChannels.MpvRelaunch),
    devices: () => ipcRenderer.invoke(IpcChannels.MpvDevices),
    caps: (key, force) => ipcRenderer.invoke(IpcChannels.MpvCaps, key, force),
    load: (request) => ipcRenderer.invoke(IpcChannels.MpvLoad, request),
    setPause: (paused) => ipcRenderer.invoke(IpcChannels.MpvSetPause, paused),
    seek: (seconds) => ipcRenderer.invoke(IpcChannels.MpvSeek, seconds),
    stop: () => ipcRenderer.invoke(IpcChannels.MpvStop),
    setSoftVolume: (volume) =>
      ipcRenderer.invoke(IpcChannels.MpvSetSoftVolume, volume),
    setHwVolume: (key, percent) =>
      ipcRenderer.invoke(IpcChannels.MpvSetHwVolume, key, percent),
    setLoop: (loop) => ipcRenderer.invoke(IpcChannels.MpvSetLoop, loop),
    setSpeed: (speed) => ipcRenderer.invoke(IpcChannels.MpvSetSpeed, speed),
    onEvent: (func) => {
      const listener = (_: unknown, event: MpvEventPayload) => func(event)
      ipcRenderer.on(IpcChannels.MpvEvent, listener)
      return () => {
        ipcRenderer.removeListener(IpcChannels.MpvEvent, listener)
      }
    },
  },
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('envVars', {
      XDG_CURRENT_DESKTOP: process.env.XDG_CURRENT_DESKTOP,
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI
  // @ts-expect-error (define in dts)
  window.api = api
  // @ts-expect-error (define in dts)
  window.envVars = {
    XDG_CURRENT_DESKTOP: process.env.XDG_CURRENT_DESKTOP,
  }
}
