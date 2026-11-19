package com.tonihk00.clearplay.data

import android.content.Context
import androidx.core.net.toUri
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.exoplayer.scheduler.Requirements
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.player.CpDownloadService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.Executors

/** One song's download state for the UI. */
data class DownloadState(val state: Int, val percent: Float) {
    val done get() = state == Download.STATE_COMPLETED
    val active get() = state == Download.STATE_QUEUED || state == Download.STATE_DOWNLOADING || state == Download.STATE_RESTARTING
    val failed get() = state == Download.STATE_FAILED
}

/**
 * Offline downloads (Media3 DownloadManager). Files live in a private cache that is never
 * evicted; playback reads through the same cache, keyed by song id, so a downloaded song
 * plays from storage at any streaming setting and with no network.
 */
@UnstableApi
class Downloads(private val context: Context, private val scope: CoroutineScope) {
    private val db = StandaloneDatabaseProvider(context)
    val cache = SimpleCache(File(context.filesDir, "downloads"), NoOpCacheEvictor(), db)
    private val upstream: DataSource.Factory = OkHttpDataSource.Factory(OkHttpClient())

    val manager = DownloadManager(context, db, cache, upstream, Executors.newFixedThreadPool(2)).apply {
        maxParallelDownloads = 2
    }

    private val _states = MutableStateFlow<Map<String, DownloadState>>(emptyMap())
    val states: StateFlow<Map<String, DownloadState>> = _states

    private val _songs = MutableStateFlow<List<Song>>(emptyList())
    /** Completed downloads (newest album first, songs in track order), with the metadata saved at download time. */
    val songs: StateFlow<List<Song>> = _songs

    private val _bytes = MutableStateFlow(0L)
    val bytes: StateFlow<Long> = _bytes

    private var poller: Job? = null

    init {
        manager.addListener(object : DownloadManager.Listener {
            override fun onDownloadChanged(m: DownloadManager, download: Download, finalException: Exception?) = refresh()
            override fun onDownloadRemoved(m: DownloadManager, download: Download) = refresh()
            override fun onInitialized(m: DownloadManager) = refresh()
        })
        manager.resumeDownloads()
        refresh()
    }

    fun setWifiOnly(wifiOnly: Boolean) {
        manager.requirements = Requirements(if (wifiOnly) Requirements.NETWORK_UNMETERED else Requirements.NETWORK)
    }

    /** Playback data source: cached (downloaded) bytes first, the network otherwise. Never writes. */
    fun playbackFactory(network: DataSource.Factory): DataSource.Factory =
        CacheDataSource.Factory()
            .setCache(cache)
            .setUpstreamDataSourceFactory(network)
            .setCacheWriteDataSinkFactory(null)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

    fun download(client: SubsonicClient, songs: List<Song>, maxBitRate: Int, format: String?) {
        for (s in songs) {
            if (_states.value[s.id]?.let { it.done || it.active } == true) continue
            val request = DownloadRequest.Builder(s.id, client.streamUrl(s.id, maxBitRate, format).toUri())
                .setCustomCacheKey(cacheKey(s.id))
                .setData(SubsonicClient.json.encodeToString(Song.serializer(), s).toByteArray())
                .build()
            DownloadService.sendAddDownload(context, CpDownloadService::class.java, request, false)
        }
        prefetchCovers(client, songs)
    }

    fun remove(ids: Collection<String>) {
        ids.forEach { DownloadService.sendRemoveDownload(context, CpDownloadService::class.java, it, false) }
    }

    fun removeAll() = DownloadService.sendRemoveAllDownloads(context, CpDownloadService::class.java, false)

    /** Covers in the sizes the app shows, so downloaded albums still have art offline. */
    private fun prefetchCovers(client: SubsonicClient, songs: List<Song>) {
        val loader = SingletonImageLoader.get(context)
        for (art in songs.mapNotNull { it.coverArt }.distinct()) {
            for (size in listOf(120, 150, 300, 600)) {
                val key = "cover:${client.server.baseUrl}:$art:$size"
                loader.enqueue(
                    ImageRequest.Builder(context).data(client.coverUrl(art, size)).memoryCacheKey(key).diskCacheKey(key).build(),
                )
            }
        }
    }

    private fun refresh() {
        scope.launch(Dispatchers.IO) {
            val all = ArrayList<Download>()
            manager.downloadIndex.getDownloads().use { c -> while (c.moveToNext()) all += c.download }
            _states.value = all.associate { it.request.id to DownloadState(it.state, it.percentDownloaded.coerceAtLeast(0f)) }
            _songs.value = all.filter { it.state == Download.STATE_COMPLETED }
                .sortedByDescending { it.updateTimeMs }
                .mapNotNull { d ->
                    runCatching { SubsonicClient.json.decodeFromString(Song.serializer(), String(d.request.data)) }.getOrNull()
                }
                // Newest album first, its songs in track order.
                .groupBy { it.albumId ?: it.id }
                .values
                .flatMap { album -> album.sortedWith(compareBy({ it.discNumber ?: 0 }, { it.track ?: 0 })) }
            _bytes.value = runCatching { cache.cacheSpace }.getOrDefault(0L)
            // DownloadManager does not report progress on its own; poll while something runs.
            if (all.any { it.state == Download.STATE_DOWNLOADING } && poller?.isActive != true) {
                poller = scope.launch {
                    while (isActive && manager.currentDownloads.isNotEmpty()) {
                        delay(1000)
                        _states.value = _states.value.toMutableMap().apply {
                            manager.currentDownloads.forEach { put(it.request.id, DownloadState(it.state, it.percentDownloaded.coerceAtLeast(0f))) }
                        }
                    }
                }
            }
        }
    }

    companion object {
        fun cacheKey(songId: String) = "song:$songId"
    }
}
