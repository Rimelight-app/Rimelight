package com.tonihk00.clearplay.data

import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.data.api.SubsonicException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File

/** A finished listen waiting to be sent: song id, when it started, and whose server it is. */
@Serializable
data class PendingScrobble(
    val id: String,
    val timeMs: Long,
    /** Server address the song came from (a download remembers it), if known. */
    val server: String? = null,
    /** Account it was played under, if known. */
    val user: String? = null,
) {
    /**
     * Same address, or the same account name (one server is often saved under several
     * addresses, e.g. home and Tailscale).
     */
    fun belongsTo(s: ServerConfig) = server == s.baseUrl || (user != null && user == s.user)
}

/**
 * Listens that still have to reach the server, kept in a file so they survive the app being
 * closed. Every submission goes through here: online it is sent at once; offline it waits and
 * is sent when the server answers again (Navidrome passes it on to ListenBrainz / Last.fm with
 * the original time).
 */
class ScrobbleQueue(private val file: File, private val now: () -> Long = System::currentTimeMillis) {
    private val lock = Any()
    private val items: MutableList<PendingScrobble> = load().toMutableList()
    private val sending = Mutex()

    val size: Int get() = synchronized(lock) { items.size }
    fun snapshot(): List<PendingScrobble> = synchronized(lock) { items.toList() }

    fun add(p: PendingScrobble) = synchronized(lock) {
        items += p
        if (items.size > MAX_ITEMS) items.subList(0, items.size - MAX_ITEMS).clear()
        save()
    }

    /**
     * Sends this server's queued listens, oldest first. Stops at the first connection problem
     * (they stay queued). A listen the server itself rejects is dropped when it was played from
     * this very address (e.g. the song was deleted), otherwise kept for its own server.
     * Returns how many were sent.
     */
    suspend fun flush(server: ServerConfig, send: suspend (PendingScrobble) -> Unit): Int = sending.withLock {
        var sent = 0
        for (p in snapshot().filter { it.belongsTo(server) }) {
            val result = runCatching { send(p) }
            val error = result.exceptionOrNull()
            when {
                error == null -> { remove(p); sent++ }
                error is SubsonicException -> if (p.server == server.baseUrl) remove(p)
                else -> break // offline again, timeout…: try later
            }
        }
        sent
    }

    private fun remove(p: PendingScrobble) = synchronized(lock) {
        if (items.remove(p)) save()
    }

    private fun load(): List<PendingScrobble> = runCatching {
        val all = SubsonicClient.json.decodeFromString(ListSerializer(PendingScrobble.serializer()), file.readText())
        all.filter { now() - it.timeMs < MAX_AGE_MS }
    }.getOrDefault(emptyList())

    private fun save() {
        runCatching {
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(SubsonicClient.json.encodeToString(ListSerializer(PendingScrobble.serializer()), items))
            tmp.renameTo(file)
        }
    }

    companion object {
        private const val MAX_ITEMS = 5_000
        private const val MAX_AGE_MS = 60L * 24 * 3600 * 1000
    }
}

/** Sends [queue]'s listens for [client]'s server, off the main thread. */
suspend fun ScrobbleQueue.flushTo(client: SubsonicClient): Int = withContext(Dispatchers.IO) {
    flush(client.server) { client.scrobble(it.id, submission = true, timeMs = it.timeMs) }
}
