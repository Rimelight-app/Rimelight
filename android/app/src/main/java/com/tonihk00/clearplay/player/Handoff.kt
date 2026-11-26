package com.tonihk00.clearplay.player

import android.util.Log
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.player.QueueHandoff.SaveEvent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * "Continue on other devices" at run time: when to save the queue, when to look at the server's,
 * the Continue offer and "Continued on <device>". The rules themselves are in [QueueHandoff]
 * (shared with Rimelight desktop 0.6.2, whose src/service/handoff.ts this follows).
 *
 * Events come from the player service's listener ([QueueWatcher]); looking and the left-behind
 * check run in the app scope. Everything here runs on the main thread.
 */
class Handoff(
    private val scope: CoroutineScope,
    /** The active server's client; null without a server (music on this phone). */
    private val client: () -> SubsonicClient?,
    /** The server answers. */
    private val online: () -> Boolean,
    /** Settings → Player → Continue on other devices. */
    private val enabled: () -> Boolean,
    private val player: Player,
    private val handled: HandledStore,
    /** This phone's clock, only for "at most once per 30 s". */
    private val now: () -> Long = System::currentTimeMillis,
    /** Time since boot (never compared with server times): how long ago an offer was read. */
    private val elapsed: () -> Long = android.os.SystemClock::elapsedRealtime,
) {
    /** What Handoff needs from the player. */
    interface Player {
        fun songs(): List<Song>
        fun currentIndex(): Int
        fun positionMs(): Long
        fun isPlaying(): Boolean
        /** Replaces the queue and starts playing at [index] / [positionMs]; true once it plays there. */
        suspend fun startQueueAt(songs: List<Song>, index: Int, positionMs: Long): Boolean
        fun pause()
    }

    /** handledChanged per server account (DataStore). Values are always server times. */
    interface HandledStore {
        fun get(key: String): String?
        fun set(key: String, value: String)
    }

    data class OfferState(
        val offer: QueueHandoff.Offer<Song>,
        val queue: QueueHandoff.SavedQueue<Song>,
        /** [elapsed] when the server answered (a "playing" offer's position was live then). */
        val readAt: Long = 0,
    )

    data class LeftBehindState(val device: String, val song: Song?)

    private val _offer = MutableStateFlow<OfferState?>(null)
    val offer: StateFlow<OfferState?> = _offer

    private val _leftBehind = MutableStateFlow<LeftBehindState?>(null)
    val leftBehind: StateFlow<LeftBehindState?> = _leftBehind

    /** "Continued on" was shown since this phone last saved (shown once per period away). */
    private var leftBehindShown = false

    /** The latest `changed` this phone has seen on the server. */
    private var latestChanged: String? = null

    /**
     * Something happened here since the last save (a play, skip, pause or queue edit). Going to
     * the background or the service stopping saves only then: a queue left untouched here would
     * otherwise replace a newer one saved by the other device.
     */
    private var dirty = false

    private fun serverKey(c: SubsonicClient) = QueueStore.keyOf(c.server)

    private fun storedHandled(c: SubsonicClient) = handled.get(serverKey(c))

    /**
     * This phone has dealt with the server's queue up to `changed` (Continue, ×, or playback
     * started here). Only ever a value from the server.
     */
    private fun markHandled(changed: String? = null) {
        val c = client() ?: return
        val stored = storedHandled(c)
        val value = QueueHandoff.latestChanged(QueueHandoff.latestChanged(stored, latestChanged), changed)
        if (value == null || value == stored) return
        handled.set(serverKey(c), value)
    }

    // ---------------------------------------------------------------- publish

    private fun localQueue(): Pair<List<QueueHandoff.QueueSong>, Int> {
        val songs = player.songs().map { QueueHandoff.QueueSong(it.id, it.isLocal) }
        return songs to player.currentIndex()
    }

    private fun saveCheck(): QueueHandoff.SaveCheck {
        val (songs, index) = localQueue()
        val current = songs.getOrNull(index)
        return QueueHandoff.SaveCheck(
            enabled = enabled() && client() != null,
            online = online(),
            queueLength = songs.size,
            currentIsLocal = current == null || current.local,
            leftBehindShowing = _leftBehind.value != null,
        )
    }

    /** Saves the queue window and position now, if the rules allow it. True when the server took it. */
    suspend fun save(event: SaveEvent): Boolean {
        if (!QueueHandoff.shouldSave(saveCheck())) return false
        val c = client() ?: return false
        val (songs, index) = localQueue()
        val window = QueueHandoff.saveWindow(songs, index) ?: return false
        val position = player.positionMs()
        return try {
            c.savePlayQueue(window.ids, window.currentIndex, position)
            Log.i(TAG, "saved ($event): ${window.ids.size} songs, index ${window.currentIndex}, ${position} ms")
            // This phone took the queue back: "left behind" may show again.
            leftBehindShown = false
            dirty = player.isPlaying()
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "save failed ($event)", e)
            false
        }
    }

    private val debouncer = QueueHandoff.createSaveDebouncer<Job>(
        save = { event -> scope.launch { save(event) } },
        setTimer = { fn, ms -> scope.launch { delay(ms); fn() } },
        clearTimer = { it.cancel() },
    )

    /** A save waits (for tests). */
    val savePending get() = debouncer.pending

    /**
     * A song change, pause or queue edit here. Nothing is scheduled while "Continued on <device>"
     * shows: that would overwrite the other device.
     */
    fun publishEvent(event: SaveEvent) {
        if (_leftBehind.value != null) return
        dirty = true
        debouncer.event(event)
    }

    /**
     * The song changed here. A skip closes "Continued on" (a song ending by itself doesn't); the
     * left-behind check runs first, then this change's save is scheduled.
     */
    fun songChanged(natural: Boolean) {
        if (!natural) closeLeftBehind()
        val check = checkLeftBehind()
        scope.launch {
            runCatching { check.await() }
            publishEvent(SaveEvent.songChange)
        }
    }

    /** Songs were added, removed or moved ([auto]: by shuffle library, not by the user). */
    fun queueEdited(auto: Boolean) {
        if (!auto) closeLeftBehind()
        publishEvent(SaveEvent.queueEdit)
    }

    /** Playback paused here (a pause from "Pause here" doesn't save). */
    fun paused(songChanged: Boolean) {
        val fromPauseHere = takePauseHere()
        if (!songChanged && !fromPauseHere) publishEvent(SaveEvent.pause)
    }

    /** Play was pressed here (or playback started). */
    fun played() {
        dirty = true
        closeLeftBehind()
        playbackStartedHere()
    }

    /** The service stops, the app goes to the background: save right away. */
    fun saveNow(event: SaveEvent): Job? {
        if (!dirty && !player.isPlaying() && !debouncer.pending) return null
        debouncer.cancel()
        return scope.launch { save(event) }
    }

    // ---------------------------------------------------------------- look

    private var lastLook = Long.MIN_VALUE / 2
    private var looking: Job? = null

    /** Reads the server's queue and Now Playing together and decides the offer. */
    fun look(): Job? {
        if (looking?.isActive == true) return looking
        val c = client() ?: return null
        if (!online()) return null
        lastLook = now()
        return scope.launch {
            try {
                val (queue, nowPlaying) = coroutineScope {
                    val q = async { runCatching { c.playQueue() }.getOrNull() }
                    val n = async { runCatching { c.nowPlaying() }.getOrNull() }
                    q.await() to n.await()
                }
                if (queue == null || client() !== c) return@launch
                latestChanged = QueueHandoff.latestChanged(latestChanged, queue.changed)
                val saved = QueueHandoff.SavedQueue(queue.entries, queue.currentIndex, queue.positionMs, queue.changed, queue.changedBy)
                val found = QueueHandoff.offer(
                    QueueHandoff.OfferInput(
                        thisApp = SubsonicClient.CLIENT,
                        username = c.server.user,
                        queue = saved,
                        handledChanged = storedHandled(c),
                        playingHere = player.isPlaying(),
                        nowPlaying = nowPlaying.orEmpty().map(::entry),
                    ),
                )
                _offer.value = found?.let { OfferState(it, saved, elapsed()) }
                Log.i(TAG, "look: changedBy=${queue.changedBy} changed=${queue.changed} offer=${found?.kind}")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "look failed", e)
            }
        }.also { looking = it }
    }

    /** The app comes to the foreground: look, at most once per 30 s. */
    fun lookOnForeground() {
        if (now() - lastLook < 30_000) return
        look()
    }

    /** Signed out or switched server: forget what was shown for the old one. */
    fun reset() {
        debouncer.cancel()
        looking?.cancel()
        _offer.value = null
        _leftBehind.value = null
        leftBehindShown = false
        latestChanged = null
        lastLook = Long.MIN_VALUE / 2
    }

    // ---------------------------------------------------------------- offer

    private var continuing = false

    /** Continue / Continue here. */
    suspend fun continueOffer(): Boolean {
        val current = _offer.value
        if (current == null || continuing) return false
        val (o, queue, readAt) = current
        continuing = true
        markHandled(o.changed)
        _offer.value = null
        _leftBehind.value = null
        leftBehindShown = false
        try {
            // "Continue here" on a device that is still playing: start at its live second, read
            // again now (the offer may have been on screen for a while). If that read fails,
            // the offer's position plus the time since it was read.
            var index = o.index
            var position = o.positionMs
            val c = client()
            if (o.kind == QueueHandoff.Kind.playing && c != null) {
                val live = withTimeoutOrNull(3_000) { runCatching { c.nowPlaying() }.getOrNull() }?.map(::entry)
                val again = live?.let { QueueHandoff.startPoint(queue, SubsonicClient.CLIENT, c.server.user, it) }
                if (again != null && again.kind == QueueHandoff.Kind.playing) {
                    index = again.index
                    position = again.positionMs
                } else if (again == null) {
                    position = o.positionMs + (elapsed() - readAt).coerceAtLeast(0)
                }
            }
            val started = player.startQueueAt(queue.entries, index, position)
            // Save straight back, so the other device doesn't offer it back.
            if (started) {
                debouncer.cancel()
                save(SaveEvent.continued)
            }
            return started
        } finally {
            continuing = false
        }
    }

    /** ×: hidden until the server's queue changes again. */
    fun dismissOffer() {
        markHandled(_offer.value?.offer?.changed)
        _offer.value = null
    }

    /** Playback started here some other way: the server's queue is dealt with. */
    fun playbackStartedHere() {
        if (continuing) return
        markHandled()
        if (_offer.value != null) _offer.value = null
    }

    /** Load queue from server (queue menu): like the desktop's Load button. */
    suspend fun loadFromServer(): Boolean {
        val c = client() ?: return false
        val queue = runCatching { c.playQueue() }.getOrNull() ?: return false
        if (queue.entries.isEmpty()) return false
        latestChanged = QueueHandoff.latestChanged(latestChanged, queue.changed)
        val nowPlaying = runCatching { c.nowPlaying() }.getOrNull().orEmpty().map(::entry)
        val saved = QueueHandoff.SavedQueue(queue.entries, queue.currentIndex, queue.positionMs, queue.changed, queue.changedBy)
        val start = QueueHandoff.startPoint(saved, SubsonicClient.CLIENT, c.server.user, nowPlaying)
        continuing = true
        try {
            markHandled(queue.changed)
            _offer.value = null
            return player.startQueueAt(queue.entries, start.index, start.positionMs)
        } finally {
            continuing = false
        }
    }

    /** Save queue to server (queue menu): saves now, whether or not saving is switched on. */
    suspend fun saveToServer(): Boolean {
        val c = client() ?: return false
        if (!online()) return false
        val (songs, index) = localQueue()
        val window = QueueHandoff.saveWindow(songs, index) ?: return false
        return runCatching { c.savePlayQueue(window.ids, window.currentIndex, player.positionMs()) }
            .onSuccess { leftBehindShown = false }.isSuccess
    }

    // ---------------------------------------------------------------- left behind

    private var pausingHere = false

    /** True once, for the pause "Pause here" caused (it doesn't save). */
    fun takePauseHere(): Boolean {
        val was = pausingHere
        pausingHere = false
        return was
    }

    /** "Pause here": pauses without saving; saving resumes after. */
    fun pauseHere() {
        debouncer.cancel()
        pausingHere = player.isPlaying()
        _leftBehind.value = null
        player.pause()
    }

    /** ×, or the user's next skip, play or queue edit here. */
    fun closeLeftBehind() {
        if (_leftBehind.value != null) _leftBehind.value = null
    }

    private var checking: Deferred<Unit>? = null

    /**
     * Is this phone left behind? The other app (old or new name) plays a song from this queue (Now
     * Playing) and saved the server's queue last (read only then). Runs before a song change's
     * save (see QueueWatcher), so the device left behind doesn't save first and make itself
     * changedBy.
     */
    fun checkLeftBehind(): Deferred<Unit> {
        checking?.takeIf { it.isActive }?.let { return it }
        return scope.async {
            try { runLeftBehindCheck() } catch (e: CancellationException) { throw e } catch (e: Exception) { Log.w(TAG, "left-behind check failed", e); Unit }
        }.also { checking = it }
    }

    private suspend fun runLeftBehindCheck() {
        if (_leftBehind.value != null || leftBehindShown) return
        val c = client() ?: return
        if (!enabled() || !player.isPlaying() || !online()) return
        val nowPlaying = runCatching { c.nowPlaying() }.getOrNull()?.map(::entry) ?: return
        fun input() = QueueHandoff.LeftBehindCandidateInput(
            publishing = enabled(),
            playingHere = player.isPlaying(),
            thisApp = SubsonicClient.CLIENT,
            username = c.server.user,
            nowPlaying = nowPlaying,
            queueIds = player.songs().map { it.id },
            alreadyShown = leftBehindShown,
        )
        if (QueueHandoff.leftBehindCandidate(input()) == null) return
        val queue = runCatching { c.playQueue() }.getOrNull() ?: return
        latestChanged = QueueHandoff.latestChanged(latestChanged, queue.changed)
        val found = QueueHandoff.leftBehind(QueueHandoff.LeftBehindInput(input(), queue.changedBy)) ?: return
        debouncer.cancel()
        _leftBehind.value = LeftBehindState(found.device, player.songs().firstOrNull { it.id == found.song })
        leftBehindShown = true
        Log.i(TAG, "left behind: continued on ${found.device}")
    }

    private var ticker: Job? = null

    /**
     * While playing here with saving on: the left-behind check every 60 s (the song changes also
     * check). Stopped when playback stops, so it never wakes the phone by itself.
     */
    fun playingChanged(playing: Boolean) {
        ticker?.cancel()
        ticker = null
        if (!playing) return
        ticker = scope.launch {
            while (true) {
                delay(60_000)
                if (enabled() && player.isPlaying()) checkLeftBehind().await()
            }
        }
    }

    /** Waits for a running left-behind check (tests). */
    suspend fun awaitChecks() { withTimeoutOrNull(10_000) { checking?.await() } }

    private fun entry(e: com.tonihk00.clearplay.data.api.NowPlayingEntry) =
        QueueHandoff.NowPlaying(e.username, e.playerName, e.state, e.positionMs, e.song.id)

    companion object {
        private const val TAG = "Handoff"
    }
}
