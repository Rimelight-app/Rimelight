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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

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
        return if (unmetered) s.wifiBitrate else s.mobileBitrate
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        servers = ServerStore(this)
        settings = AppSettings(this, appScope)
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
        player = PlayerConnection(this, appScope) { client }
        savedServers
        // Listens made offline go out as soon as the server answers again.
        appScope.launch {
            combine(session, connection.online) { s, online -> (s as? Session.Active)?.client?.takeIf { online } }
                .collect { c -> if (c != null) runCatching { scrobbles.flushTo(c) } }
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

sealed interface Session {
    data object Loading : Session
    data object LoggedOut : Session
    data class Active(val client: SubsonicClient) : Session

    /** Signed in with "Use music on this phone": phone music and downloads, no server. */
    data object Local : Session
}
