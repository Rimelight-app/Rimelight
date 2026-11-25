package com.tonihk00.clearplay.player

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.MediaSession
import coil3.SingletonImageLoader
import com.tonihk00.clearplay.ClearPlayApp
import com.tonihk00.clearplay.Session
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.data.api.SubsonicException
import com.tonihk00.clearplay.ui.components.coverRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/** Builds the saved queue back into playable items (Media3 playback resumption, Resume shortcut). */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
object Resumption {
    /**
     * The saved queue as items for today's client, bitrate and format, with the play modes put
     * back on [player] (shuffle, repeat, shuffle library) when it is [forPlayback]. Null when
     * nothing is saved or it belongs to another server or account.
     */
    suspend fun restore(context: Context, player: Player, forPlayback: Boolean): MediaSession.MediaItemsWithStartPosition? {
        val app = ClearPlayApp.instance
        // Right after the process starts, the signed-in account is still being read from disk.
        val session = withTimeoutOrNull(5_000) { app.session.first { it !is Session.Loading } } ?: return null
        val client = (session as? Session.Active)?.client
        if (session !is Session.Active && session !is Session.Local) return null
        val saved = withContext(Dispatchers.IO) { app.queueStore.load() } ?: return null
        if (saved.server != QueueStore.keyOf(client)) return null

        if (!forPlayback) {
            // The resume card: one item, everything from disk (no network at boot).
            val song = saved.songs[saved.index]
            val item = song.toMediaItem(client, 0, null)
            val art = withContext(Dispatchers.IO) { cachedCover(context, client, song.coverArt) }
            val withArt = if (art == null) item else item.buildUpon()
                .setMediaMetadata(item.mediaMetadata.buildUpon().setArtworkData(art, androidx.media3.common.MediaMetadata.PICTURE_TYPE_FRONT_COVER).build())
                .build()
            return MediaSession.MediaItemsWithStartPosition(listOf(withArt), 0, saved.positionMs)
        }

        var songs = saved.songs
        var index = saved.index
        var position = saved.positionMs
        // A queue from before Navidrome 0.64's new ids: if the server no longer has the current
        // song, drop it and start at the next (later ones are dropped when they fail to load).
        if (client != null && app.connection.online.value) {
            val gone = withTimeoutOrNull(4_000) {
                try { client.song(songs[index].id); false } catch (e: SubsonicException) { e.code == 70 } catch (e: Exception) { false }
            } == true
            if (gone) {
                songs = songs.filterIndexed { i, _ -> i != index }
                if (songs.isEmpty()) return null
                index = index.coerceAtMost(songs.size - 1)
                position = 0
            }
        }
        val bitrate = app.streamBitrate()
        val format = app.settings.state.value.format.param
        val items: List<MediaItem> = songs.map { it.toMediaItem(client, bitrate, format) }
        player.shuffleModeEnabled = saved.shuffle
        player.repeatMode = saved.repeat
        app.queueFiller.setEndless(saved.endless)
        return MediaSession.MediaItemsWithStartPosition(items, index, position)
    }

    /** The cover from Coil's disk cache only (300 px, else 150 or 600), or null. */
    private fun cachedCover(context: Context, client: SubsonicClient?, coverArt: String?): ByteArray? {
        val art = coverArt ?: return null
        val cache = SingletonImageLoader.get(context).diskCache ?: return null
        for (size in listOf(300, 150, 600)) {
            val key = coverRequest(context, client, art, size)?.diskCacheKey ?: continue
            cache.openSnapshot(key)?.use { snap -> return runCatching { snap.data.toFile().readBytes() }.getOrNull() }
        }
        return null
    }
}
