package com.tonihk00.clearplay

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.memory.MemoryCache
import coil3.request.crossfade
import com.tonihk00.clearplay.data.AppSettings
import com.tonihk00.clearplay.data.ConnectionMonitor
import com.tonihk00.clearplay.data.PhoneMusic
import com.tonihk00.clearplay.data.Downloads
import com.tonihk00.clearplay.data.flushTo
import com.tonihk00.clearplay.data.ServerStore
import com.tonihk00.clearplay.data.SongEdits
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.player.PlayerConnection
import com.tonihk00.clearplay.player.toMediaItem
import com.tonihk00.clearplay.player.toSong
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.guava.await

/** Plain constructor-injected app graph; no DI framework. */
class ClearPlayApp : Application(), SingletonImageLoader.Factory {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    lateinit var servers: ServerStore
        private set

    /** Loading until DataStore answers, then logged out or a client for the active server. */
    lateinit var session: StateFlow<Session>
        private set

    val client: SubsonicClient? get() = (session.value as? Session.Active)?.client

    lateinit var player: PlayerConnection
        private set

    /** The queue as last left on this phone (filesDir/queue.json), written by the player service. */
    val queueStore by lazy { com.tonihk00.clearplay.player.QueueStore(filesDir.resolve("queue.json")) }

    /** Shuffle library's refill, attached to the player service's player. */
    val queueFiller by lazy {
        com.tonihk00.clearplay.player.QueueFiller(appScope, { library.value }) { songs ->
            val c = client
            val bitrate = streamBitrate()
            val format = settings.state.value.format.param
            songs.map { it.toMediaItem(c, bitrate, format) }
        }
    }

    /** The player service's own player while the service runs (main thread only). */
    @Volatile var servicePlayer: androidx.media3.common.Player? = null

    /** Continue on other devices. */
    lateinit var handoff: com.tonihk00.clearplay.player.Handoff
        private set

    /** First pages of the library lists on disk, per account (shown at once on a cold start). */
    val libraryCache by lazy { com.tonihk00.clearplay.data.LibraryCache(cacheDir.resolve("library")) }

    /** Launcher shortcuts (Shuffle library, Resume, Downloads). */
    val shortcuts by lazy { Shortcuts(this, appScope) }

    /** Shortcut actions from MainActivity, waiting for the UI (replayed once to a late collector). */
    val shortcutRequests = kotlinx.coroutines.flow.MutableSharedFlow<String>(replay = 1, extraBufferCapacity = 4)

    val edits = SongEdits()

    lateinit var phone: PhoneMusic
        private set

    /** Server reachability; offline means the library comes from downloads and phone music. */
    val connection: ConnectionMonitor by lazy { ConnectionMonitor(this, appScope) { client } }

    /**
     * What the screens read: the server while it answers, otherwise ClearPlay downloads plus
     * (if allowed) the phone's own music, laid out the same way.
     */
    @get:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
    val library: StateFlow<com.tonihk00.clearplay.data.api.MusicLibrary?> by lazy {
        combine(session, connection.online, downloads.songs, phone.songs, settings.state) { s, online, dl, ph, st ->
            val offlineSongs = dl.map(::withOfflineCover) + (if (st.phoneMusic) ph else emptyList())
            when (s) {
                is Session.Active -> if (online) s.client else com.tonihk00.clearplay.data.api.OfflineLibrary(offlineSongs, downloads::savedLyrics)
                Session.Local -> com.tonihk00.clearplay.data.api.OfflineLibrary(offlineSongs, downloads::savedLyrics)
                else -> null
            }
        }.stateIn(appScope, SharingStarted.Eagerly, null)
    }

    lateinit var settings: AppSettings
        private set

    /** Saved server addresses, kept in memory (the player service reads them synchronously). */
    val savedServers: StateFlow<List<com.tonihk00.clearplay.data.api.ServerConfig>> by lazy {
        servers.servers.stateIn(appScope, SharingStarted.Eagerly, emptyList())
    }

    /** Listens not yet sent to the server (offline plays wait here). */
    val scrobbles: com.tonihk00.clearplay.data.ScrobbleQueue by lazy {
        com.tonihk00.clearplay.data.ScrobbleQueue(filesDir.resolve("scrobbles.json"))
    }

    /** Statistics snapshots per server account: refreshed online, shown unchanged offline. */
    val stats: com.tonihk00.clearplay.data.stats.StatsRepository by lazy {
        com.tonihk00.clearplay.data.stats.StatsRepository(
            com.tonihk00.clearplay.data.stats.StatsStore(filesDir.resolve("stats")), appScope,
        )
    }

    /** Sends queued listens now, if the server answers. */
    fun flushScrobbles() {
        val c = client ?: return
        if (!connection.online.value) return
        appScope.launch { runCatching { scrobbles.flushTo(c) } }
    }

