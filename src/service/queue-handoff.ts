/**
 * "Continue on other devices": the rules shared by Rimelight desktop and
 * Rimelight for Android (version 4, 2026-11-26). Up to desktop 0.6.1 and
 * Android 1.6.0 both apps were called ClearPlay; version 4 sends the new
 * names and still recognises the old ones, so a Rimelight app works with a
 * ClearPlay app that hasn't been updated yet.
 *
 * Pure functions only (no stores, no network, no clock of their own), so the
 * shared cases in tools/dev-rig/queue-handoff-cases.json run against them
 * directly, and the Android app ports them line by line to QueueHandoff.kt.
 * If a rule changes, change the cases file first, in both apps.
 */

/** The `c` parameter each app sends (Navidrome's changedBy / playerName). */
export const DESKTOP_APP = 'Rimelight'
export const ANDROID_APP = 'Rimelight-Android'

/**
 * The names the same two apps sent before the rename (ClearPlay desktop up to
 * 0.6.1, ClearPlay Android up to 1.6.0), with the app each one is now.
 */
export const LEGACY_NAMES: Readonly<Record<string, string>> = {
  ClearPlay: DESKTOP_APP,
  'ClearPlay-Android': ANDROID_APP,
}
const LEGACY_APPS = new Map(Object.entries(LEGACY_NAMES))

/** At most this many songs are saved, taken around the current song. */
export const MAX_SAVED = 1000
/** Of those, at most this many come before the current song. */
export const MAX_BEFORE = 100

/** Waits before saving, per event (ms). 0 = right away. */
export const SAVE_DELAY = {
  songChange: 4000,
  pause: 500,
  queueEdit: 4000,
  continued: 0,
  quit: 0,
  sleep: 0,
  lock: 0,
} as const

export type SaveEvent = keyof typeof SAVE_DELAY

/** A song in the local queue. `local`: it exists only on this device. */
export interface QueueSong {
  id: string
  local: boolean
}

/** The queue saved on the server (getPlayQueueByIndex, or getPlayQueue mapped to an index). */
export interface SavedQueue<S extends { id: string } = { id: string }> {
  entries: S[]
  /** 0-based. */
  currentIndex: number
  positionMs: number
  /** Server time, as the server sent it. */
  changed: string
  changedBy: string
}

/** One getNowPlaying entry (playbackReport fields). */
export interface NowPlaying {
  username: string
  playerName: string
  state: string
  positionMs: number
  /** The song's id. */
  id: string
}

// ---------------------------------------------------------------- names

/**
 * Which of the two apps a client name belongs to (DESKTOP_APP or
 * ANDROID_APP), under its new or its old name. Null for any other app.
 * Names are compared exactly (case and all).
 */
export function appOf(client: string | null | undefined) {
  if (!client) return null
  if (client === DESKTOP_APP || client === ANDROID_APP) return client
  return LEGACY_APPS.get(client) ?? null
}

/** The other app (old or new name): the only one whose Now Playing entry is trusted. */
export function isOtherApp(thisApp: string, client: string | null | undefined) {
  const app = appOf(client)
  return app !== null && app !== appOf(thisApp)
}

/** This app, under its new or its old name (a queue it saved before updating). */
export function isThisApp(thisApp: string, client: string | null | undefined) {
  const app = appOf(client)
  return app === null ? client === thisApp : app === appOf(thisApp)
}

/**
 * "Rimelight desktop", "Rimelight Android", "ClearPlay desktop",
 * "ClearPlay Android" (an app not updated yet), or the client's own name.
 */
export function deviceName(client: string) {
  if (client === DESKTOP_APP) return 'Rimelight desktop'
  if (client === ANDROID_APP) return 'Rimelight Android'
  if (client === 'ClearPlay') return 'ClearPlay desktop'
  if (client === 'ClearPlay-Android') return 'ClearPlay Android'
  return client
}

// ---------------------------------------------------------------- publish

/**
 * The part of the queue to save: songs that exist only on this device are
 * left out, then at most MAX_SAVED songs around the current one (up to
 * MAX_BEFORE before it, the rest after). Null when there is nothing to save:
 * empty queue, no current song, or the current song is local.
 */
