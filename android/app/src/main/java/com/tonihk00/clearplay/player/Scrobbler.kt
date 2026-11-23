package com.tonihk00.clearplay.player

import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import com.tonihk00.clearplay.data.api.SubsonicClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Reports plays to the server like the desktop: "now playing" while a song plays, and a
 * submission once it has actually been listened to for half its length or 4 minutes
 * (songs under 30 s are never submitted). Submissions go through the app's [ScrobbleQueue]:
 * sent at once when the server answers, otherwise kept (also across restarts) and sent when
 * the connection comes back, with the time the song was played.
 *
 * Now playing: servers with the OpenSubsonic `playbackReport` extension (Navidrome 0.62+) get
 * the live state through reportPlayback — starting, playing, paused, stopped, plus the position
 * every 30 s and on seeks — so pausing shows as paused on the server. Those calls always carry
 * ignoreScrobble=true: plays are counted only by the submission above, exactly as before.
 * Other servers get the old `scrobble?submission=false` once per song. Nothing "now playing"
 * is sent or kept while offline.
 */
class Scrobbler(
    private val player: Player,
    private val scope: CoroutineScope,
    private val client: () -> SubsonicClient?,
    private val enabled: () -> Boolean = { runCatching { app.settings.state.value.scrobble }.getOrDefault(true) },
    private val online: () -> Boolean = { runCatching { app.connection.online.value }.getOrDefault(true) },
    /** Hands a finished listen to the scrobble queue (song id, start time, server it came from). */
    private val submit: (id: String, startedAt: Long, songServer: String?) -> Unit = ::queueListen,
    /** For the final "stopped" when the service shuts down, after [scope] is cancelled. */
    private val shutdownScope: () -> CoroutineScope = { app.appScope },
) : Player.Listener {
    private var songId: String? = null
    private var durationMs = 0L
    private var listenedMs = 0L
    private var startedAt = 0L
    private var submitted = false
    private var ticker: Job? = null
    private var songServer: String? = null

    /** Last playback state reported for the current song (deduplicates pause/resume events). */
    private var reported: String? = null
    private var lastPositionMs = 0L
    private var reportTicker: Job? = null

    private class Report(val id: String, val state: String, val positionMs: Long, val rate: Float)

    /** Reports go out one at a time, in order, so a quick pause → resume can't arrive swapped. */
    private val reports = Channel<Report>(Channel.UNLIMITED)
    private var legacyNowPlayingFor: String? = null

    init {
        scope.launch { for (r in reports) send(r) }
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
        if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED && mediaItem?.mediaId == songId) return
        // Queue cleared: the session is over.
        if (mediaItem == null && songId != null) report(STOPPED, lastPositionMs)
        songId = mediaItem?.mediaId
        songServer = mediaItem?.toSong()?.server
        durationMs = (mediaItem?.mediaMetadata?.durationMs ?: 0L)
        listenedMs = 0
        startedAt = System.currentTimeMillis()
        submitted = false
        reported = null
        lastPositionMs = 0
        if (mediaItem == null) return
        // A new song, or the same one again (repeat): a new playback session on the server.
        report(STARTING, 0)
        if (player.isPlaying) report(PLAYING, 0)
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        ticker?.cancel()
        reportTicker?.cancel()
        if (!isPlaying) {
            val state = player.playbackState
            // Ended / stopped are reported by onPlaybackStateChanged; still loading isn't a pause.
            val buffering = state == Player.STATE_BUFFERING && player.playWhenReady &&
                player.playbackSuppressionReason == Player.PLAYBACK_SUPPRESSION_REASON_NONE
            if (state != Player.STATE_ENDED && state != Player.STATE_IDLE && !buffering) report(PAUSED)
            return
        }
        // Audio is actually coming out (after buffering), on start and on every resume.
        report(PLAYING)
        ticker = scope.launch {
            while (isActive) {
                delay(TICK)
                listenedMs += TICK
                maybeSubmit()
            }
        }
        reportTicker = scope.launch {
            while (isActive) {
                delay(REPORT_EVERY)
                report(PLAYING, force = true)
            }
        }
    }

    override fun onPlaybackStateChanged(playbackState: Int) {
        // End of the queue, or the player stopped (also covers a stop while paused).
        if (playbackState == Player.STATE_ENDED || playbackState == Player.STATE_IDLE) report(STOPPED)
    }

    override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
        if (reason != Player.DISCONTINUITY_REASON_SEEK || oldPosition.mediaItemIndex != newPosition.mediaItemIndex) return
        val pos = newPosition.positionMs
        if (pos < RESTART_MS && oldPosition.positionMs >= RESTART_MS) {
            // Same song from the start ("previous" a few seconds in): a fresh session.
            report(STARTING, pos, force = true)
            if (player.isPlaying) report(PLAYING, pos, force = true)
        } else {
            val st = reported ?: return
            if (st == PLAYING || st == PAUSED) report(st, pos, force = true)
        }
    }

    private fun report(state: String, positionMs: Long = player.currentPosition, force: Boolean = false) {
        val id = songId ?: return
        lastPositionMs = positionMs
        if (!force && state == reported) return
        if (!enabled() || id.startsWith(com.tonihk00.clearplay.data.api.Song.LOCAL_PREFIX)) return
        // Live state only: offline nothing is sent or queued.
        if (!online()) return
        val rate = runCatching { player.playbackParameters.speed }.getOrDefault(1f)
        // No session on the server yet (start was offline, or after a stop): open one first.
        if ((state == PLAYING || state == PAUSED) && (reported == null || reported == STOPPED)) {
            reports.trySend(Report(id, STARTING, positionMs, rate))
        }
        reported = state
        reports.trySend(Report(id, state, positionMs, rate))
    }

    private suspend fun send(r: Report) {
        val c = client() ?: return
        runCatching {
            if (c.supportsPlaybackReport()) {
                c.reportPlayback(r.id, r.state, r.positionMs, r.rate)
            } else if (r.state == STARTING) {
                legacyNowPlayingFor = null
            } else if (r.state == PLAYING && legacyNowPlayingFor != r.id) {
                // Older servers: the plain now-playing call, once per song (as before 1.5.3).
                legacyNowPlayingFor = r.id
                c.scrobble(r.id, submission = false)
            }
        }
    }

    private fun maybeSubmit() {
        val id = songId ?: return
        if (submitted || !enabled() || id.startsWith(com.tonihk00.clearplay.data.api.Song.LOCAL_PREFIX)) return
        val dur = if (durationMs > 0) durationMs else player.duration.coerceAtLeast(0)
        if (dur in 1 until 30_000) return
        if (listenedMs < minOf(dur / 2, 240_000L).coerceAtLeast(30_000L)) return
        submitted = true
        submit(id, startedAt, songServer)
    }

    /** The player service is going away: end the server's session, then stop the timers. */
    fun release() {
        ticker?.cancel()
        reportTicker?.cancel()
        val id = songId
        val c = client()
        if (id != null && c != null && reported != null && reported != STOPPED && enabled() && online()) {
            val pos = runCatching { player.currentPosition }.getOrDefault(lastPositionMs)
            reported = STOPPED
            shutdownScope().launch { runCatching { if (c.supportsPlaybackReport()) c.reportPlayback(id, STOPPED, pos) } }
        }
        reports.close()
    }

    companion object {
        const val STARTING = "starting"
        const val PLAYING = "playing"
        const val PAUSED = "paused"
        const val STOPPED = "stopped"

        private const val TICK = 5_000L

        /** Position update while playing (the server estimates in between). */
        const val REPORT_EVERY = 30_000L

        /** A seek from past this point to before it restarts the song. */
        private const val RESTART_MS = 3_000L

        private val app get() = com.tonihk00.clearplay.ClearPlayApp.instance

        private fun queueListen(id: String, startedAt: Long, songServer: String?) {
            val server = app.client?.server
            val from = songServer ?: server?.baseUrl ?: return // nowhere to send it
            app.scrobbles.add(
                com.tonihk00.clearplay.data.PendingScrobble(
                    id, startedAt, from,
                    // The account: the active one if this song is from it, else the saved account for that address.
                    user = server?.user?.takeIf { server.baseUrl == from } ?: savedUserFor(from) ?: server?.user,
                ),
            )
            app.flushScrobbles()
        }

        private fun savedUserFor(baseUrl: String): String? =
            app.savedServers.value.firstOrNull { it.baseUrl == baseUrl }?.user
    }
}