    /** Offline downloads; created on first use (the cache folder is locked to one instance). */
    @get:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
    val downloads: Downloads by lazy {
        Downloads(this, appScope).also { d ->
            appScope.launch { settings.state.collect { d.setWifiOnly(it.downloadWifiOnly) } }
        }
    }

    /** Last server address (kept after sign-out), for covers of downloads made before 1.2. */
    val lastServerUrl: StateFlow<String?> by lazy { servers.lastUrl.stateIn(appScope, SharingStarted.Eagerly, null) }

    /** Downloaded covers are found in the image cache by their server address ("srv:<base>|<id>"). */
    fun withOfflineCover(song: com.tonihk00.clearplay.data.api.Song): com.tonihk00.clearplay.data.api.Song {
        val art = song.coverArt ?: return song
        if (song.isLocal || art.startsWith("srv:")) return song
        val base = song.server ?: lastServerUrl.value ?: client?.server?.baseUrl ?: return song
        return song.copy(coverArt = "srv:$base|$art")
    }

    /** Whether this song plays from its download now (Settings → Player → Playback source). */
    @androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
    fun playsFromDownload(songId: String): Boolean =
        settings.state.value.playbackSource.useDownload(
            downloaded = downloads.states.value[songId]?.done == true,
            online = connection.online.value,
            hasServer = client != null,
        )

    /** Stream bitrate cap for the current network (Wi-Fi vs mobile data). */
    fun streamBitrate(): Int {
        val s = settings.state.value
        val cm = getSystemService(android.net.ConnectivityManager::class.java)
        val caps = cm?.getNetworkCapabilities(cm.activeNetwork)
        val unmetered = caps?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_NOT_METERED) ?: true
        // Bit-perfect with a USB DAC attached: always the original file.
        if (s.bitPerfect && usbDacConnected()) return 0
        return if (unmetered) s.wifiBitrate else s.mobileBitrate
    }

    fun usbDacConnected(): Boolean =
        getSystemService(android.media.AudioManager::class.java)?.getDevices(android.media.AudioManager.GET_DEVICES_OUTPUTS)
            ?.any { it.type == android.media.AudioDeviceInfo.TYPE_USB_DEVICE || it.type == android.media.AudioDeviceInfo.TYPE_USB_HEADSET } == true

    override fun onCreate() {
        super.onCreate()
        instance = this
        servers = ServerStore(this)
        settings = AppSettings(this, appScope, blurDefault = blurDefault())
        session = combine(servers.active, servers.localMode) { s, local ->
            when {
                local -> Session.Local
                s == null -> Session.LoggedOut
                else -> Session.Active(SubsonicClient(s))
            }
        }.stateIn(appScope, SharingStarted.Eagerly, Session.Loading)
        phone = PhoneMusic(this, appScope).also { it.refresh() }
        appScope.launch {
            session.collect {
                if (it is Session.Active) {
                    servers.rememberUrl(it.client.server.baseUrl)
                    // New or switched server: find out right away whether it answers.
                    connection.recheck()
                }
            }
        }
        // Debug builds: say once whether the Baseline Profile was installed and compiled.
        if (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            appScope.launch {
                runCatching {
                    // Suspends (never parks a thread): the status may never come (e.g. in tests).
                    val s = kotlinx.coroutines.withTimeoutOrNull(30_000) {
                        androidx.profileinstaller.ProfileVerifier.getCompilationStatusAsync().await()
                    } ?: return@runCatching
                    android.util.Log.i(
                        "ProfileVerifier",
                        "status=${s.profileInstallResultCode} compiledWithProfile=${s.isCompiledWithProfile} pendingCompilation=${s.hasProfileEnqueuedForCompilation()}",
                    )
                }
            }
        }
        player = PlayerConnection(this, appScope, { client }, queueFiller, queueStore)
        handoff = com.tonihk00.clearplay.player.Handoff(
            appScope,
            client = { client },
            online = { connection.online.value },
            enabled = { settings.state.value.syncQueue },
            player = HandoffPlayer(),
            handled = object : com.tonihk00.clearplay.player.Handoff.HandledStore {
                override fun get(key: String) = settings.handledChanged.value[key]
                override fun set(key: String, value: String) { appScope.launch { settings.setHandledChanged(key, value) } }
            },
        )
        savedServers
        // Continue on other devices: look at the server's queue when the app starts, when the
        // account changes and when the server answers again after being unreachable.
        appScope.launch {
            var lastClient: SubsonicClient? = null
            combine(session, connection.online) { s, online -> (s as? Session.Active)?.client to online }
                .collect { (c, online) ->
                    if (c !== lastClient) { handoff.reset(); lastClient = c }
                    if (c != null && online) handoff.look()
                }
        }
        // Shortcuts: Resume names the saved song of the account in use (disabled when none).
        appScope.launch {
            session.collect { s ->
                if (s is Session.Loading) return@collect
                val key = com.tonihk00.clearplay.player.QueueStore.keyOf((s as? Session.Active)?.client)
                val saved = kotlinx.coroutines.withContext(Dispatchers.IO) { queueStore.load() }
                    ?.takeIf { s !is Session.LoggedOut && it.server == key }
                shortcuts.publish(saved?.songs?.getOrNull(saved.index))
            }
        }
        // Listens made offline go out as soon as the server answers again.
        appScope.launch {
            combine(session, connection.online) { s, online -> (s as? Session.Active)?.client?.takeIf { online } }
                .collect { c -> if (c != null) runCatching { scrobbles.flushTo(c) } }
        }
        // Signed in / server answering: find out once per server whether it takes reportPlayback.
        appScope.launch {
            combine(session, connection.online) { s, online -> (s as? Session.Active)?.client?.takeIf { online } }
                .collect { c -> c?.supportsPlaybackReport() }
        }
        // Back online after being offline: refetch Statistics (if they were ever loaded for this
        // account) so the saved snapshot is replaced without a pull to refresh.
        appScope.launch {
            var offlineFor: com.tonihk00.clearplay.data.api.SubsonicClient? = null
            combine(session, connection.online) { s, online -> (s as? Session.Active)?.client to online }
                .collect { (c, online) ->
                    if (c == null) { offlineFor = null; return@collect }
                    if (!online) { offlineFor = c; return@collect }
                    if (offlineFor !== c) return@collect
                    offlineFor = null
                    val server = c.server
                    val known = kotlinx.coroutines.withContext(Dispatchers.IO) { stats.saved(server) } != null
                    if (known && !stats.fetchedWithin(server, 60_000)) {
                        stats.refresh(server) { offset -> c.songs(com.tonihk00.clearplay.data.stats.STATS_PAGE, offset) }
                    }
                }
        }
    }

    /** Live glass blur on a first run, by device (see liveBlurDefault); the inputs are logged once. */
    private fun blurDefault(): Boolean {
        val info = runCatching { packageManager.getPackageInfo(packageName, 0) }.getOrNull()
        val updated = info != null && info.lastUpdateTime > info.firstInstallTime
        val pc = if (android.os.Build.VERSION.SDK_INT >= 31) android.os.Build.VERSION.MEDIA_PERFORMANCE_CLASS else 0
        val lowRam = getSystemService(android.app.ActivityManager::class.java)?.isLowRamDevice == true
        return com.tonihk00.clearplay.data.liveBlurDefault(updated, pc, lowRam).also {
            android.util.Log.i("ClearPlay", "media performance class $pc, low RAM $lowRam, updated from an earlier version $updated → live blur default $it")
        }
    }

    override fun newImageLoader(context: PlatformContext): ImageLoader =
        ImageLoader.Builder(context)
            .components { add(com.tonihk00.clearplay.data.PhoneArtFetcher.Factory(this@ClearPlayApp)) }
            .crossfade(220)
            .memoryCache { MemoryCache.Builder().maxSizePercent(context, 0.15).build() }
            .diskCache {
                DiskCache.Builder().directory(cacheDir.resolve("covers")).maxSizeBytes(150L * 1024 * 1024).build()
            }
            .build()

    companion object {
        lateinit var instance: ClearPlayApp
            private set
    }
}

