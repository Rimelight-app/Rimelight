package com.tonihk00.clearplay.player

import androidx.media3.common.C
import androidx.media3.common.Player
import com.tonihk00.clearplay.data.api.Song
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Listens to the player service's own player (so it works without the UI):
 * - writes the queue to [QueueStore] on song change, pause, queue edits (2 s after the last),
 *   every 30 s while playing, and when the service stops ([saveBlocking]);
 * - tells [Handoff] about song changes, pauses, plays and queue edits ("Continue on other
 *   devices");
 * - tells [onSongChange] (the Resume shortcut's label) and [onEnded] (the queue played out).
 * Songs that fail to play (also one the server no longer has) are [PlaybackErrors]' job.
 */
class QueueWatcher(
    private val player: Player,
    private val scope: CoroutineScope,
    private val store: QueueStore,
    private val serverKey: () -> String,
    private val endless: () -> Boolean,
    private val autoEdit: () -> Boolean,
    private val handoff: () -> Handoff?,
    private val onSongChange: (Song) -> Unit = {},
    private val onEnded: () -> Unit = {},
    private val now: () -> Long = System::currentTimeMillis,
    private val io: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO,
) : Player.Listener {
    private var ids: List<String> = emptyList()
    private var index = C.INDEX_UNSET
    private var currentId: String? = null
    private var playWhenReady = false
    private var lastReason = -1
    private var editSave: Job? = null
    private var ticker: Job? = null
    private var write: Job? = null

    init {
        ids = currentIds()
        index = player.currentMediaItemIndex
        currentId = player.currentMediaItem?.mediaId
        playWhenReady = player.playWhenReady
    }

    private fun currentIds() = (0 until player.mediaItemCount).map { player.getMediaItemAt(it).mediaId }

    override fun onMediaItemTransition(mediaItem: androidx.media3.common.MediaItem?, reason: Int) {
        lastReason = reason
    }

    override fun onEvents(p: Player, events: Player.Events) {
        val timeline = events.contains(Player.EVENT_TIMELINE_CHANGED)
        val newIds = if (timeline) currentIds() else ids
        val newIndex = p.currentMediaItemIndex
        val newCurrent = p.currentMediaItem?.mediaId
        val listChanged = timeline && newIds != ids
        // Also a skip to the same song further on (it's in the queue twice).
        val songChanged = newCurrent != null && (newCurrent != currentId || (!listChanged && newIndex != index))
        val paused = playWhenReady && !p.playWhenReady
        val played = !playWhenReady && p.playWhenReady
        // "Clear queue" keeps only the playing song.
        val cleared = listChanged && QueueHandoff.isQueueCleared(ids, newIds, currentId)
        // The previous song played to its end (not a skip): Media3 says so with the reason.
        val natural = lastReason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO || lastReason == Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT
        val auto = autoEdit()

        ids = newIds
        index = newIndex
        currentId = newCurrent
        playWhenReady = p.playWhenReady
        if (events.contains(Player.EVENT_MEDIA_ITEM_TRANSITION)) lastReason = -1

        val h = handoff()
        if (newIds.isNotEmpty()) {
            if (songChanged) {
                h?.songChanged(natural)
                p.currentMediaItem?.toSong()?.let(onSongChange)
                saveSoon(0)
            } else if (listChanged && !cleared) {
                h?.queueEdited(auto)
                saveSoon(2_000)
            } else if (listChanged) {
                saveSoon(2_000)
            }
            if (paused) {
                h?.paused(songChanged)
                saveSoon(0)
            }
        } else if (listChanged) {
            saveSoon(0)
        }
        if (played) h?.played()
        if (events.contains(Player.EVENT_IS_PLAYING_CHANGED)) {
            h?.playingChanged(p.isPlaying)
            tick(p.isPlaying)
        }
        if (events.contains(Player.EVENT_PLAYBACK_STATE_CHANGED) && p.playbackState == Player.STATE_ENDED) {
            saveSoon(0)
            onEnded()
        }
    }

    /** Every 30 s while playing, so a kill mid-song loses at most 30 s. */
    private fun tick(playing: Boolean) {
        ticker?.cancel()
        ticker = null
        if (!playing) return
        ticker = scope.launch {
            while (isActive) {
                delay(30_000)
                saveSoon(0)
            }
        }
    }

    private fun saveSoon(delayMs: Long) {
        editSave?.cancel()
        if (delayMs == 0L) { save(); return }
        editSave = scope.launch { delay(delayMs); save() }
    }

    /** What is saved: read from the player on the main thread, written on [io]. */
    fun snapshot(): SavedPlayback? {
        val count = player.mediaItemCount
        if (count == 0) return null
        val songs = (0 until count).map { player.getMediaItemAt(it).toSong() }
        val (window, at) = QueueStore.window(songs, player.currentMediaItemIndex.coerceIn(0, count - 1))
        return SavedPlayback(
            server = serverKey(),
            songs = window,
            index = at,
            positionMs = player.currentPosition.coerceAtLeast(0),
            shuffle = player.shuffleModeEnabled,
            repeat = player.repeatMode,
            endless = endless(),
            savedAt = now(),
        )
    }

    /** Saves now, off the main thread. An empty queue keeps the last saved one (Resume still works). */
    fun save(): Job? {
        val snap = snapshot() ?: return null
        val previous = write
        return scope.launch {
            previous?.join()
            withContext(io) { store.save(snap) }
        }.also { write = it }
    }

    /** The service is being destroyed: write synchronously (the scope is about to go). */
    fun saveBlocking() {
        editSave?.cancel()
        ticker?.cancel()
        snapshot()?.let(store::save)
    }
}