export function saveWindow(songs: QueueSong[], currentIndex: number) {
  const current = songs[currentIndex]
  if (!current || current.local) return null

  const ids: string[] = []
  let index = -1
  for (let i = 0; i < songs.length; i++) {
    if (songs[i].local) continue
    if (i === currentIndex) index = ids.length
    ids.push(songs[i].id)
  }

  const before = Math.min(index, MAX_BEFORE)
  const start = index - before
  const end = Math.min(ids.length, start + MAX_SAVED)
  return { ids: ids.slice(start, end), currentIndex: before }
}

export interface SaveCheck {
  /** "Continue on other devices" is on. */
  enabled: boolean
  online: boolean
  queueLength: number
  /** The current song exists only on this device (or there is none). */
  currentIsLocal: boolean
  /** The "Continued on <device>" pill is showing. */
  leftBehindShowing: boolean
}

/** Whether to save now. Nothing is queued for later: the next event saves anyway. */
export function shouldSave(c: SaveCheck) {
  if (!c.enabled) return false
  if (!c.online) return false
  if (c.queueLength === 0) return false
  if (c.currentIsLocal) return false
  if (c.leftBehindShowing) return false
  return true
}

/**
 * One save per burst of events: each event replaces the waiting save with
 * its own delay (5 fast skips = 1 save, 4 s after the last). An event with
 * delay 0 saves right away and drops the waiting one.
 */
export function createSaveDebouncer(
  save: (event: SaveEvent) => void,
  setTimer: (fn: () => void, ms: number) => unknown,
  clearTimer: (timer: unknown) => void,
) {
  let timer: unknown = null
  const cancel = () => {
    if (timer !== null) clearTimer(timer)
    timer = null
  }
  return {
    event(event: SaveEvent) {
      cancel()
      const ms = SAVE_DELAY[event]
      if (ms === 0) {
        save(event)
        return
      }
      timer = setTimer(() => {
        timer = null
        save(event)
      }, ms)
    },
    cancel,
    get pending() {
      return timer !== null
    },
  }
}

/**
 * The song changed because the previous one played to its end (within 3 s),
 * not because of a skip. A natural change doesn't close "Continued on ...".
 */
export function isNaturalEnd(positionS: number, durationS: number) {
  return durationS > 0 && positionS >= durationS - 3
}

/** "Clear queue": only the playing song is left. Not saved. */
export function isQueueCleared(
  previousIds: string[],
  currentIds: string[],
  previousCurrentId: string | null,
) {
  return (
    previousIds.length > 1 &&
    currentIds.length === 1 &&
    currentIds[0] === previousCurrentId
  )
}

// ---------------------------------------------------------------- look

/** Server times are compared as instants, never with this device's clock. */
function instant(time: string | null | undefined) {
  if (!time) return Number.NaN
  return Date.parse(time)
}

/** a is later than b. */
export function isLater(a: string, b: string | null | undefined) {
  const x = instant(a)
  if (Number.isNaN(x)) return false
  const y = instant(b)
  if (Number.isNaN(y)) return true
  return x > y
}

/** The later of two server times (either may be missing). */
export function latestChanged(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  if (!a) return b ?? null
  if (!b) return a
  return isLater(a, b) ? a : b
}

/**
 * Where Continue starts, and what kind of offer it is.
 *
 * Saved by the other app: if it is in Now Playing (same user, a playerName
 * of the same app as changedBy, old or new name), start at that entry's song
 * and position, playing
 * or paused. The song is looked up in the saved queue: the first match at or
 * after the saved index, else the first match anywhere. This also finds the
 * right song when the server's index moved (a song before it was deleted).
 * Not in Now Playing, or its song isn't in the queue: the saved song and
 * position.
 *
 * Saved by any other app (or by this app): the saved song and position
 * ("saved"). Their Now Playing can't be read reliably.
 */
export function startPoint(
  queue: SavedQueue,
  thisApp: string,
  username: string,
  nowPlaying: NowPlaying[],
) {
  const last = queue.entries.length - 1
  const saved = Math.min(Math.max(0, queue.currentIndex), last)
  const savedPosition = Math.max(0, queue.positionMs)
  if (!isOtherApp(thisApp, queue.changedBy)) {
    return { kind: 'saved' as const, index: saved, positionMs: savedPosition }
  }
  const savedBy = appOf(queue.changedBy)
  const mine = nowPlaying.filter(
    (e) => e.username === username && appOf(e.playerName) === savedBy,
  )
  const live =
    mine.find((e) => e.state === 'playing') ??
    mine.find((e) => e.state === 'paused')
  if (!live) {
    return { kind: 'paused' as const, index: saved, positionMs: savedPosition }
  }
  const kind =
    live.state === 'playing' ? ('playing' as const) : ('paused' as const)
  let index = -1
  for (let i = saved; i <= last && index < 0; i++) {
    if (queue.entries[i].id === live.id) index = i
  }
  for (let i = 0; i < saved && index < 0; i++) {
    if (queue.entries[i].id === live.id) index = i
  }
  if (index < 0) return { kind, index: saved, positionMs: savedPosition }
  return { kind, index, positionMs: Math.max(0, live.positionMs) }
}

