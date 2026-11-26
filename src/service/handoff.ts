import { useAppStore } from '@/store/app.store'
import { useHandoffStore } from '@/store/handoff.store'
import { usePlayerStore } from '@/store/player.store'
import { useRimelightSettings } from '@/store/rimelight-settings.store'
import { logger } from '@/utils/logger'
import { isUsingLocalLibrary } from './local-library'
import {
  createSaveDebouncer,
  DESKTOP_APP,
  latestChanged,
  leftBehind,
  leftBehindCandidate,
  offer,
  SaveEvent,
  shouldSave,
} from './queue-handoff'
import { localQueue, queueSync } from './queue-sync'

/**
 * "Continue on other devices" at run time: when to save the queue, when to
 * look at the server's, the Continue offer and "Continued on <device>". The
 * rules themselves are in queue-handoff.ts (shared with Rimelight for Android).
 */

const serverKey = () => {
  const { url, username } = useAppStore.getState().data
  return `${username}@${url}`
}

const isPlayingHere = () => usePlayerStore.getState().playerState.isPlaying

/**
 * Something happened here since the last save (an event, or Play). Quit,
 * sleep and lock only save when it is set, when playing, or when a save is
 * waiting: an untouched, paused desktop must not overwrite a newer queue
 * saved by the phone. Same guard as ClearPlay Android 1.6.0's Handoff.kt.
 */
let dirty = false

function storedHandled() {
  return useRimelightSettings.getState().handledChanged[serverKey()] ?? null
}

/**
 * This device has dealt with the server's queue up to `changed` (Continue,
 * ×, or playback started here). Only ever a value from the server.
 */
function markHandled(changed?: string | null) {
  const value = latestChanged(
    latestChanged(storedHandled(), useHandoffStore.getState().latestChanged),
    changed,
  )
  if (!value || value === storedHandled()) return
  const { handledChanged, set } = useRimelightSettings.getState()
  set({ handledChanged: { ...handledChanged, [serverKey()]: value } })
}

// ---------------------------------------------------------------- publish

function saveCheck() {
  const { songs, currentIndex } = localQueue()
  const current = songs[currentIndex]
  return {
    enabled: useRimelightSettings.getState().syncQueue,
    online: navigator.onLine !== false,
    queueLength: songs.length,
    currentIsLocal: !current || current.local,
    leftBehindShowing: useHandoffStore.getState().leftBehind !== null,
  }
}

async function save(event: SaveEvent, keepalive = false) {
  if (!shouldSave(saveCheck())) return false
  try {
    const ok = await queueSync.saveToServer({ keepalive })
    logger.info(`[handoff] saved (${event})`, { ok })
    if (ok) {
      // This device took the queue back: "left behind" may show again.
      useHandoffStore.setState({ leftBehindShown: false })
      // Still playing: the position keeps moving, so the next quit saves.
      dirty = isPlayingHere()
    }
    return ok
  } catch (e) {
    logger.error('[handoff] save failed', e)
    return false
  }
}

const debouncer = createSaveDebouncer(
  (event) => {
    save(event)
  },
  (fn, ms) => window.setTimeout(fn, ms),
  (timer) => window.clearTimeout(timer as number),
)

/**
 * A song change, pause or queue edit here. Nothing is scheduled while
 * "Continued on <device>" shows: that would overwrite the other device.
 */
export function publishEvent(event: SaveEvent) {
  if (useHandoffStore.getState().leftBehind) return
  dirty = true
  debouncer.event(event)
}

/** Play was pressed here (or playback started). */
export function played() {
  dirty = true
  closeLeftBehind()
  playbackStartedHere()
}

/**
 * How long quit, sleep and lock wait for the "left behind" check. The main
 * process gives quit 1.5 s in all; the save itself needs the rest.
 */
const CHECK_BUDGET_MS = 1000

/**
 * Quit, system sleep, screen lock: save right away (keepalive survives the
 * page), but only if this device has something newer than the server:
 *  - nothing happened here and nothing plays: nothing is sent
 *  - playing here: first ask whether the phone took over (the regular check
 *    runs only every 60 s); if it did, "Continued on" shows and the save is
 *    blocked. No answer within the budget: no save (the safe side).
 */
export async function saveNow(event: SaveEvent): Promise<boolean> {
  if (!dirty && !isPlayingHere() && !debouncer.pending) return false
  if (isPlayingHere()) {
    let timer: number | undefined
    const answered = await Promise.race([
      checkLeftBehind().then(
        () => true,
        () => false,
      ),
      new Promise<false>((resolve) => {
        timer = window.setTimeout(() => resolve(false), CHECK_BUDGET_MS)
      }),
    ])
    window.clearTimeout(timer)
    if (!answered) return false
  }
  debouncer.cancel()
  return save(event, true)
}

// ---------------------------------------------------------------- look

let lookTimer: number | undefined
let lastLook = 0
let looking = false

/**
 * Reads the server's queue and Now Playing together and decides the offer.
 * If the server can't be reached, tries again every minute: the first
 * answer after that is the look "when the server answers again".
 */
