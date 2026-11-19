package com.tonihk00.clearplay

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.memory.MemoryCache
import coil3.request.crossfade
import com.tonihk00.clearplay.data.ServerStore
import com.tonihk00.clearplay.data.SongEdits
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.player.PlayerConnection
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.Dispatchers

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

    override fun onCreate() {
        super.onCreate()
        instance = this
        servers = ServerStore(this)
        session = servers.active
            .map { s -> if (s == null) Session.LoggedOut else Session.Active(SubsonicClient(s)) }
            .stateIn(appScope, SharingStarted.Eagerly, Session.Loading)
        player = PlayerConnection(this, appScope) { client }
    }

    override fun newImageLoader(context: PlatformContext): ImageLoader =
        ImageLoader.Builder(context)
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
}
