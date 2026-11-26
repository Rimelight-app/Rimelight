import {
  type ProgressInfo,
  type UpdateCheckResult,
  type UpdateDownloadedEvent,
  type UpdateInfo,
} from 'electron-updater'
import { IDownloadPayload } from '../main/core/downloads'
import { ISettingPayload } from '../main/core/settings'

export enum IpcChannels {
  FullscreenStatus = 'fullscreen-status',
  ToggleFullscreen = 'toggle-fullscreen',
  IsFullScreen = 'is-fullscreen',
  IsMaximized = 'is-maximized',
  MaximizedStatus = 'maximized-status',
  ToggleMaximize = 'toggle-maximize',
  ToggleMinimize = 'toggle-minimize',
  CloseWindow = 'close-window',
  ThemeChanged = 'theme-changed',
  UpdateNativeTheme = 'update-native-theme',
  HandleDownloads = 'handle-downloads',
  DownloadCompleted = 'download-completed',
  DownloadFailed = 'download-failed',
  UpdatePlayerState = 'update-player-state',
  PlayerStateListener = 'player-state-listener',
  SaveAppSettings = 'save-app-settings',
  CheckForUpdates = 'check-for-updates',
  DownloadUpdate = 'download-update',
  QuitAndInstall = 'quit-and-install',
  UpdateAvailable = 'update-available',
  UpdateNotAvailable = 'update-not-available',
  UpdateError = 'update-error',
  DownloadProgress = 'download-progress',
  UpdateDownloaded = 'update-downloaded',
  LocalLibraryState = 'local-library-state',
  LocalLibraryAddFolder = 'local-library-add-folder',
  LocalLibraryAddPath = 'local-library-add-path',
  LocalLibraryRemoveFolder = 'local-library-remove-folder',
  LocalLibraryRescan = 'local-library-rescan',
  LocalLibraryConnect = 'local-library-connect',
  MpvStatus = 'mpv-status',
  MpvSetEngine = 'mpv-set-engine',
  MpvRelaunch = 'mpv-relaunch',
  MpvDevices = 'mpv-devices',
  MpvCaps = 'mpv-caps',
  MpvLoad = 'mpv-load',
  MpvSetServerUrl = 'mpv-set-server-url',
  MpvSetPause = 'mpv-set-pause',
  MpvSeek = 'mpv-seek',
  MpvStop = 'mpv-stop',
  MpvSetSoftVolume = 'mpv-set-soft-volume',
  MpvSetHwVolume = 'mpv-set-hw-volume',
  MpvSetLoop = 'mpv-set-loop',
  MpvSetSpeed = 'mpv-set-speed',
  MpvEvent = 'mpv-event',
  FinishPlayback = 'finish-playback',
  PlaybackFinished = 'playback-finished',
  SaveQueueNow = 'save-queue-now',
}

/** Why the main process asks for the queue to be saved right away. */
export type SaveQueueReason = 'sleep' | 'lock'

/** "builtin" = Chromium's audio (EQ, visualizer...); "mpv" = bit-perfect. */
export type AudioEngine = 'builtin' | 'mpv'

export type MpvEngineStatus = {
  /** Engine this session runs with (decided at launch). */
  sessionEngine: AudioEngine
  /** Engine chosen in Settings (used from the next launch). */
  savedEngine: AudioEngine
  available: boolean
  version: string | null
  binary: string | null
  /** Why mpv can't be used, in plain words. */
  problem: string | null
  platform: 'linux' | 'win32' | 'darwin' | 'other'
}

/**
 * exclusive: ClearPlay can hold the device alone (ALSA hw on Linux, WASAPI
 * exclusive on Windows). bluetooth: re-encoded by Bluetooth. shared: the
 * system mixer.
 */
export type MpvDeviceKind = 'exclusive' | 'bluetooth' | 'shared'

export type MpvDevice = {
  /** Stable id, saved in settings. "system" = the system default. */
  key: string
  name: string
  kind: MpvDeviceKind
  /** e.g. "USB · full speed", "HDMI". */
  detail: string
}

export type MpvDeviceCaps = {
  rates: number[]
  depths: number[]
  /** null = not known yet (Windows learns it when the device first opens). */
  hwVolume: boolean | null
  /** Mixer control used for the hardware volume (Linux). */
  volumeControl: string | null
  /** Where the rates come from. */
  source: 'kernel' | 'probe' | 'none'
}

export type MpvLoadRequest = {
  url: string
  /**
   * 'song': must come from the current server or the local library server.
   * 'stream': internet radio or a podcast episode (any http(s) host).
   */
  kind: 'song' | 'stream'
  /** Seconds to start at. */
  start: number
  paused: boolean
  deviceKey: string
  /** Output rate to convert to; 0 = the song's own rate. */
  samplerate: number
  /** mpv's own volume, 0-100 (100 = untouched). */
  softVolume: number
  /** Hardware volume to set before sound starts, in percent; null = leave. */
  hwVolume: number | null
  /** Set the hardware volume to about -40 dB first (new device). */
  quietStart: boolean
  loop: boolean
  speed: number
}

export type MpvAudioParams = {
  rate: number
  format: string
  channels: number
  /** Bits the device runs at (Linux: from the kernel), 0 if unknown. */
  bits: number
}

