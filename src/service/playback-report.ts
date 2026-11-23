/**
 * Decisions for OpenSubsonic reportPlayback (extension "playbackReport"):
 * which state to tell the server, and when, so its Now Playing shows this
 * player as playing, paused or gone.
 *
 * Only the logic lives here (no stores, no network), so the unit checks run
 * it directly. playback-reporter.ts feeds it the player's state and sends the
 * reports. Plays are still counted by scrobble?submission=true; every report
 * is sent with ignoreScrobble=true so the server never counts a play twice.
 *
 * Spec: https://opensubsonic.github.io/docs/endpoints/reportplayback/
 */

export type ReportState = 'starting' | 'playing' | 'paused' | 'stopped'

export interface PlaybackReport {
  mediaId: string
  state: ReportState
  positionMs: number
  playbackRate: number
}

/** What the player is doing right now. */
export interface PlayerSnapshot {
  /** The song in the player, or null (nothing loaded, radio or podcast). */
  songId: string | null
  /** The player wants to play (it may still be buffering). */
  isPlaying: boolean
  /** Position in seconds, as the engine reports it. */
  position: number
  /**
   * Listening time counted for this song. It goes back to 0 when the same
   * song starts over (repeat one, played again from a list).
   */
  listened: number
  playbackRate: number
}

/** While playing, the position is sent again this often. */
export const HEARTBEAT_MS = 30_000

/** A forward jump at least this long (seconds) is a seek, not playback. */
const SEEK_FORWARD_S = 3

type Session = { id: string; state: 'starting' | 'playing' | 'paused' }

export function createPlaybackReportLogic(
  send: (report: PlaybackReport) => void,
  now: () => number = Date.now,
) {
  let session: Session | null = null
  /** Position when playback was asked for; "playing" once it moves past. */
  let waitingFrom: number | null = null
  let lastPosition = 0
  let lastListened = 0
  let lastRate = 1
  let lastSentAt = 0

  function emit(state: ReportState, position: number, rate: number) {
    if (!session) return
    send({
      mediaId: session.id,
      state,
      positionMs: Math.max(0, Math.round(position * 1000)),
      playbackRate: rate > 0 && Number.isFinite(rate) ? rate : 1,
    })
    lastSentAt = now()
  }

  function close(position: number) {
    if (!session) return
    emit('stopped', position, lastRate)
    session = null
    waitingFrom = null
  }

  function update(s: PlayerSnapshot) {
    const sameSong = session !== null && s.songId === session.id
    const restarted = sameSong && lastListened > 0 && s.listened === 0
    const jumped =
      sameSong &&
      !restarted &&
      (s.position < lastPosition || s.position - lastPosition >= SEEK_FORWARD_S)

    // Another song, nothing at all, or the same song from the start: the
    // old session ends where it last was.
    if (session && (!sameSong || restarted)) close(lastPosition)

    // A session opens when a song is asked to play. A song that is only
    // loaded (paused at launch, skipped to while paused) is not reported.
    if (!session && s.songId && s.isPlaying) {
      session = { id: s.songId, state: 'starting' }
      emit('starting', s.position, s.playbackRate)
      waitingFrom = s.position
    } else if (session) {
      if (!s.isPlaying) {
        waitingFrom = null
        if (session.state !== 'paused') {
          session.state = 'paused'
          emit('paused', s.position, s.playbackRate)
        } else if (jumped) {
          emit('paused', s.position, s.playbackRate)
        }
      } else if (session.state !== 'playing') {
        // Resumed or still loading: wait until the position really moves.
        if (waitingFrom === null || jumped) waitingFrom = s.position
        else if (s.position > waitingFrom) {
          session.state = 'playing'
          waitingFrom = null
          emit('playing', s.position, s.playbackRate)
        }
      } else if (
        jumped ||
        s.playbackRate !== lastRate ||
        now() - lastSentAt >= HEARTBEAT_MS
      ) {
        emit('playing', s.position, s.playbackRate)
      }
    }

    lastPosition = s.position
    lastListened = s.listened
    lastRate = s.playbackRate
  }

  return {
    update,
    /** Ends the session with "stopped" (queue cleared, app quitting). */
    stop: () => close(lastPosition),
    /** Forgets the session without telling the server (it changed). */
    drop: () => {
      session = null
      waitingFrom = null
    },
    get active() {
      return session !== null
    },
    get state() {
      return session?.state ?? null
    },
  }
}
