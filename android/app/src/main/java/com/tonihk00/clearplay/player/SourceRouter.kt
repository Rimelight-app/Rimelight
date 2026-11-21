package com.tonihk00.clearplay.player

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import java.io.IOException

/**
 * Playback data source that applies Settings → Player → Playback source: each song is read
 * either from its download ([local], the offline cache) or from the server ([network]).
 *
 * The choice is made when a song starts loading (position 0) and then kept for that song:
 * a download may be a different format or bitrate than the stream, so switching in the middle
 * would mix two different files. One exception: when the server stops answering mid-song and
 * the download is byte-for-byte the same size as the stream (both original quality), the rest
 * is read from the download, so the song keeps playing.
 */
@UnstableApi
class SourceRouter(
    private val local: DataSource.Factory,
    private val network: DataSource.Factory,
    /** True to read this cache key from its download. */
    private val useDownload: (key: String) -> Boolean,
    /** Size of the downloaded copy of this cache key, or null. */
    private val downloadedLength: (key: String) -> Long?,
    /** Whether the download may stand in when the server fails ("Always server": no). */
    private val mayFallBack: () -> Boolean = { true },
) : DataSource.Factory {
    private val chosen = object : LinkedHashMap<String, Boolean>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Boolean>) = size > 8
    }
    private val streamLength = HashMap<String, Long>()

    /** Download (true) or server (false) for [key]; fresh at the start of a song, then kept. */
    @Synchronized
    fun choose(key: String, position: Long): Boolean {
        val pinned = chosen[key]
        if (position > 0 && pinned != null) return pinned
        return useDownload(key).also { chosen[key] = it }
    }

    @Synchronized
    private fun pin(key: String, download: Boolean) { chosen[key] = download }

    @Synchronized
    private fun noteStreamLength(key: String, length: Long) { streamLength[key] = length }

    @Synchronized
    private fun sameFile(key: String): Boolean {
        val s = streamLength[key] ?: return false
        return s > 0 && s == downloadedLength(key)
    }

    override fun createDataSource(): DataSource = Routed()

    private inner class Routed : DataSource {
        private val listeners = ArrayList<TransferListener>()
        private var current: DataSource? = null

        override fun addTransferListener(transferListener: TransferListener) {
            listeners += transferListener
        }

        private fun open(factory: DataSource.Factory, spec: DataSpec): Long {
            val ds = factory.createDataSource()
            listeners.forEach(ds::addTransferListener)
            current = ds
            return ds.open(spec)
        }

        override fun open(dataSpec: DataSpec): Long {
            val key = dataSpec.key ?: return open(network, dataSpec)
            if (choose(key, dataSpec.position)) return open(local, dataSpec)
            return try {
                open(network, dataSpec).also { len ->
                    if (dataSpec.position == 0L && len != C.LENGTH_UNSET.toLong()) noteStreamLength(key, len)
                }
            } catch (e: IOException) {
                runCatching { current?.close() }
                current = null
                val fallBack = downloadedLength(key) != null && (dataSpec.position == 0L || sameFile(key)) && mayFallBack()
                if (!fallBack) throw e
                pin(key, true)
                open(local, dataSpec)
            }
        }

        override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
            current?.read(buffer, offset, length) ?: C.RESULT_END_OF_INPUT

        override fun getUri(): Uri? = current?.uri

        override fun getResponseHeaders(): Map<String, List<String>> = current?.responseHeaders ?: emptyMap()

        override fun close() {
            try {
                current?.close()
            } finally {
                current = null
            }
        }
    }
}
