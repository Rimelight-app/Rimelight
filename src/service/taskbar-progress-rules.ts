/**
 * Song progress on the Windows taskbar button. Pure (no imports):
 * tools/dev-rig/taskbar-unit.mjs runs it in Node.
 */

export type TaskbarMode = 'normal' | 'paused' | 'error' | 'none'

export type TaskbarInput = {
  state: 'playing' | 'paused' | 'stopped'
  positionMs: number
  /** 0 or NaN when unknown. */
  durationMs: number
  /** A song failed (playbackError), until the next song plays. */
  error: boolean
}

export type TaskbarProgress = {
  /** 0..1, or -1 to remove the bar. */
  progress: number
  mode: TaskbarMode
}

const REMOVE: TaskbarProgress = { progress: -1, mode: 'none' }

/**
 * Playing: position / duration, "normal" (green). Paused: same value,
 * "paused" (yellow). A failed song: "error" (red) until the next one plays.
 * Stopped, empty queue or unknown duration: removed. Buffering is just
 * "playing" with a position that doesn't move (never "indeterminate", which
 * would flicker on every song start).
 */
export function taskbarProgress(i: TaskbarInput): TaskbarProgress {
  const valid = Number.isFinite(i.durationMs) && i.durationMs > 0
  if (i.error) {
    const p = valid ? clamp(i.positionMs / i.durationMs) : 1
    return { progress: p, mode: 'error' }
  }
  if (i.state === 'stopped' || !valid) return REMOVE
  const progress = clamp(i.positionMs / i.durationMs)
  return { progress, mode: i.state === 'playing' ? 'normal' : 'paused' }
}

function clamp(x: number) {
  if (!Number.isFinite(x) || x < 0) return 0
  return x > 1 ? 1 : x
}

/** Steps the bar moves in: 0.5 % of the song. */
export const MIN_STEP = 0.005
/** At most one ordinary update per second. */
export const MIN_INTERVAL_MS = 1000

/**
 * Sends progress to the taskbar without flooding IPC: an ordinary update
 * goes out only when a second has passed AND the bar moved by 0.5 % (the
 * less frequent of the two); play, pause, seek, song change and error go out
 * at once; an unchanged value is never sent.
 */
export function createProgressThrottle(
  send: (p: TaskbarProgress) => void,
  now: () => number,
) {
  let last: TaskbarProgress | null = null
  let lastAt = Number.NEGATIVE_INFINITY
  return {
    update(p: TaskbarProgress, immediate = false) {
      if (last && last.mode === p.mode && last.progress === p.progress) return
      const modeChanged = !last || last.mode !== p.mode
      if (!immediate && !modeChanged) {
        const moved = Math.abs(p.progress - (last?.progress ?? 0))
        if (now() - lastAt < MIN_INTERVAL_MS || moved < MIN_STEP) return
      }
      last = p
      lastAt = now()
      send(p)
    },
    /** Forget what was sent (the next update always goes out). */
    reset() {
      last = null
      lastAt = Number.NEGATIVE_INFINITY
    },
  }
}
