import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannels, LocalLibraryState } from '../../../preload/types'
import { Library } from './library'
import { createLocalServer, LOCAL_USER } from './server'

interface Config {
  folders: string[]
  password: string
  port: number
}

const DEFAULT_PORT = 47470

let config: Config | null = null
let library: Library | null = null
let server: ReturnType<typeof createLocalServer> | null = null
let port = 0

const dir = () => path.join(app.getPath('userData'), 'local-library')
const configFile = () => path.join(dir(), 'config.json')

async function loadConfig(): Promise<Config> {
  if (config) return config
  try {
    config = JSON.parse(await fs.readFile(configFile(), 'utf8')) as Config
  } catch {
    config = { folders: [], password: '', port: DEFAULT_PORT }
  }
  if (!config.password) config.password = randomBytes(18).toString('hex')
  config.folders ??= []
  return config
}

async function saveConfig() {
  if (!config) return
  await fs.mkdir(dir(), { recursive: true })
  await fs.writeFile(configFile(), JSON.stringify(config, null, 2))
}

async function getLibrary() {
  if (!library) {
    library = new Library(dir())
    await library.load()
  }
  return library
}

function listen(srv: NonNullable<typeof server>, wanted: number) {
  return new Promise<number>((resolve, reject) => {
    const onError = (e: NodeJS.ErrnoException) => {
      srv.off('listening', onListening)
      if (e.code === 'EADDRINUSE' && wanted !== 0) {
        // Taken by something else: let the system pick a free port.
        listen(srv, 0).then(resolve, reject)
      } else reject(e)
    }
    const onListening = () => {
      srv.off('error', onError)
      resolve((srv.address() as AddressInfo).port)
    }
    srv.once('error', onError)
    srv.once('listening', onListening)
    srv.listen(wanted, '127.0.0.1')
  })
}

async function ensureServer() {
  const cfg = await loadConfig()
  const lib = await getLibrary()
  if (!server) {
    server = createLocalServer(
      lib,
      () => cfg.password,
      () => {
        rescan()
      },
    )
    port = await listen(server, cfg.port || DEFAULT_PORT)
    if (port !== cfg.port) {
      cfg.port = port
      await saveConfig()
    }
  }
  return {
    url: `http://127.0.0.1:${port}`,
    username: LOCAL_USER,
    password: cfg.password,
  }
}

function rescan() {
  const cfg = config
  if (!cfg || !library) return
  library.scan(cfg.folders).catch(() => undefined)
}

/** Origin of the local library server, '' while it isn't running. */
export function localLibraryOrigin(): string {
  return server && port ? `http://127.0.0.1:${port}` : ''
}

async function state(): Promise<LocalLibraryState> {
  const cfg = await loadConfig()
  const lib = await getLibrary()
  return {
    folders: cfg.folders,
    running: Boolean(server),
    url: server ? `http://127.0.0.1:${port}` : '',
    scanning: lib.scanning,
    scanned: lib.scanned,
    tracks: lib.tracks.size,
    albums: lib.albums.size,
  }
}

export function initLocalLibrary() {
  ipcMain.handle(IpcChannels.LocalLibraryState, () => state())

  ipcMain.handle(IpcChannels.LocalLibraryAddFolder, async (event) => {
    const cfg = await loadConfig()
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      properties: ['openDirectory', 'multiSelections'],
    })
    if (!result.canceled) {
      for (const folder of result.filePaths) {
        if (!cfg.folders.includes(folder)) cfg.folders.push(folder)
      }
      await saveConfig()
      await ensureServer()
      rescan()
    }
    return state()
  })

  // Used by the automated tests (no file dialog there).
  ipcMain.handle(IpcChannels.LocalLibraryAddPath, async (_, folder: string) => {
    if (process.env.CLEARPLAY_E2E !== '1') return state()
    const cfg = await loadConfig()
    if (typeof folder === 'string' && folder && !cfg.folders.includes(folder)) {
      cfg.folders.push(folder)
      await saveConfig()
    }
    await ensureServer()
    rescan()
    return state()
  })

  ipcMain.handle(
    IpcChannels.LocalLibraryRemoveFolder,
    async (_, folder: string) => {
      const cfg = await loadConfig()
      cfg.folders = cfg.folders.filter((f) => f !== folder)
      await saveConfig()
      rescan()
      return state()
    },
  )

  ipcMain.handle(IpcChannels.LocalLibraryRescan, async () => {
    rescan()
    return state()
  })

  ipcMain.handle(IpcChannels.LocalLibraryConnect, () => ensureServer())

  // Start serving straight away when folders were added before, so a saved
  // "This computer" server works from the first request, then refresh the
  // index in the background (only new or changed files are read).
  app.whenReady().then(async () => {
    const cfg = await loadConfig()
    if (!cfg.folders.length) return
    await ensureServer()
    rescan()
  })

  app.on('before-quit', () => {
    library?.flush().catch(() => undefined)
  })
}
