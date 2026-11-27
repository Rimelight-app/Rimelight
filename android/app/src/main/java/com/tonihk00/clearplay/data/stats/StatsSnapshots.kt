package com.tonihk00.clearplay.data.stats

import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.data.api.Song
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

/** What the server last returned for Statistics, and when. Shown as is while offline. */
@Serializable
data class StatsSnapshot(val stats: LibraryStats, val fetchedAt: Long)

/**
 * One JSON file per server account (address + user). Each save replaces the whole file
 * (written next to it, then renamed), so a snapshot is never a mix of two fetches.
 */
class StatsStore(private val dir: File) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private fun file(key: String) = dir.resolve("$key.json")

    fun load(key: String): StatsSnapshot? =
        runCatching { json.decodeFromString(StatsSnapshot.serializer(), file(key).readText()) }.getOrNull()

    fun save(key: String, snapshot: StatsSnapshot) {
        dir.mkdirs()
        val tmp = dir.resolve("$key.json.tmp")
        tmp.writeText(json.encodeToString(StatsSnapshot.serializer(), snapshot))
        if (!tmp.renameTo(file(key))) {
            file(key).delete()
            tmp.renameTo(file(key))
        }
    }

    companion object {
        fun keyOf(server: ServerConfig) = ServerConfig.md5("${server.baseUrl}|${server.user}")
    }
}

/**
 * Statistics per server account. Online, [refresh] reads every song from the server,
 * computes the numbers and saves them as the new snapshot. Offline, screens show [saved]
 * unchanged (plays made offline are not added; the numbers update on the next refresh).
 * A refresh runs in [scope], so moving to another tab doesn't throw away a half-done fetch,
 * and two callers asking at once share one fetch. When the screen is gone for good (the app
 * left, not just another tab), it [cancel]s the fetch: nothing is saved, no more pages are read.
 */
class StatsRepository(
    private val store: StatsStore,
    private val scope: CoroutineScope,
    private val now: () -> Long = System::currentTimeMillis,
) {
    private val _snapshots = MutableStateFlow<Map<String, StatsSnapshot>>(emptyMap())

    /** Snapshots loaded or fetched in this process, by [StatsStore.keyOf]. */
    val snapshots: StateFlow<Map<String, StatsSnapshot>> = _snapshots

    /** Songs read so far by a running refresh, per key. */
    private val _progress = MutableStateFlow<Map<String, Int>>(emptyMap())
    val progress: StateFlow<Map<String, Int>> = _progress

    private val running = HashMap<String, Deferred<StatsSnapshot>>()

    /** The last snapshot for this account (from memory, else from disk), or null if never fetched. */
    fun saved(server: ServerConfig): StatsSnapshot? {
        val key = StatsStore.keyOf(server)
        _snapshots.value[key]?.let { return it }
        val loaded = store.load(key) ?: return null
        _snapshots.update { if (key in it) it else it + (key to loaded) }
        return _snapshots.value[key]
    }

    fun isStale(snapshot: StatsSnapshot?, maxAgeMs: Long = STALE_MS) =
        snapshot == null || now() - snapshot.fetchedAt > maxAgeMs

    /** True if a refresh for this account finished less than [ms] ago (to skip back-to-back fetches). */
    fun fetchedWithin(server: ServerConfig, ms: Long) = saved(server)?.let { now() - it.fetchedAt < ms } == true

    /**
     * Fetches and replaces the snapshot. [page] reads one search3 page of 500 songs at the
     * given offset (the client's `songs(500, offset)`).
     */
    fun refresh(server: ServerConfig, page: suspend (offset: Int) -> List<Song>): Deferred<StatsSnapshot> {
        val key = StatsStore.keyOf(server)
        synchronized(running) {
            running[key]?.takeIf { it.isActive }?.let { return it }
            val job = scope.async {
                try {
                    _progress.update { it + (key to 0) }
                    val songs = fetchAllSongs(page) { n -> _progress.update { it + (key to n) } }
                    val snap = withContext(Dispatchers.Default) { StatsSnapshot(computeStats(songs), now()) }
                    withContext(Dispatchers.IO) { store.save(key, snap) }
                    _snapshots.update { it + (key to snap) }
                    snap
                } finally {
                    _progress.update { it - key }
                    synchronized(running) { running.remove(key) }
                }
            }
            running[key] = job
            return job
        }
    }

    /** Stops a running refresh for this account (nothing is saved; the last snapshot stays). */
    fun cancel(server: ServerConfig) {
        val key = StatsStore.keyOf(server)
        synchronized(running) { running[key] }?.cancel()
    }

    companion object {
        /** Same as the desktop's query staleTime: data younger than this isn't refetched on open. */
        const val STALE_MS = 10 * 60 * 1000L
    }
}
