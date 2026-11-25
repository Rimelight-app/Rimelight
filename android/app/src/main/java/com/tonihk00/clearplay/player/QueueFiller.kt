package com.tonihk00.clearplay.player

import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import com.tonihk00.clearplay.data.api.MusicLibrary
import com.tonihk00.clearplay.data.api.Song
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * Shuffle library ("endless"): when the queue gets within 5 songs of its end, 50 more random
 * songs are added. Runs on the player service's own player, so it keeps going without the UI
 * (screen off, app closed, after playback resumption). PlayerConnection only reads [endless] and
 * switches it on or off.
 */
class QueueFiller(
    private val scope: CoroutineScope,
    /** Where random songs come from: the server, or downloads/phone music offline. */
    private val library: () -> MusicLibrary?,
    /** Builds playable items (with their stream URLs) for the service's player. */
    private val items: (List<Song>) -> List<MediaItem>,
) : Player.Listener {
    private val _endless = MutableStateFlow(false)
    val endless: StateFlow<Boolean> = _endless

    private var player: Player? = null
    private var filling = false

    /** True while this class itself is adding songs (not a queue edit by the user). */
    var adding = false
        private set

    fun attach(p: Player) {
        player = p
        p.addListener(this)
    }

    fun detach(p: Player) {
        p.removeListener(this)
        if (player === p) player = null
    }

    fun setEndless(on: Boolean) {
        _endless.value = on
        if (on) refillIfNeeded()
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) = refillIfNeeded()

    override fun onTimelineChanged(timeline: androidx.media3.common.Timeline, reason: Int) {
        // Queue emptied (sign-out, clear): shuffle library is over.
        if (timeline.isEmpty) _endless.value = false
    }

    private fun refillIfNeeded() {
        val p = player ?: return
        if (!_endless.value || filling || p.mediaItemCount == 0) return
        if (p.mediaItemCount - p.currentMediaItemIndex > 5) return
        val lib = library() ?: return
        filling = true
        scope.launch {
            try {
                val more = runCatching { lib.randomSongs(50) }.getOrNull().orEmpty()
                val now = player
                if (now != null && _endless.value && more.isNotEmpty()) {
                    val have = (0 until now.mediaItemCount).map { now.getMediaItemAt(it).mediaId }.toSet()
                    val fresh = more.filterNot { it.id in have }
                    if (fresh.isNotEmpty()) {
                        adding = true
                        try { now.addMediaItems(items(fresh)) } finally { adding = false }
                    }
                }
            } finally {
                filling = false
            }
        }
    }
}