export interface OfferInput<S extends { id: string }> {
  /** This app's client name (DESKTOP_APP or ANDROID_APP). */
  thisApp: string
  username: string
  queue: SavedQueue<S> | null
  /** A `changed` copied from the server earlier, or null. */
  handledChanged: string | null
  playingHere: boolean
  nowPlaying: NowPlaying[]
}

export interface Offer<S extends { id: string } = { id: string }> {
  /**
   * playing: "Playing on <device> · <song>", Continue here.
   * paused: "Paused on <device> · <song> · <age>", Continue.
   * saved: "Saved by <app> · <song> · <age>", Continue.
   */
  kind: 'playing' | 'paused' | 'saved'
  device: string
  song: S
  index: number
  positionMs: number
  changed: string
}

/** The Continue offer, or null when none should be shown. */
export function offer<S extends { id: string }>(
  input: OfferInput<S>,
): Offer<S> | null {
  const { queue } = input
  if (!queue || queue.entries.length === 0) return null
  if (isThisApp(input.thisApp, queue.changedBy)) return null
  if (!isLater(queue.changed, input.handledChanged)) return null
  if (input.playingHere) return null

  const start = startPoint(
    queue,
    input.thisApp,
    input.username,
    input.nowPlaying,
  )
  return {
    kind: start.kind,
    device: deviceName(queue.changedBy),
    song: queue.entries[start.index],
    index: start.index,
    positionMs: start.positionMs,
    changed: queue.changed,
  }
}

// ---------------------------------------------------------------- left behind

export interface LeftBehindCandidateInput {
  /** "Continue on other devices" is on. */
  publishing: boolean
  playingHere: boolean
  thisApp: string
  username: string
  nowPlaying: NowPlaying[]
  /** Song ids in this device's queue. */
  queueIds: string[]
  /** Already shown since this device last saved. */
  alreadyShown: boolean
}

export interface LeftBehindInput extends LeftBehindCandidateInput {
  /** changedBy of the server's queue; null when it wasn't read. */
  serverChangedBy: string | null
}

/**
 * The other app (old or new name) is playing a song from this queue. Only
 * then is the server's queue read, to finish the check with leftBehind.
 */
export function leftBehindCandidate(input: LeftBehindCandidateInput) {
  if (!input.publishing || !input.playingHere || input.alreadyShown) return null
  const ids = new Set(input.queueIds)
  const entry = input.nowPlaying.find(
    (e) =>
      e.username === input.username &&
      isOtherApp(input.thisApp, e.playerName) &&
      e.state === 'playing' &&
      ids.has(e.id),
  )
  if (!entry) return null
  return { device: deviceName(entry.playerName), song: entry.id }
}

/**
 * "Continued on <device>": a candidate, and the other app (old or new name)
 * saved the server's queue last (it continued). If this device saved last, it is
 * the one that took over, and the other device is the one left behind.
 */
export function leftBehind(input: LeftBehindInput) {
  const found = leftBehindCandidate(input)
  if (!found) return null
  if (!isOtherApp(input.thisApp, input.serverChangedBy)) return null
  return found
}

// ---------------------------------------------------------------- age

export type Age =
  | { unit: 'justNow' }
  | { unit: 'minutes'; count: number }
  | { unit: 'hours'; count: number }
  | { unit: 'yesterday' }
  | { unit: 'date'; changed: string }

/**
 * How long ago the queue was saved, for display only: this device's clock
 * minus the server's `changed`. Under a minute (also when negative, i.e. the
 * clocks disagree) is "just now"; 24 to 48 hours is "yesterday"; older shows
 * the date of `changed`.
 */
export function ageText(changed: string, nowMs: number): Age {
  const ms = nowMs - instant(changed)
  if (Number.isNaN(ms) || ms < 60_000) return { unit: 'justNow' }
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return { unit: 'minutes', count: minutes }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { unit: 'hours', count: hours }
  if (hours < 48) return { unit: 'yesterday' }
  return { unit: 'date', changed }
}
