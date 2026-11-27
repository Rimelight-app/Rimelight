package com.tonihk00.clearplay.player

import android.util.Log
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * What to do when a song can't be played. Pure rules, the same as the desktop's
 * src/service/playback-errors-rules.ts (v0.6.2), so both apps act the same:
 *  - the server can't be reached (or the phone is offline and the song isn't downloaded): pause
 *    on the song, don't skip through the queue; Play works again once the server answers
 *  - first failure of a song: load it once more
 *  - failed again: "Couldn't play <title>" and the next song
 *  - [MAX_FAILURES_IN_A_ROW] songs in a row, or the last song: stop there (the queue stays)
 */
object PlaybackErrorRules {
    const val MAX_FAILURES_IN_A_ROW = 3

    @Suppress("EnumEntryName")
    enum class Decision { offline, retry, skip, stopAtEnd, stopLimit }

    data class Situation(
        /** False when the server (not a download or phone music) can't be reached. */
        val reachable: Boolean,
        /** Times this song was already retried (0 or 1). */
        val retries: Int,
        /** Songs that failed (after their retry) in a row before this one. */
        val failuresInARow: Int,
        /** A next song exists (or the queue repeats). */
        val hasNext: Boolean,
    )

    fun decide(s: Situation): Decision = when {
        !s.reachable -> Decision.offline
        s.retries < 1 -> Decision.retry
        s.failuresInARow + 1 >= MAX_FAILURES_IN_A_ROW -> Decision.stopLimit
        !s.hasNext -> Decision.stopAtEnd
        else -> Decision.skip
    }

    fun couldNotPlay(title: String) = "Couldn't play ${title.ifBlank { "this song" }}"

    val stoppedInARow = "Couldn't play $MAX_FAILURES_IN_A_ROW songs in a row. Playback stopped."
    const val unreachable = "Can't reach your server. Paused."
}

/**
 * The one error path for songs that can't be played, on the player service's own player (so it
 * also works with the screen off and in Android Auto). Media3 stops in STATE_IDLE with the error;
 * this listener decides with [PlaybackErrorRules] and acts on the player.
 *
 * A song the server no longer has (Subsonic error 70: a queue saved before Navidrome 0.64 gave
 * songs new ids) is dropped from the queue and playback carries on, as since 1.6.0.
 */
class PlaybackErrors(
    private val player: Player,
    private val scope: CoroutineScope,
    /** True when the current item plays without the server (a download or phone music). */
    private val isLocalItem: (androidx.media3.common.MediaItem) -> Boolean,
    /** Whether the server answers now (a ping with a short timeout). */
    private val serverAnswers: suspend () -> Boolean,
    /** Whether the server says it doesn't have this song any more (Subsonic error 70). */
    private val songGone: suspend (String) -> Boolean,
    /** The server can't be reached: the app shows offline and keeps asking. */
    private val markUnreachable: () -> Unit,
    /** A message for the user (the app's toast when it is open; dropped otherwise). */
    private val message: (String) -> Unit,
) : Player.Listener {
    private val retried = HashSet<String>()
    private var failuresInARow = 0
    private var handling: String? = null

    override fun onPlayerError(error: PlaybackException) {
        val item = player.currentMediaItem ?: return
        val id = item.mediaId
        if (handling == id) return
        handling = id
        scope.launch {
            try {
                handle(item, error)
            } finally {
                handling = null
            }
        }
    }

    private suspend fun handle(item: androidx.media3.common.MediaItem, error: PlaybackException) {
        val id = item.mediaId
        val local = isLocalItem(item)
        val reachable = local || serverAnswers()
        // The user may have moved on while the server was asked.
        if (player.currentMediaItem?.mediaId != id) return
        if (reachable && !local && error.isSourceError() && songGone(id)) {
            drop(id)
            return
        }
        val decision = PlaybackErrorRules.decide(
            PlaybackErrorRules.Situation(
                reachable = reachable,
                retries = if (id in retried) 1 else 0,
                failuresInARow = failuresInARow,
                hasNext = player.hasNextMediaItem() || player.repeatMode == Player.REPEAT_MODE_ALL,
            ),
        )
        Log.i(TAG, "song failed (${error.errorCodeName}): $decision")
        if (player.currentMediaItem?.mediaId != id) return
        val title = item.mediaMetadata.title?.toString().orEmpty()
        when (decision) {
            PlaybackErrorRules.Decision.offline -> {
                // Stay on the song, paused; Play prepares it again (PlayerConnection.togglePlay).
                player.playWhenReady = false
                markUnreachable()
                message(PlaybackErrorRules.unreachable)
            }
            PlaybackErrorRules.Decision.retry -> {
                retried += id
                player.prepare()
                player.playWhenReady = true
            }
            PlaybackErrorRules.Decision.skip -> {
                retried -= id
                failuresInARow++
                message(PlaybackErrorRules.couldNotPlay(title))
                player.seekToNextMediaItem()
                player.prepare()
                player.playWhenReady = true
            }
            PlaybackErrorRules.Decision.stopAtEnd -> {
                retried -= id
                failuresInARow++
                message(PlaybackErrorRules.couldNotPlay(title))
                player.playWhenReady = false
            }
            PlaybackErrorRules.Decision.stopLimit -> {
                retried -= id
                failuresInARow = 0
                message(PlaybackErrorRules.stoppedInARow)
                player.playWhenReady = false
            }
        }
    }

    /** A song is really playing: the failure streak is over. */
    override fun onIsPlayingChanged(isPlaying: Boolean) {
        if (!isPlaying) return
        player.currentMediaItem?.mediaId?.let { retried -= it }
        failuresInARow = 0
    }

    private fun drop(id: String) {
        val at = (0 until player.mediaItemCount).firstOrNull { player.getMediaItemAt(it).mediaId == id } ?: return
        Log.w(TAG, "song $id is gone from the server; dropped from the queue")
        val resume = player.playWhenReady
        player.removeMediaItem(at)
        if (player.mediaItemCount > 0) {
            player.prepare()
            player.playWhenReady = resume
        }
    }

    private fun PlaybackException.isSourceError() = errorCode in setOf(
        PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED,
        PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED,
        PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS,
        PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND,
        PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED,
    )

    private companion object {
        const val TAG = "PlaybackErrors"
    }
}