/**
 * What "Continue on other devices" reads from the player: the service's own player while it
 * runs (works without the UI), else the UI's mirror of it. Starting a queue goes through the
 * UI's controller (Continue is always a tap in the app).
 */
private class HandoffPlayer : com.tonihk00.clearplay.player.Handoff.Player {
    private val app get() = ClearPlayApp.instance
    private val service get() = app.servicePlayer

    override fun songs(): List<com.tonihk00.clearplay.data.api.Song> {
        service?.let { p -> return (0 until p.mediaItemCount).map { p.getMediaItemAt(it).toSong() } }
        return app.player.state.value.queue
    }

    override fun currentIndex(): Int = service?.currentMediaItemIndex ?: app.player.state.value.index

    override fun positionMs(): Long = service?.currentPosition ?: app.player.positionMs

    override fun isPlaying(): Boolean = service?.isPlaying ?: app.player.state.value.isPlaying

    override suspend fun startQueueAt(songs: List<com.tonihk00.clearplay.data.api.Song>, index: Int, positionMs: Long) =
        app.player.startQueueAt(songs, index, positionMs)

    override fun pause() {
        service?.pause() ?: app.player.pause()
    }
}

sealed interface Session {
    data object Loading : Session
    data object LoggedOut : Session
    data class Active(val client: SubsonicClient) : Session

    /** Signed in with "Use music on this phone": phone music and downloads, no server. */
    data object Local : Session
}