export async function look() {
  if (looking || isUsingLocalLibrary()) return
  const { isServerConfigured, username } = useAppStore.getState().data
  if (!isServerConfigured) return
  looking = true
  lastLook = Date.now()
  window.clearTimeout(lookTimer)
  try {
    const [queue, nowPlaying] = await Promise.all([
      queueSync.getFromServer(),
      queueSync.getNowPlaying(),
    ])
    if (!queue) {
      lookTimer = window.setTimeout(look, 60_000)
      return
    }
    const latest = latestChanged(
      useHandoffStore.getState().latestChanged,
      queue.changed,
    )
    useHandoffStore.setState({ latestChanged: latest })
    const found = offer({
      thisApp: DESKTOP_APP,
      username,
      queue,
      handledChanged: storedHandled(),
      playingHere: isPlayingHere(),
      nowPlaying: nowPlaying ?? [],
    })
    useHandoffStore.setState({
      offer: found ? { offer: found, queue } : null,
    })
  } catch (e) {
    logger.error('[handoff] look failed', e)
  } finally {
    looking = false
  }
}

/** Window focus: look, at most once per 30 s. */
export function lookOnFocus() {
  if (Date.now() - lastLook < 30_000) return
  look()
}

export function stopLooking() {
  window.clearTimeout(lookTimer)
}

// ---------------------------------------------------------------- offer

let continuing = false

/** Continue / Continue here. */
export async function continueOffer() {
  const current = useHandoffStore.getState().offer
  if (!current || continuing) return false
  const { offer: o, queue } = current
  continuing = true
  try {
    let started = false
    try {
      started = await queueSync.startQueueAt(
        queue.entries,
        o.index,
        o.positionMs,
      )
    } catch (e) {
      logger.error('[handoff] continue failed', e)
    }
    // The offer stays, so Continue can be pressed again (the caller says
    // "Couldn't continue. Try again.").
    if (!started) return false
    // Only now is the server's queue dealt with.
    markHandled(o.changed)
    useHandoffStore.setState({
      offer: null,
      leftBehind: null,
      leftBehindShown: false,
    })
    // Save straight back, so the other device doesn't offer it back. Not
    // through saveNow: the player may not report playing yet.
    debouncer.cancel()
    await save('continued')
    return true
  } finally {
    continuing = false
  }
}

/** ×: hidden until the server's queue changes again. */
export function dismissOffer() {
  const current = useHandoffStore.getState().offer
  markHandled(current?.offer.changed)
  useHandoffStore.setState({ offer: null })
}

/** Playback started here some other way: the server's queue is dealt with. */
export function playbackStartedHere() {
  if (continuing) return
  markHandled()
  if (useHandoffStore.getState().offer)
    useHandoffStore.setState({ offer: null })
}

// ---------------------------------------------------------------- left behind

let pausingHere = false

/** True once, for the pause "Pause here" caused (it doesn't save). */
export function takePauseHere() {
  const was = pausingHere
  pausingHere = false
  return was
}

/** "Pause here": pauses without saving; saving resumes after. */
export function pauseHere() {
  debouncer.cancel()
  // Left behind: this device has nothing newer than the server.
  dirty = false
  pausingHere = isPlayingHere()
  useHandoffStore.setState({ leftBehind: null })
  usePlayerStore.getState().actions.setPlayingState(false)
}

/** ×, or the user's next skip, play or queue edit here. */
export function closeLeftBehind() {
  if (useHandoffStore.getState().leftBehind)
    useHandoffStore.setState({ leftBehind: null })
}

let checking: Promise<void> | null = null

/**
 * Is this device left behind? The phone app (Rimelight or, not updated
 * yet, ClearPlay for Android) plays a song from this queue (Now Playing) and saved the server's queue last (read
 * only then).
 * Runs before a song change's save (see QueueObserver), so the device left
 * behind doesn't save first and make itself changedBy.
 */
export function checkLeftBehind() {
  if (!checking)
    checking = runLeftBehindCheck().finally(() => {
      checking = null
    })
  return checking
}

async function runLeftBehindCheck() {
  const state = useHandoffStore.getState()
  if (state.leftBehind || state.leftBehindShown || isUsingLocalLibrary()) return
  if (!useRimelightSettings.getState().syncQueue || !isPlayingHere()) return
  const nowPlaying = await queueSync.getNowPlaying()
  if (!nowPlaying) return
  const input = () => ({
    publishing: useRimelightSettings.getState().syncQueue,
    playingHere: isPlayingHere(),
    thisApp: DESKTOP_APP,
    username: useAppStore.getState().data.username,
    nowPlaying,
    queueIds: usePlayerStore.getState().songlist.currentList.map((s) => s.id),
    alreadyShown: useHandoffStore.getState().leftBehindShown,
  })
  if (!leftBehindCandidate(input())) return
  const queue = await queueSync.getFromServer()
  if (!queue) return
  const found = leftBehind({ ...input(), serverChangedBy: queue.changedBy })
  if (!found) return
  debouncer.cancel()
  const { currentList } = usePlayerStore.getState().songlist
  useHandoffStore.setState({
    leftBehind: {
      device: found.device,
      song: currentList.find((s) => s.id === found.song) ?? null,
    },
    leftBehindShown: true,
  })
}
