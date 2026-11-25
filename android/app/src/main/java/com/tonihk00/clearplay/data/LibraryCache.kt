package com.tonihk00.clearplay.data

import com.tonihk00.clearplay.data.api.ServerConfig
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

/**
 * The first page of each library list (Albums per sort, Artists, Playlists, Favorites, Genres),
 * kept on disk per server account in cacheDir/library/<account>/, so Library shows at once on a
 * cold start and refreshes in the background.
 *
 * - Written after every successful first-page load; at most [MAX_BYTES] in all (the oldest
 *   lists go first).
 * - Each account's folder records the Navidrome version it was written with. When the server
 *   reports another version (0.64 gave every song and album a new 128-bit id), the folder is
 *   dropped.
 * - Cleared on sign-out, server switch and Settings → Storage → Clear cache.
 * Offline, the library comes from downloads as before; this cache is for the server only.
 */
class LibraryCache(private val root: File, private val maxBytes: Long = MAX_BYTES) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = false; coerceInputValues = true }
    private val lock = Any()

    @Serializable
    private data class Meta(val serverVersion: String? = null)

    private fun dir(server: ServerConfig) = root.resolve(ServerConfig.md5("${server.baseUrl}|${server.user}"))

    private fun file(server: ServerConfig, name: String) = dir(server).resolve(name.replace(Regex("[^A-Za-z0-9_.-]"), "_") + ".json")

    private fun meta(server: ServerConfig): Meta? =
        runCatching { json.decodeFromString(Meta.serializer(), dir(server).resolve("meta.json").readText()) }.getOrNull()

    /**
     * The cached list, or null. [serverVersion] is the version the client knows now (null before
     * its first answer): a different version than the cache was written with drops the cache.
     */
    fun <T> read(server: ServerConfig, name: String, serializer: KSerializer<T>, serverVersion: String?): T? = synchronized(lock) {
        val m = meta(server) ?: return null
        if (serverVersion != null && m.serverVersion != null && m.serverVersion != serverVersion) {
            dir(server).deleteRecursively()
            return null
        }
        runCatching { json.decodeFromString(serializer, file(server, name).readText()) }.getOrNull()
    }

    /** Saves a freshly loaded first page (replacing the folder if the server version changed). */
    fun <T> write(server: ServerConfig, name: String, serializer: KSerializer<T>, value: T, serverVersion: String?) = synchronized(lock) {
        runCatching {
            val d = dir(server)
            val m = meta(server)
            if (m != null && serverVersion != null && m.serverVersion != null && m.serverVersion != serverVersion) d.deleteRecursively()
            d.mkdirs()
            if (m == null || (serverVersion != null && m.serverVersion != serverVersion)) {
                d.resolve("meta.json").writeText(json.encodeToString(Meta.serializer(), Meta(serverVersion)))
            }
            val target = file(server, name)
            val tmp = File(d, target.name + ".tmp")
            tmp.writeText(json.encodeToString(serializer, value))
            if (!tmp.renameTo(target)) { target.delete(); tmp.renameTo(target) }
            trim()
        }
        Unit
    }

    /** Drops one account's lists (sign-out, server switch). */
    fun clear(server: ServerConfig) = synchronized(lock) { dir(server).deleteRecursively(); Unit }

    /** Drops everything (Settings → Clear cache). */
    fun clearAll() = synchronized(lock) { root.deleteRecursively(); Unit }

    /** Bytes on disk. */
    fun size(): Long = synchronized(lock) { root.walkTopDown().filter { it.isFile }.sumOf { it.length() } }

    private fun trim() {
        val files = root.walkTopDown().filter { it.isFile && it.name != "meta.json" }.toMutableList()
        var total = files.sumOf { it.length() }
        if (total <= maxBytes) return
        files.sortBy { it.lastModified() }
        for (f in files) {
            if (total <= maxBytes) break
            total -= f.length()
            f.delete()
        }
    }

    companion object {
        const val MAX_BYTES = 2L * 1024 * 1024
    }
}