export type MpvOutputState = {
  deviceKey: string
  deviceName: string
  /** ClearPlay holds the device alone. */
  exclusive: boolean
  /** Why it fell back to normal (shared) playback. */
  fallback: null | 'busy' | 'refused'
  bluetooth: boolean
  /** The decoded song. */
  source: MpvAudioParams | null
  /** What the device receives. */
  output: MpvAudioParams | null
  /** The rate ClearPlay asked for (0 = the song's own). */
  requestedRate: number
  softVolume: number
  /** The device has a hardware volume control (null = unknown). */
  hwVolume: boolean | null
  /** Current hardware level in percent, if any. */
  hwLevel: number | null
  hwDb: number | null
}

export type MpvEventPayload =
  | { type: 'time'; time: number }
  | { type: 'duration'; duration: number }
  | { type: 'pause'; paused: boolean }
  | { type: 'loaded'; token: number }
  | { type: 'ended' }
  | { type: 'error'; message: string }
  | { type: 'output'; output: MpvOutputState }
  | { type: 'caps'; key: string; caps: MpvDeviceCaps }
  | { type: 'devices' }
  /** The device was let go (e.g. to check it); load again to continue. */
  | { type: 'released' }
  | { type: 'exit' }

/** Music folders on this computer, served to the app like a server. */
export type LocalLibraryState = {
  folders: string[]
  running: boolean
  url: string
  scanning: boolean
  scanned: number
  tracks: number
  albums: number
}

export type LocalLibraryConnection = {
  url: string
  username: string
  password: string
}

export type OverlayColors = {
  color: string
  symbol: string
  bgColor: string
}

export type PlayerStatePayload = {
  isPlaying: boolean
  hasPrevious: boolean
  hasNext: boolean
  hasSonglist: boolean
}

export type PlayerStateListenerActions =
  | 'togglePlayPause'
  | 'skipBackwards'
  | 'skipForward'
  | 'toggleShuffle'
  | 'toggleRepeat'

export interface IClearPlayAPI {
  enterFullScreen: () => void
  exitFullScreen: () => void
  isFullScreen: () => Promise<boolean>
  fullscreenStatusListener: (func: (status: boolean) => void) => void
  removeFullscreenStatusListener: () => void
  isMaximized: () => Promise<boolean>
  maximizedStatusListener: (func: (status: boolean) => void) => void
  removeMaximizedStatusListener: () => void
  toggleMaximize: (isMaximized: boolean) => void
  toggleMinimize: () => void
  closeWindow: () => void
  setTitleBarOverlayColors: (colors: OverlayColors) => void
  setNativeTheme: (isDark: boolean) => void
  downloadFile: (payload: IDownloadPayload) => void
  downloadCompletedListener: (func: (fileId: string) => void) => void
  downloadFailedListener: (func: (fileId: string) => void) => void
  updatePlayerState: (payload: PlayerStatePayload) => void
  playerStateListener: (
    func: (action: PlayerStateListenerActions) => void,
  ) => void
  /** Runs before the window closes for good (quit), then lets it close. */
  onFinishPlayback: (func: () => Promise<void>) => void
  /** System sleep or screen lock: save the queue now (queue handoff). */
  onSaveQueueNow: (func: (reason: SaveQueueReason) => void) => void
  saveAppSettings: (payload: ISettingPayload) => void
  checkForUpdates: () => Promise<UpdateCheckResult | null>
  downloadUpdate: () => void
  quitAndInstall: () => void
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void
  onUpdateNotAvailable: (callback: () => void) => void
  onUpdateError: (callback: (error: string) => void) => void
  onDownloadProgress: (callback: (progress: ProgressInfo) => void) => void
  onUpdateDownloaded: (callback: (info: UpdateDownloadedEvent) => void) => void
  localLibrary: {
    state: () => Promise<LocalLibraryState>
    addFolder: () => Promise<LocalLibraryState>
    addPath: (folder: string) => Promise<LocalLibraryState>
    removeFolder: (folder: string) => Promise<LocalLibraryState>
    rescan: () => Promise<LocalLibraryState>
    connect: () => Promise<LocalLibraryConnection>
  }
  mpv: {
    status: () => Promise<MpvEngineStatus>
    setEngine: (engine: AudioEngine) => Promise<MpvEngineStatus>
    relaunch: () => void
    devices: () => Promise<MpvDevice[]>
    caps: (key: string, force?: boolean) => Promise<MpvDeviceCaps | null>
    /** Resolves with a token that the "loaded" event repeats. */
    load: (request: MpvLoadRequest) => Promise<number>
    /** The server songs come from; mpv refuses songs from anywhere else. */
    setServerUrl: (url: string) => void
    setPause: (paused: boolean) => Promise<void>
    seek: (seconds: number) => Promise<void>
    stop: () => Promise<void>
    setSoftVolume: (volume: number) => Promise<void>
    setHwVolume: (key: string, percent: number) => Promise<number | null>
    setLoop: (loop: boolean) => Promise<void>
    setSpeed: (speed: number) => Promise<void>
    onEvent: (func: (event: MpvEventPayload) => void) => () => void
  }
}
