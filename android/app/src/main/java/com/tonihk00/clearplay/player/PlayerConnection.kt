package com.tonihk00.clearplay.player

import android.content.ComponentName
import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.launch

data class PlayerState(
    val current: Song? = null,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val durationMs: Long = 0,
    val queue: List<Song> = emptyList(),
    val index: Int = -1,
    val shuffle: Boolean = false,
    val repeat: Int = Player.REPEAT_MODE_OFF,
    /** Shuffle library mode: random songs are appended as the queue runs out. */
    val endless: Boolean = false,
)

/**
 * App-side handle to the PlaybackService. Exposes the player as a StateFlow and holds the
 * queue operations (play next, add to end, clear keeping the playing song, shuffle library).
 */
class PlayerConnection(
    private val context: Context,
    private val scope: CoroutineScope,
    private val client: () -> SubsonicClient?,
) {
    private var controller: MediaController? = null
    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state
    private var endless = false
    private var filling = false

    /** Current playback position; read on demand so only the progress UI ticks. */
    val positionMs: Long get() = controller?.currentPosition ?: 0L

    fun connect() {
        if (controller != null) return
        scope.launch {
            val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
            val c = runCatching { MediaController.Builder(context, token).buildAsync().await() }.getOrNull()
                ?: return@launch
            controller = c
            c.addListener(object : Player.Listener {
                override fun onEvents(player: Player, events: Player.Events) = publish()
                override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) = refillIfNeeded()
            })
            publish()
        }
    }

    private fun publish() {
        val c = controller ?: return
        val queue = (0 until c.mediaItemCount).map { c.getMediaItemAt(it).toSong() }
        _state.value = PlayerState(
            current = c.currentMediaItem?.toSong(),
            isPlaying = c.isPlaying,
            isBuffering = c.playbackState == Player.STATE_BUFFERING,
            durationMs = c.duration.takeIf { it > 0 } ?: ((c.currentMediaItem?.mediaMetadata?.durationMs) ?: 0L),
            queue = queue,
            index = c.currentMediaItemIndex,
            shuffle = c.shuffleModeEnabled,
            repeat = c.repeatMode,
            endless = endless,
        )
    }

    private fun items(songs: List<Song>): List<MediaItem>? {
        val cl = client() ?: return null
        return songs.map { it.toMediaItem(cl) }
    }

    fun play(songs: List<Song>, startIndex: Int = 0, shuffle: Boolean = false) {
        val c = controller ?: return
        val list = items(songs) ?: return
        endless = false
        c.shuffleModeEnabled = shuffle
        val start = if (shuffle && startIndex == 0) songs.indices.random() else startIndex
        c.setMediaItems(list, start.coerceIn(0, (list.size - 1).coerceAtLeast(0)), 0L)
        c.prepare()
        c.play()
    }

    fun playNext(songs: List<Song>) {
        val c = controller ?: return
        val list = items(songs) ?: return
        if (c.mediaItemCount == 0) return play(songs)
        c.addMediaItems(c.nextMediaItemIndex.takeIf { it >= 0 } ?: c.mediaItemCount, list)
    }

    fun addToQueue(songs: List<Song>) {
        val c = controller ?: return
        val list = items(songs) ?: return
        if (c.mediaItemCount == 0) return play(songs)
        c.addMediaItems(list)
    }

    /** Removes everything except the playing song; with only that song left, stops. */
    fun clearQueue() {
        val c = controller ?: return
        endless = false
        val idx = c.currentMediaItemIndex
        if (c.mediaItemCount <= 1 || idx < 0) {
            c.stop()
            c.clearMediaItems()
        } else {
            if (idx + 1 < c.mediaItemCount) c.removeMediaItems(idx + 1, c.mediaItemCount)
            if (idx > 0) c.removeMediaItems(0, idx)
        }
        publish()
    }

    /** Plays the whole library in random order and keeps adding random songs at the end. */
    fun shuffleLibrary() {
        val cl = client() ?: return
        scope.launch {
            val songs = runCatching { cl.randomSongs(100) }.getOrNull().orEmpty()
            if (songs.isEmpty()) return@launch
            play(songs)
            controller?.shuffleModeEnabled = false
            endless = true
            publish()
        }
    }

    private fun refillIfNeeded() {
        val c = controller ?: return
        if (!endless || filling) return
        if (c.mediaItemCount - c.currentMediaItemIndex > 5) return
        val cl = client() ?: return
        filling = true
        scope.launch {
            runCatching { cl.randomSongs(50) }.getOrNull()?.let { more ->
                val have = (0 until c.mediaItemCount).map { c.getMediaItemAt(it).mediaId }.toSet()
                c.addMediaItems(more.filterNot { it.id in have }.map { it.toMediaItem(cl) })
            }
            filling = false
        }
    }

    fun skipTo(index: Int) {
        controller?.run { seekToDefaultPosition(index); play() }
    }

    fun removeAt(index: Int) {
        controller?.removeMediaItem(index)
    }

    fun togglePlay() {
        val c = controller ?: return
        if (c.isPlaying) c.pause() else {
            if (c.playbackState == Player.STATE_IDLE) c.prepare()
            if (c.playbackState == Player.STATE_ENDED) c.seekToDefaultPosition()
            c.play()
        }
    }

    fun next() { controller?.seekToNext() }
    fun previous() { controller?.seekToPrevious() }
    fun seekTo(ms: Long) { controller?.seekTo(ms) }

    fun toggleShuffle() {
        controller?.let { it.shuffleModeEnabled = !it.shuffleModeEnabled }
    }

    fun cycleRepeat() {
        controller?.let {
            it.repeatMode = when (it.repeatMode) {
                Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
                Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
                else -> Player.REPEAT_MODE_OFF
            }
        }
    }

    /** Called on logout: stop and forget the queue. */
    fun reset() {
        controller?.run { stop(); clearMediaItems() }
        endless = false
    }
}
