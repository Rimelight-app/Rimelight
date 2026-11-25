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
    /** Shuffle library's refill, on the service side; this class only reads and switches [QueueFiller.endless]. */
    private val filler: QueueFiller? = null,
    /** The queue saved by the service, for Resume when the player is empty. */
    private val store: QueueStore? = null,
    /** The account the saved queue must belong to ([QueueStore.keyOf]). */
    private val serverKey: () -> String = { QueueStore.keyOf(client()) },
    /** Builds the session token (tests swap in a controller that connects later). */
    private val buildController: suspend () -> MediaController? = {
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        runCatching { MediaController.Builder(context, token).buildAsync().await() }.getOrNull()
    },
) {
    private var controller: MediaController? = null
    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state
    private val endless: Boolean get() = filler?.endless?.value ?: false
    private var connecting = false

    /** Work waiting for the controller (a shortcut used at cold start comes before it connects). */
    private val waiting = ArrayList<(MediaController) -> Unit>()

    /** Runs [block] once the player service is connected: now if it is, else as soon as it connects. */
    fun whenConnected(block: (MediaController) -> Unit) {
        val c = controller
        if (c != null) return block(c)
        waiting += block
        connect()
    }

    val isConnected: Boolean get() = controller != null

    /** Sleep timer: pause at [endsAtMs], or when the current song ends. Null when off. */
    data class Sleep(val endsAtMs: Long? = null, val endOfSong: Boolean = false)

    private val _sleep = MutableStateFlow<Sleep?>(null)
    val sleep: StateFlow<Sleep?> = _sleep
    private var sleepJob: kotlinx.coroutines.Job? = null

    fun setSleepTimer(minutes: Int?, endOfSong: Boolean = false) {
        sleepJob?.cancel()
        _sleep.value = when {
            endOfSong -> Sleep(endOfSong = true)
            minutes != null && minutes > 0 -> Sleep(endsAtMs = System.currentTimeMillis() + minutes * 60_000L)
            else -> null
        }
        val at = _sleep.value?.endsAtMs ?: return
        sleepJob = scope.launch {
            kotlinx.coroutines.delay(at - System.currentTimeMillis())
            controller?.pause()
            _sleep.value = null
        }
    }

    /** Current playback position; read on demand so only the progress UI ticks. */
    val positionMs: Long get() = controller?.currentPosition ?: 0L

    fun connect() {
        if (controller != null || connecting) return
        connecting = true
        scope.launch {
            val c = try { buildController() } finally { connecting = false }
                ?: return@launch
            controller = c
            c.addListener(object : Player.Listener {
                override fun onEvents(player: Player, events: Player.Events) = publish()
                override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                    if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO && _sleep.value?.endOfSong == true) {
                        c.pause()
                        _sleep.value = null
                    }
                }
            })
            filler?.let { f -> scope.launch { f.endless.collect { publish() } } }
            publish()
            val run = waiting.toList()
            waiting.clear()
            run.forEach { it(c) }
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
        val cl = client()
        val app = context.applicationContext as? com.tonihk00.clearplay.ClearPlayApp
        val bitrate = app?.streamBitrate() ?: 0
        val format = app?.settings?.state?.value?.format?.param
        return songs.map { it.toMediaItem(cl, bitrate, format) }
    }

    fun play(songs: List<Song>, startIndex: Int = 0, shuffle: Boolean = false) {
        val c = controller ?: return
        val list = items(songs) ?: return
        filler?.setEndless(false)
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
        filler?.setEndless(false)
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
    /** Library to draw random songs from (server, or downloads/phone music offline). */
    var library: () -> com.tonihk00.clearplay.data.api.MusicLibrary? = { client() }

    fun shuffleLibrary() {
        val lib = library() ?: return
        scope.launch {
            val songs = runCatching { lib.randomSongs(100) }.getOrNull().orEmpty()
            if (songs.isEmpty()) return@launch
            whenConnected {
                play(songs)
                it.shuffleModeEnabled = false
                filler?.setEndless(true)
                publish()
            }
        }
    }

    /**
     * Resume: plays what is loaded, or, with an empty player (after Android killed the app), the
     * queue the service saved, at its song and position, with its shuffle/repeat/shuffle-library
     * modes. Returns false when there is nothing to resume.
     */
    fun resume(): Boolean {
        val c = controller ?: return false
        if (c.mediaItemCount > 0) {
            if (!c.isPlaying) togglePlay()
            return true
        }
        val saved = store?.load()?.takeIf { it.server == serverKey() } ?: return false
        val list = items(saved.songs) ?: return false
        c.shuffleModeEnabled = saved.shuffle
        c.repeatMode = saved.repeat
        filler?.setEndless(saved.endless)
        c.setMediaItems(list, saved.index.coerceIn(0, list.size - 1), saved.positionMs)
        c.prepare()
        c.play()
        return true
    }

    /**
     * Continue: replaces the queue, starts at [index] / [positionMs] and plays. Resolves true
     * once that song is loaded and playing there (false if it doesn't within 20 s).
     */
    suspend fun startQueueAt(songs: List<Song>, index: Int, positionMs: Long): Boolean {
        if (songs.isEmpty() || index !in songs.indices) return false
        val c = kotlinx.coroutines.suspendCancellableCoroutine<MediaController> { cont -> whenConnected { cont.resumeWith(Result.success(it)) } }
        val list = items(songs) ?: return false
        filler?.setEndless(false)
        c.shuffleModeEnabled = false
        c.setMediaItems(list, index, positionMs.coerceAtLeast(0))
        c.prepare()
        c.play()
        val id = songs[index].id
        return kotlinx.coroutines.withTimeoutOrNull(20_000) {
            while (!(c.currentMediaItem?.mediaId == id && c.playbackState == Player.STATE_READY)) kotlinx.coroutines.delay(100)
            true
        } ?: false
    }

    fun pause() { controller?.pause() }

    fun skipTo(index: Int) {
        controller?.run { seekToDefaultPosition(index); play() }
    }

    fun removeAt(index: Int) {
        controller?.removeMediaItem(index)
    }

    /** Moves a queue entry (dragged in the queue); the playing song keeps playing. */
    fun move(from: Int, to: Int) {
        val c = controller ?: return
        if (from == to || from !in 0 until c.mediaItemCount || to !in 0 until c.mediaItemCount) return
        c.moveMediaItem(from, to)
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

    /**
     * Within the first 3 s of a song: the previous song. Later: back to the start of this one.
     * Decided here, from the real position (the controller's own seekToPrevious misjudged it
     * right after a track change and always restarted).
     */
    fun previous() {
        val c = controller ?: return
        if (c.currentPosition <= 3_000 && c.hasPreviousMediaItem()) c.seekToPreviousMediaItem() else c.seekTo(0)
    }
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
        filler?.setEndless(false)
    }
}
