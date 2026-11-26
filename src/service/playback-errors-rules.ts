/**
 * What to do when a song can't be played (both audio engines). Pure rules,
 * no imports, so tools/dev-rig/playback-errors-unit.mjs runs them in Node.
 */

/** Failed songs in a row before playback stops. */
export const MAX_FAILURES_IN_A_ROW = 3

export type ErrorDecision =
  /** The server can't be reached: pause on this song, don't skip. */
  | 'offline'
  /** First failure of this song: load it once more. */
  | 'retry'
  /** Failed again: tell the user and go to the next song. */
  | 'skip'
  /** Failed again and it was the last song: stop there, keep the queue. */
  | 'stopAtEnd'
  /** Too many failures in a row: stop. */
  | 'stopLimit'

export type ErrorSituation = {
  /** False when the server (not the local library) can't be reached. */
  reachable: boolean
  /** Times this song was already retried (0 or 1). */
  retries: number
  /** Songs that failed (after their retry) in a row before this one. */
  failuresInARow: number
  /** A next song exists (or the queue repeats). */
  hasNext: boolean
}

export function decideOnError(s: ErrorSituation): ErrorDecision {
  if (!s.reachable) return 'offline'
  if (s.retries < 1) return 'retry'
  if (s.failuresInARow + 1 >= MAX_FAILURES_IN_A_ROW) return 'stopLimit'
  if (!s.hasNext) return 'stopAtEnd'
  return 'skip'
}

/** Delays before each new reachability check while the server is away. */
export function retryDelayMs(attempt: number): number {
  const steps = [5_000, 15_000, 30_000]
  return attempt < steps.length ? steps[attempt] : 60_000
}

export type PageErrorKind = 'notFound' | 'server' | 'auth'

/**
 * How a failed page load looks to the user. `status` is the HTTP status (0
 * when the request never got an answer), `subsonicCode` the code of a
 * Subsonic "failed" answer, `badBody` when the answer wasn't valid JSON.
 */
export function classifyPageError(e: {
  status?: number
  subsonicCode?: number | null
  badBody?: boolean
}): PageErrorKind {
  if (e.subsonicCode === 70) return 'notFound'
  if (e.subsonicCode === 40 || e.subsonicCode === 41 || e.subsonicCode === 44)
    return 'auth'
  if (e.subsonicCode != null) return 'server'
  if (e.badBody) return 'server'
  if (e.status === 404) return 'notFound'
  if (e.status === 401 || e.status === 403) return 'auth'
  return 'server'
}
