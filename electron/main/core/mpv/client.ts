import { ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

/**
 * A small client for mpv's JSON IPC protocol (DOCS/man/ipc.rst in mpv).
 * ClearPlay's own code: it starts one mpv process with --idle and talks to it
 * over a Unix socket (Linux) or a named pipe (Windows), one JSON object per
 * line. Replies are matched to requests by request_id; everything else is an
 * event ("property-change", "end-file", "log-message" ...).
 */

// Windows: mpv can't see ClearPlay go away, so the pid of the running mpv is
// kept on disk and a leftover one is stopped at the next start.
const pidFile = () => path.join(os.tmpdir(), 'clearplay-mpv.pid')

function rememberPid(pid: number) {
  try {
    writeFileSync(pidFile(), String(pid))
  } catch {
    // ignore
  }
}

function forgetPid() {
  try {
    unlinkSync(pidFile())
  } catch {
    // ignore
  }
}

/** Stops an mpv left running by a ClearPlay that crashed (Windows). */
export function stopLeftoverMpv() {
  if (process.platform !== 'win32') return
  try {
    const pid = Number(readFileSync(pidFile(), 'utf8'))
    if (pid > 0) {
      // Only if that pid is still an mpv (pids get reused).
      spawn(
        'taskkill',
        ['/F', '/PID', String(pid), '/FI', 'IMAGENAME eq mpv.exe'],
        {
          windowsHide: true,
          stdio: 'ignore',
        },
      ).on('error', () => {})
    }
  } catch {
    // no leftover
  }
  forgetPid()
}

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export type MpvEvent = {
  event: string
  name?: string
  data?: unknown
  id?: number
  reason?: string
  file_error?: string
  prefix?: string
  level?: string
  text?: string
}

export class MpvError extends Error {
  constructor(
    message: string,
    readonly command: unknown[],
  ) {
    super(message)
  }
}

export class MpvClient extends EventEmitter {
  private proc: ChildProcess | null = null
  private socket: net.Socket | null = null
  private buffer = ''
  private nextId = 1
  private pending = new Map<number, Pending>()
  private observed = new Map<string, number>()
  readonly socketPath: string

  constructor(
    private readonly binary: string,
    private readonly args: string[] = [],
  ) {
    super()
    const tag = `clearplay-mpv-${process.pid}-${Date.now().toString(36)}`
    this.socketPath =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\${tag}`
        : path.join(os.tmpdir(), `${tag}.sock`)
  }

  get running() {
    return this.proc !== null && this.socket !== null
  }

  async start(): Promise<void> {
    if (this.running) return
    // Linux/macOS: talk over an inherited socket (fd 3). mpv quits when it
    // closes, so it never outlives ClearPlay, even after a crash. Windows:
    // a named pipe (fd passing works differently there).
    const useFd = process.platform !== 'win32'
    if (!useFd) this.removeSocketFile()

    const proc = spawn(
      this.binary,
      [
        '--idle=yes',
        '--no-config',
        '--no-terminal',
        '--no-video',
        '--force-window=no',
        '--input-default-bindings=no',
        '--input-vo-keyboard=no',
        '--osc=no',
        '--ytdl=no',
        '--load-scripts=no',
        useFd
          ? '--input-ipc-client=fd://3'
          : `--input-ipc-server=${this.socketPath}`,
        ...this.args,
      ],
      {
        stdio: useFd
          ? ['ignore', 'ignore', 'pipe', 'pipe']
          : ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      },
    )
    this.proc = proc
    if (!useFd && proc.pid) rememberPid(proc.pid)
    // Never leave mpv playing after ClearPlay exits.
    const killOnExit = () => {
      try {
        proc.kill()
      } catch {
        // already gone
      }
    }
    process.once('exit', killOnExit)
    proc.once('exit', () => process.off('exit', killOnExit))
    let stderr = ''
    proc.stderr?.on('data', (d) => {
      stderr = (stderr + String(d)).slice(-2000)
    })

    const exited = new Promise<never>((_, reject) => {
      proc.once('error', (e) => reject(e))
      proc.once('exit', (code) =>
        reject(new Error(`mpv exited (${code}): ${stderr.trim()}`)),
      )
    })
    exited.catch(() => {})
    proc.once('exit', (code, signal) => {
      this.proc = null
      this.socket?.destroy()
      this.socket = null
      this.failAll(new Error('mpv stopped'))
      if (!useFd) {
        this.removeSocketFile()
        forgetPid()
      }
      this.emit('exit', { code, signal, stderr })
    })

    if (useFd) {
      const socket = proc.stdio[3] as net.Socket
      socket.setEncoding('utf8')
      socket.on('data', (chunk: string) => this.onData(chunk))
      socket.on('error', () => {})
      this.socket = socket
      // First reply proves mpv is up.
      await Promise.race([
        this.send(['get_property', 'mpv-version'], 8000),
        exited,
      ])
    } else {
      // The pipe appears a moment after the process starts.
      const connect = async () => {
        const deadline = Date.now() + 8000
        let lastError: unknown = null
        while (Date.now() < deadline) {
          try {
            this.socket = await this.connectOnce()
            return
          } catch (e) {
            lastError = e
            await new Promise((r) => setTimeout(r, 60))
          }
        }
        throw new Error(`could not connect to mpv: ${String(lastError)}`)
      }
      await Promise.race([connect(), exited])
    }

    // Re-observe properties after a restart.
    for (const [name, id] of this.observed) {
      this.send(['observe_property', id, name]).catch(() => {})
    }
  }

  private connectOnce(): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(this.socketPath)
      socket.setEncoding('utf8')
      socket.once('connect', () => {
        socket.off('error', reject)
        socket.on('data', (chunk: string) => this.onData(chunk))
        socket.on('error', () => {})
        socket.on('close', () => {
          if (this.socket === socket) this.socket = null
        })
        resolve(socket)
      })
      socket.once('error', reject)
    })
  }

  private onData(chunk: string) {
    this.buffer += chunk
    let nl = this.buffer.indexOf('\n')
    while (nl >= 0) {
      const line = this.buffer.slice(0, nl).trim()
      this.buffer = this.buffer.slice(nl + 1)
      nl = this.buffer.indexOf('\n')
      if (!line) continue
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(line)
      } catch {
        continue
      }
      if (typeof msg.request_id === 'number' && msg.request_id > 0) {
        const p = this.pending.get(msg.request_id)
        if (!p) continue
        this.pending.delete(msg.request_id)
        clearTimeout(p.timer)
        if (msg.error === 'success') p.resolve(msg.data)
        else p.reject(new Error(String(msg.error)))
        continue
      }
      if (typeof msg.event === 'string') {
        const ev = msg as unknown as MpvEvent
        if (ev.event === 'property-change' && ev.name) {
          this.emit('property', ev.name, ev.data)
        }
        this.emit('event', ev)
      }
    }
  }

  private failAll(error: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(error)
    }
    this.pending.clear()
  }

  send(command: unknown[], timeoutMs = 5000): Promise<unknown> {
    const socket = this.socket
    if (!socket) return Promise.reject(new MpvError('mpv not running', command))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new MpvError(`mpv timeout: ${command[0]}`, command))
      }, timeoutMs)
      this.pending.set(id, {
        resolve,
        reject: (e) => reject(new MpvError(e.message, command)),
        timer,
      })
      socket.write(`${JSON.stringify({ command, request_id: id })}\n`)
    })
  }

  command(...args: unknown[]) {
    return this.send(args)
  }

  get<T = unknown>(name: string): Promise<T> {
    return this.send(['get_property', name]) as Promise<T>
  }

  /** Like get(), but undefined instead of an error ("property unavailable"). */
  async tryGet<T = unknown>(name: string): Promise<T | undefined> {
    try {
      return (await this.get(name)) as T
    } catch {
      return undefined
    }
  }

  set(name: string, value: unknown) {
    return this.send(['set_property', name, value])
  }

  async observe(name: string) {
    if (this.observed.has(name)) return
    const id = this.observed.size + 1
    this.observed.set(name, id)
    if (this.socket) await this.send(['observe_property', id, name])
  }

  async stop() {
    const proc = this.proc
    if (!proc) return
    try {
      await this.send(['quit'], 1000)
    } catch {
      // already gone
    }
    await new Promise<void>((resolve) => {
      if (!this.proc) return resolve()
      const t = setTimeout(() => {
        proc.kill()
        resolve()
      }, 1500)
      proc.once('exit', () => {
        clearTimeout(t)
        resolve()
      })
    })
  }

  private removeSocketFile() {
    if (process.platform === 'win32') return
    try {
      if (existsSync(this.socketPath)) unlinkSync(this.socketPath)
    } catch {
      // ignore
    }
  }
}
