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
 * (songs under 30 s are never submitted). Failed submissions are retried with the next one.
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
    private val pending = ArrayDeque<Pair<String, Long>>()

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
        if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED && mediaItem?.mediaId == songId) return
        songId = mediaItem?.mediaId
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

    private val enabled get() = runCatching { com.tonihk00.clearplay.ClearPlayApp.instance.settings.state.value.scrobble }.getOrDefault(true)

    private fun sendNowPlaying() {
        val id = songId ?: return
        if (!enabled || id.startsWith(com.tonihk00.clearplay.data.api.Song.LOCAL_PREFIX)) return
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
        pending.addLast(id to startedAt)
        flush()
    }

    private fun flush() {
        val c = client() ?: return
        scope.launch {
            while (pending.isNotEmpty()) {
                val (id, at) = pending.first()
                if (runCatching { c.scrobble(id, submission = true, timeMs = at) }.isFailure) break
                pending.removeFirst()
            }
        }
    }

    fun release() {
        ticker?.cancel()
    }

    private companion object {
        const val TICK = 5_000L
    }
}
