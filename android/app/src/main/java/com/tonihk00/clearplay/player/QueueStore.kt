package com.tonihk00.clearplay.player

import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicClient
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import java.io.File

/**
 * The queue as it was last left on this phone: which account it belongs to, the songs (at most
 * [QueueStore.MAX_SONGS], around the current one), where in them, and the play modes. Stream URLs
 * are never saved (they carry the login token and the bitrate of the time); the items are built
 * again from [songs] when the queue is restored.
 */
@Serializable
data class SavedPlayback(
    /** [QueueStore.keyOf] the server account, or [QueueStore.LOCAL] for "music on this phone". */
    val server: String,
    val songs: List<Song>,
    val index: Int,
    val positionMs: Long,
    val shuffle: Boolean = false,
    /** Player.REPEAT_MODE_*. */
    val repeat: Int = 0,
    /** Shuffle library: random songs keep being added as the queue runs out. */
    val endless: Boolean = false,
    /** This phone's clock when it was written (only to say how old it is). */
    val savedAt: Long = 0,
)

/**
 * filesDir/queue.json, written by the player service (same pattern as ScrobbleQueue): the whole
 * file is written next to it and renamed over it, so a crash mid-write never leaves half a queue.
 * Read when the app restarts playback after Android killed it (Media3 playback resumption, the
 * media button, the Resume shortcut).
 */
class QueueStore(private val file: File) {
    private val lock = Any()

    fun save(p: SavedPlayback) = synchronized(lock) {
        runCatching {
            file.parentFile?.mkdirs()
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(json.encodeToString(SavedPlayback.serializer(), p))
            if (!tmp.renameTo(file)) {
                file.delete()
                tmp.renameTo(file)
            }
        }
        Unit
    }

    /**
     * The saved queue, or null if there is none or it can't be read. A song entry that can't be
     * read (an old or broken entry) is dropped on its own; the rest of the queue is kept, and the
     * index follows the songs that remain.
     */
    fun load(): SavedPlayback? = synchronized(lock) {
        val root = runCatching { json.parseToJsonElement(file.readText()).jsonObject }.getOrNull() ?: return null
        fun str(k: String) = (root[k] as? JsonPrimitive)?.contentOrNull
        val server = str("server") ?: return null
        val savedIndex = str("index")?.toIntOrNull() ?: 0
        val songs = ArrayList<Song>()
        var index = -1
        var currentKept = false
        (root["songs"] as? JsonArray ?: JsonArray(emptyList())).forEachIndexed { i, el ->
            val song = runCatching { json.decodeFromJsonElement<Song>(el) }.getOrNull()?.takeIf { it.id.isNotBlank() }
                ?: return@forEachIndexed
            if (i == savedIndex) { index = songs.size; currentKept = true }
            // The saved current song is gone: start at the next one that is still there.
            if (index < 0 && i > savedIndex) index = songs.size
            songs += song
        }
        if (songs.isEmpty()) return null
        return SavedPlayback(
            server = server,
            songs = songs,
            index = (if (index < 0) songs.size - 1 else index).coerceIn(0, songs.size - 1),
            positionMs = if (currentKept) (str("positionMs")?.toLongOrNull() ?: 0L).coerceAtLeast(0) else 0L,
            shuffle = str("shuffle")?.toBooleanStrictOrNull() ?: false,
            repeat = str("repeat")?.toIntOrNull() ?: 0,
            endless = str("endless")?.toBooleanStrictOrNull() ?: false,
            savedAt = str("savedAt")?.toLongOrNull() ?: 0L,
        )
    }

    /** Drops the saved queue (sign-out). */
    fun clear() = synchronized(lock) { file.delete(); Unit }

    companion object {
        const val LOCAL = "local"

        /** At most this many songs are kept: up to 100 before the current one, the rest after. */
        const val MAX_SONGS = 1000
        private const val MAX_BEFORE = 100

        private val json = Json {
            ignoreUnknownKeys = true
            coerceInputValues = true
            isLenient = true
            encodeDefaults = true
        }

        /** Same account = same address and user name. */
        fun keyOf(server: ServerConfig) = "${server.user}@${server.baseUrl}"

        fun keyOf(client: SubsonicClient?) = client?.let { keyOf(it.server) } ?: LOCAL

        /** At most [MAX_SONGS] songs around [index], and where [index] lands in them. */
        fun window(songs: List<Song>, index: Int): Pair<List<Song>, Int> {
            if (songs.size <= MAX_SONGS || index !in songs.indices) return songs to index
            val before = minOf(index, MAX_BEFORE)
            val start = index - before
            val end = minOf(songs.size, start + MAX_SONGS)
            return songs.subList(start, end).toList() to before
        }
    }
}
