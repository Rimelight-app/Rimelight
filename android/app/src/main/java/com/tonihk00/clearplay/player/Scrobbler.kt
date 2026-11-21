package com.tonihk00.clearplay.player

import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import com.tonihk00.clearplay.data.api.SubsonicClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Reports plays to the server like the desktop: "now playing" when a song starts, and a
 * submission once it has actually been listened to for half its length or 4 minutes
 * (songs under 30 s are never submitted). Submissions go through the app's [ScrobbleQueue]:
 * sent at once when the server answers, otherwise kept (also across restarts) and sent when
 * the connection comes back, with the time the song was played.
 */
class Scrobbler(
    private val player: Player,
    private val scope: CoroutineScope,
    private val client: () -> SubsonicClient?,
) : Player.Listener {
    private var songId: String? = null
    private var durationMs = 0L
    private var listenedMs = 0L
    private var startedAt = 0L
    private var nowPlayingSent = false
    private var submitted = false
    private var ticker: Job? = null
    private var songServer: String? = null

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
        if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED && mediaItem?.mediaId == songId) return
        songId = mediaItem?.mediaId
        songServer = mediaItem?.toSong()?.server
        durationMs = (mediaItem?.mediaMetadata?.durationMs ?: 0L)
        listenedMs = 0
        startedAt = System.currentTimeMillis()
        nowPlayingSent = false
        submitted = false
        if (player.isPlaying) sendNowPlaying()
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        ticker?.cancel()
        if (!isPlaying) return
        if (!nowPlayingSent) sendNowPlaying()
        ticker = scope.launch {
            while (isActive) {
                delay(TICK)
                listenedMs += TICK
                maybeSubmit()
            }
        }
    }

    private val app get() = com.tonihk00.clearplay.ClearPlayApp.instance
    private val enabled get() = runCatching { app.settings.state.value.scrobble }.getOrDefault(true)
    private val online get() = runCatching { app.connection.online.value }.getOrDefault(true)

    private fun sendNowPlaying() {
        val id = songId ?: return
        if (!enabled || id.startsWith(com.tonihk00.clearplay.data.api.Song.LOCAL_PREFIX)) return
        // "Now playing" only means something live; offline it is skipped (the listen itself is queued).
        if (!online) return
        nowPlayingSent = true
        scope.launch { runCatching { client()?.scrobble(id, submission = false) } }
    }

    private fun maybeSubmit() {
        val id = songId ?: return
        if (submitted || !enabled || id.startsWith(com.tonihk00.clearplay.data.api.Song.LOCAL_PREFIX)) return
        val dur = if (durationMs > 0) durationMs else player.duration.coerceAtLeast(0)
        if (dur in 1 until 30_000) return
        if (listenedMs < minOf(dur / 2, 240_000L).coerceAtLeast(30_000L)) return
        submitted = true
        val server = client()?.server
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

    fun release() {
        ticker?.cancel()
    }

    private companion object {
        const val TICK = 5_000L
    }
}
