/**
 * "Continue on other devices": the rules shared by ClearPlay desktop 0.6.0
 * and ClearPlay Android 1.6.0 (version 2, 2026-11-24).
 *
 * Pure functions only (no stores, no network, no clock of their own), so the
 * shared cases in tools/dev-rig/queue-handoff-cases.json run against them
 * directly, and the Android app ports them line by line to QueueHandoff.kt.
 * If a rule changes, change the cases file first, in both apps.
 */

/** The `c` parameter each ClearPlay app sends (Navidrome's changedBy / playerName). */
export const DESKTOP_APP = 'ClearPlay'
export const ANDROID_APP = 'ClearPlay-Android'

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

/** "ClearPlay desktop", "ClearPlay Android", or the client's own name. */
export function deviceName(client: string) {
  if (client === DESKTOP_APP) return 'ClearPlay desktop'
  if (client === ANDROID_APP) return 'ClearPlay Android'
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
 * Where Continue starts. If the device that saved the queue is still
 * playing (a Now Playing entry with the same user, playerName = changedBy and
 * state = playing): at its song and position, the song found in the saved
 * queue at or after the saved current index, else anywhere. Otherwise, or if
 * that song isn't in the queue: the saved current song and position.
 */
export function startPoint(
  queue: SavedQueue,
  username: string,
  nowPlaying: NowPlaying[],
) {
  const last = queue.entries.length - 1
  const saved = Math.min(Math.max(0, queue.currentIndex), last)
  const live = nowPlaying.find(
    (e) =>
      e.username === username &&
      e.playerName === queue.changedBy &&
      e.state === 'playing',
  )
  if (live) {
    let index = -1
    for (let i = saved; i <= last && index < 0; i++) {
      if (queue.entries[i].id === live.id) index = i
    }
    for (let i = 0; i < saved && index < 0; i++) {
      if (queue.entries[i].id === live.id) index = i
    }
    if (index >= 0) {
      return {
        playing: true,
        index,
        positionMs: Math.max(0, live.positionMs),
      }
    }
    return {
      playing: true,
      index: saved,
      positionMs: Math.max(0, queue.positionMs),
    }
  }
  return {
    playing: false,
    index: saved,
    positionMs: Math.max(0, queue.positionMs),
  }
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
  kind: 'playing' | 'paused'
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
  if (queue.changedBy === input.thisApp) return null
  if (!isLater(queue.changed, input.handledChanged)) return null
  if (input.playingHere) return null

  const start = startPoint(queue, input.username, input.nowPlaying)
  return {
    kind: start.playing ? 'playing' : 'paused',
    device: deviceName(queue.changedBy),
    song: queue.entries[start.index],
    index: start.index,
    positionMs: start.positionMs,
    changed: queue.changed,
  }
}

// ---------------------------------------------------------------- left behind

export interface LeftBehindInput {
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

/** "Continued on <device>": the other ClearPlay app is playing a song from this queue. */
export function leftBehind(input: LeftBehindInput) {
  if (!input.publishing || !input.playingHere || input.alreadyShown) return null
  const other = input.thisApp === DESKTOP_APP ? ANDROID_APP : DESKTOP_APP
  const ids = new Set(input.queueIds)
  const entry = input.nowPlaying.find(
    (e) =>
      e.username === input.username &&
      e.playerName === other &&
      e.state === 'playing' &&
      ids.has(e.id),
  )
  if (!entry) return null
  return { device: deviceName(other), song: entry.id }
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
