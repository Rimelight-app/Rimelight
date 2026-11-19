package com.tonihk00.clearplay.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import coil3.SingletonImageLoader
import com.tonihk00.clearplay.ClearPlayApp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.Session
import com.tonihk00.clearplay.data.api.Album
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.player.PlayerConnection
import com.tonihk00.clearplay.player.PlayerState
import com.tonihk00.clearplay.ui.components.BackdropLayer
import com.tonihk00.clearplay.ui.components.CoverBackdrop
import com.tonihk00.clearplay.ui.components.CpIcon
import com.tonihk00.clearplay.ui.components.LocalClient
import com.tonihk00.clearplay.ui.components.ToastHost
import com.tonihk00.clearplay.ui.components.ToastState
import com.tonihk00.clearplay.ui.components.coverRequest
import com.tonihk00.clearplay.ui.components.liveGlass
import com.tonihk00.clearplay.ui.library.AlbumScreen
import com.tonihk00.clearplay.ui.library.ArtistScreen
import com.tonihk00.clearplay.ui.library.BackButton
import com.tonihk00.clearplay.ui.library.GenreScreen
import com.tonihk00.clearplay.ui.library.LibraryScreen
import com.tonihk00.clearplay.ui.library.PlaylistScreen
import com.tonihk00.clearplay.ui.login.LoginScreen
import com.tonihk00.clearplay.ui.player.FullPlayer
import com.tonihk00.clearplay.ui.player.LyricsState
import com.tonihk00.clearplay.ui.player.MiniPlayer
import com.tonihk00.clearplay.ui.player.PlayerControls
import com.tonihk00.clearplay.ui.player.SongMenu
import com.tonihk00.clearplay.ui.search.SearchScreen
import com.tonihk00.clearplay.ui.settings.SettingsScreen
import com.tonihk00.clearplay.ui.stats.StatsScreen
import com.tonihk00.clearplay.ui.theme.Cp
import com.tonihk00.clearplay.ui.theme.LocalReduceMotion
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.net.URLDecoder
import java.net.URLEncoder

/** Asks for the audio permission, then switches to "music on this phone". */
@Composable
fun rememberUsePhone(onDone: () -> Unit = {}): () -> Unit {
    val app = ClearPlayApp.instance
    val scope = rememberCoroutineScope()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        app.phone.refresh()
        scope.launch { app.servers.setLocalMode(true); onDone() }
    }
    return {
        if (app.phone.hasPermission()) scope.launch { app.phone.refresh(); app.servers.setLocalMode(true); onDone() }
        else launcher.launch(app.phone.permission)
    }
}

@Composable
fun AppRoot() {
    val app = ClearPlayApp.instance
    val session by app.session.collectAsState()
    val settings by app.settings.state.collectAsState()
    val scope = rememberCoroutineScope()
    val usePhone = rememberUsePhone()
    CompositionLocalProvider(LocalBackdropMode provides settings.backdrop) {
        when (val s = session) {
            Session.Loading -> BackdropLayer(null)
            Session.LoggedOut -> Box(Modifier.fillMaxSize()) {
                BackdropLayer(null)
                LoginScreen(onLoggedIn = { app.servers.saveAndActivate(it) }, onUsePhone = usePhone)
            }
            is Session.Active -> CompositionLocalProvider(LocalClient provides s.client, LocalEdits provides app.edits) {
                MainScaffold(app.player, s.client) {
                    scope.launch {
                        app.player.reset()
                        app.servers.remove(s.client.server)
                    }
                }
            }
            Session.Local -> CompositionLocalProvider(LocalClient provides null, LocalEdits provides app.edits) {
                MainScaffold(app.player, null) {
                    scope.launch {
                        app.player.reset()
                        app.servers.setLocalMode(false)
                    }
                }
            }
        }
    }
}

private class PlayerControlsImpl(private val p: PlayerConnection) : PlayerControls {
    override fun togglePlay() = p.togglePlay()
    override fun next() = p.next()
    override fun previous() = p.previous()
    override fun seekTo(ms: Long) = p.seekTo(ms)
    override fun toggleShuffle() = p.toggleShuffle()
    override fun cycleRepeat() = p.cycleRepeat()
    override fun skipTo(index: Int) = p.skipTo(index)
    override fun removeAt(index: Int) = p.removeAt(index)
    override fun clearQueue() = p.clearQueue()
    override fun position(): Long = p.positionMs
    override fun setSleep(minutes: Int?, endOfSong: Boolean) = p.setSleepTimer(minutes, endOfSong)
}

private enum class Tab(val route: String, val label: String, val icon: Int) {
    Library("library", "Library", R.drawable.ic_library),
    Search("search", "Search", R.drawable.ic_search),
    Stats("stats", "Stats", R.drawable.ic_chart_line),
    Settings("settings", "Settings", R.drawable.ic_settings),
}

private fun plural(n: Int, one: String) = "$n $one${if (n == 1) "" else "s"}"

@Composable
private fun MainScaffold(player: PlayerConnection, client: SubsonicClient?, onLogout: () -> Unit) {
    val app = ClearPlayApp.instance
    val context = LocalContext.current
    val state by player.state.collectAsState()
    val nav = rememberNavController()
    val scope = rememberCoroutineScope()
    val hazeState = rememberHazeState()
    val reduce = LocalReduceMotion.current
    val controls = remember(player) { PlayerControlsImpl(player) }
    val settings by app.settings.state.collectAsState()
    val haze = if (settings.liveBlur) hazeState else null
    val dlStates by app.downloads.states.collectAsState()
    val dlSongsRaw by app.downloads.songs.collectAsState()
    val lastUrl by app.lastServerUrl.collectAsState()
    val dlSongs = remember(dlSongsRaw, lastUrl) { dlSongsRaw.map(app::withOfflineCover) }
    val library by app.library.collectAsState()
    val online by app.connection.online.collectAsState()
    val sleep by player.sleep.collectAsState()
    val toast = remember { ToastState() }
    var fullOpen by remember { mutableStateOf(false) }
    var menuSong by remember { mutableStateOf<Song?>(null) }
    var addingServer by remember { mutableStateOf(false) }
    var dockHeight by remember { mutableStateOf(0.dp) }
    val density = LocalDensity.current
    player.library = { app.library.value }

    suspend fun songsOf(albums: List<Album>): List<Song> {
        val lib = app.library.value ?: return emptyList()
        return coroutineScope {
            albums.map { a -> async { a.song.ifEmpty { runCatching { lib.album(a.id).song }.getOrDefault(emptyList()) } } }.awaitAll().flatten()
        }
    }

    val actions = remember(nav, player, client) {
        object : UiActions {
            override fun openAlbum(id: String) { fullOpen = false; nav.navigate("album/${URLEncoder.encode(id, "UTF-8")}") }
            override fun openArtist(id: String) { fullOpen = false; nav.navigate("artist/${URLEncoder.encode(id, "UTF-8")}") }
            override fun openPlaylist(id: String) = nav.navigate("playlist/${URLEncoder.encode(id, "UTF-8")}")
            override fun openGenre(name: String) = nav.navigate("genre/${URLEncoder.encode(name, "UTF-8")}")
            override fun play(songs: List<Song>, index: Int, shuffle: Boolean) = player.play(songs, index, shuffle)
            override fun playNext(songs: List<Song>) {
                player.playNext(songs)
                toast.show(if (songs.size == 1) "Playing next: ${songs[0].title}" else "${plural(songs.size, "song")} play next")
            }
            override fun addToQueue(songs: List<Song>) {
                player.addToQueue(songs)
                toast.show(if (songs.size == 1) "Added to queue: ${songs[0].title}" else "${plural(songs.size, "song")} added to queue")
            }
            override fun shuffleLibrary() {
                player.shuffleLibrary()
                toast.show("Shuffling your library")
            }
            override fun songMenu(song: Song) { menuSong = song }
            override fun toggleLike(song: Song) {
                val c = client
                if (c == null || !app.connection.online.value) return toast.show("Likes need your server")
                scope.launch { app.edits.toggleStar(c, song) }
            }
            override fun rate(song: Song, stars: Int) {
                val c = client
                if (c == null || !app.connection.online.value) return toast.show("Ratings need your server")
                scope.launch { app.edits.rate(c, song, stars) }
            }
            override fun download(songs: List<Song>) {
                val c = client
                if (c == null || !app.connection.online.value) return toast.show("Downloading needs your server")
                val st = app.settings.state.value
                app.downloads.download(c, songs, st.downloadBitrate, st.format.param)
                toast.show(if (st.downloadWifiOnly && !isUnmetered(context)) "Will download on Wi-Fi" else "Downloading ${plural(songs.size, "song")}")
            }
            override fun removeDownload(songs: List<Song>) {
                app.downloads.remove(songs.map { it.id })
                toast.show("Removed ${plural(songs.size, "download")}")
            }
            override fun albums(albums: List<Album>, action: AlbumBulk) {
                scope.launch {
                    val songs = songsOf(albums)
                    if (songs.isEmpty()) return@launch toast.show("Nothing to play")
                    when (action) {
                        AlbumBulk.Play -> player.play(songs)
                        AlbumBulk.Shuffle -> player.play(songs, shuffle = true)
                        AlbumBulk.PlayNext -> playNext(songs)
                        AlbumBulk.AddToQueue -> addToQueue(songs)
                        AlbumBulk.Download -> download(songs)
                        AlbumBulk.RemoveDownload -> removeDownload(songs.filter { dlStates[it.id] != null })
                    }
                }
            }
        }
    }

    // Lyrics for the current song: from the server, or the copy saved with a download.
    var lyrics by remember { mutableStateOf<LyricsState>(LyricsState.None) }
    val current = state.current
    LaunchedEffect(current?.id, library) {
        if (current == null) { lyrics = LyricsState.None; return@LaunchedEffect }
        lyrics = LyricsState.Loading
        val l = runCatching { library?.lyrics(current) }.getOrNull() ?: app.downloads.savedLyrics(current.id)
        lyrics = l?.let { LyricsState.Ready(it) } ?: LyricsState.None
    }
    // Warm the big cover as soon as a song starts, so the full player opens without a blink.
    LaunchedEffect(current?.coverArt) {
        current?.coverArt?.let { art ->
            listOf(150, 600).forEach { size -> coverRequest(context, client, art, size)?.let { SingletonImageLoader.get(context).enqueue(it) } }
        }
    }

    val playingId = current?.id
    val streamCap = remember(settings, online) { app.streamBitrate().takeIf { it > 0 }?.let { it to settings.format.param } }

    CompositionLocalProvider(
        LocalActions provides actions,
        LocalDownloadStates provides dlStates,
        LocalDownloadedSongs provides dlSongs,
        LocalLibrary provides library,
        LocalOnline provides (client == null || online),
        LocalToast provides toast::show,
        LocalConnectionLost provides { app.connection.recheck() },
    ) {
        Box(Modifier.fillMaxSize()) {
            // Everything under the dock is a Haze source, so the bars can blur it.
            // While the fullscreen player covers them, the page and dock are hidden from TalkBack.
            val hidden = if (fullOpen) Modifier.clearAndSetSemantics {} else Modifier
            Box(Modifier.fillMaxSize().hazeSource(hazeState).then(hidden)) {
                CoverBackdrop(current?.coverArt)
                AppNavHost(nav, dockHeight, playingId, client, onLogout, sleep) { addingServer = true }
            }
            Column(
                Modifier.align(Alignment.BottomCenter).then(hidden).onSizeChanged { dockHeight = with(density) { it.height.toDp() } },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                ToastHost(toast, haze, Modifier.padding(bottom = 8.dp))
                Dock(nav, state, controls, haze, onOpen = { fullOpen = true })
            }
            AnimatedVisibility(
                fullOpen && current != null,
                enter = slideInVertically(tween(if (reduce) 0 else Cp.ScreenMs, easing = Cp.EaseOutSoft)) { it } + fadeIn(tween(if (reduce) 0 else 200)),
                exit = slideOutVertically(tween(if (reduce) 0 else Cp.ScreenMs, easing = Cp.EaseOutSoft)) { it } + fadeOut(tween(if (reduce) 0 else 250)),
            ) {
                FullPlayer(state, controls, lyrics, onClose = { fullOpen = false }, sleep = sleep, streamCap = streamCap)
            }
            menuSong?.let { SongMenu(it) { menuSong = null } }
            if (addingServer) {
                BackHandler { addingServer = false }
                Box(Modifier.fillMaxSize()) {
                    BackdropLayer(null, dim = 0.1f)
                    LoginScreen(onLoggedIn = { srv ->
                        player.reset()
                        app.servers.saveAndActivate(srv)
                        addingServer = false
                    })
                    BackButton({ addingServer = false })
                }
            }
        }
    }
}

private fun isUnmetered(context: android.content.Context): Boolean {
    val cm = context.getSystemService(android.net.ConnectivityManager::class.java) ?: return true
    return cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_NOT_METERED) ?: false
}

@Composable
private fun AppNavHost(
    nav: NavHostController,
    bottom: Dp,
    playingId: String?,
    client: SubsonicClient?,
    onLogout: () -> Unit,
    sleep: PlayerConnection.Sleep?,
    onAddServer: () -> Unit,
) {
    val reduce = LocalReduceMotion.current
    val t = if (reduce) 0 else Cp.ScreenMs
    fun dec(s: String?) = URLDecoder.decode(s.orEmpty(), "UTF-8")
    NavHost(
        nav, startDestination = Tab.Library.route,
        // Pages slide in a little from the right and fade; going back (also the predictive
        // back swipe) shrinks the page away and reveals the one below.
        enterTransition = { fadeIn(tween(t, easing = Cp.EaseOutSoft)) + slideInHorizontally(tween(t, easing = Cp.EaseOutSoft)) { it / 10 } },
        exitTransition = { fadeOut(tween(t / 2)) + scaleOut(tween(t, easing = Cp.EaseOutSoft), 0.97f) },
        popEnterTransition = { fadeIn(tween(t, easing = Cp.EaseOutSoft)) + scaleIn(tween(t, easing = Cp.EaseOutSoft), 0.97f) },
        popExitTransition = { fadeOut(tween(t, easing = Cp.EaseOutSoft)) + scaleOut(tween(t, easing = Cp.EaseOutSoft), 0.9f) },
    ) {
        composable(Tab.Library.route) { LibraryScreen(bottom, playingId) }
        composable(Tab.Search.route) { SearchScreen(bottom, playingId) }
        composable(Tab.Stats.route) { StatsScreen(bottom) }
        composable(Tab.Settings.route) { SettingsRoute(client, bottom, sleep, onLogout, onAddServer) }
        composable("album/{id}", listOf(navArgument("id") { type = NavType.StringType })) {
            AlbumScreen(dec(it.arguments?.getString("id")), bottom, playingId) { nav.popBackStack() }
        }
        composable("artist/{id}", listOf(navArgument("id") { type = NavType.StringType })) {
            ArtistScreen(dec(it.arguments?.getString("id")), bottom) { nav.popBackStack() }
        }
        composable("playlist/{id}", listOf(navArgument("id") { type = NavType.StringType })) {
            PlaylistScreen(dec(it.arguments?.getString("id")), bottom, playingId) { nav.popBackStack() }
        }
        composable("genre/{name}", listOf(navArgument("name") { type = NavType.StringType })) {
            GenreScreen(dec(it.arguments?.getString("name")), bottom, playingId) { nav.popBackStack() }
        }
    }
}

/** Mini player and tab bar, both frosted glass floating over the page. */
@Composable
private fun Dock(nav: NavHostController, state: PlayerState, controls: PlayerControls, haze: HazeState?, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    DockContent(
        state, controls, haze, onOpen,
        // Album, artist, playlist and genre pages belong to the Library tab.
        selected = Tab.entries.firstOrNull { it.route == route } ?: Tab.Library.takeIf { route != null },
        onTab = { t ->
            nav.navigate(t.route) {
                popUpTo(Tab.Library.route) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        },
        modifier = modifier,
    )
}

@Composable
private fun DockContent(
    state: PlayerState,
    controls: PlayerControls,
    haze: HazeState?,
    onOpen: () -> Unit,
    selected: Tab?,
    onTab: (Tab) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 10.dp).padding(bottom = 6.dp)) {
        MiniPlayer(state, controls, onOpen, haze, Modifier.padding(bottom = 8.dp))
        Row(
            Modifier.fillMaxWidth().liveGlass(haze, RoundedCornerShape(22.dp)).padding(horizontal = 6.dp, vertical = 2.dp),
            horizontalArrangement = Arrangement.SpaceAround,
        ) {
            Tab.entries.forEach { t -> TabItem(t, t == selected) { onTab(t) } }
        }
    }
}

@Composable
private fun TabItem(tab: Tab, selected: Boolean, onClick: () -> Unit) {
    val color = if (selected) Cp.TextStrong else Cp.TextFaint
    Column(
        Modifier.padding(vertical = 6.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(if (selected) Cp.Accent else Color.Transparent)
            .clickable(remember { MutableInteractionSource() }, null, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CpIcon(tab.icon, size = 22.dp, tint = color)
        Text(tab.label, style = MaterialTheme.typography.labelMedium, color = color, modifier = Modifier.padding(top = 3.dp))
    }
}

/** For screenshot tests: the dock without navigation. */
@Composable
internal fun DockPreview(state: PlayerState, selectedIndex: Int) {
    DockContent(state, object : PlayerControls {}, null, {}, Tab.entries[selectedIndex], {})
}

/** Settings page wired to the app: servers (with latency), settings, downloads, caches. */
@Composable
private fun SettingsRoute(client: SubsonicClient?, bottom: Dp, sleep: PlayerConnection.Sleep?, onLogout: () -> Unit, onAddServer: () -> Unit) {
    val app = ClearPlayApp.instance
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val servers by app.servers.servers.collectAsState(emptyList())
    val settings by app.settings.state.collectAsState()
    val dlSongs by app.downloads.songs.collectAsState()
    val dlBytes by app.downloads.bytes.collectAsState()
    val phoneSongs by app.phone.songs.collectAsState()
    var latency by remember { mutableStateOf<Map<String, Long?>>(emptyMap()) }
    var imageBytes by remember { mutableStateOf(0L) }
    val loader = SingletonImageLoader.get(context)
    val askPhone = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        app.phone.refresh()
        scope.launch { app.settings.update { s -> s.copy(phoneMusic = true) } }
    }

    LaunchedEffect(servers) {
        latency = servers.associate { it.baseUrl to null }
        servers.forEach { srv ->
            launch {
                val t0 = System.nanoTime()
                val ok = runCatching { SubsonicClient(srv).ping() }.isSuccess
                latency = latency + (srv.baseUrl to if (ok) (System.nanoTime() - t0) / 1_000_000 else -1L)
            }
        }
    }
    LaunchedEffect(Unit) { imageBytes = loader.diskCache?.size ?: 0L }

    val actions = remember(client) {
        object : com.tonihk00.clearplay.ui.settings.SettingsActions {
            override fun switchServer(s: com.tonihk00.clearplay.data.api.ServerConfig) {
                scope.launch { app.player.reset(); app.servers.saveAndActivate(s) }
            }
            override fun removeServer(s: com.tonihk00.clearplay.data.api.ServerConfig) { scope.launch { app.servers.remove(s) } }
            override fun addServer() = onAddServer()
            override fun signOut() = onLogout()
            override fun update(change: (com.tonihk00.clearplay.data.Settings) -> com.tonihk00.clearplay.data.Settings) {
                scope.launch { app.settings.update(change) }
            }
            override fun removeAllDownloads() = app.downloads.removeAll()
            override fun clearImageCache() {
                loader.memoryCache?.clear()
                loader.diskCache?.clear()
                imageBytes = 0L
            }
            override fun setSleep(minutes: Int?, endOfSong: Boolean) = app.player.setSleepTimer(minutes, endOfSong)
            override fun phoneMusic(on: Boolean) {
                if (on && !app.phone.hasPermission()) askPhone.launch(app.phone.permission)
                else scope.launch { app.settings.update { s -> s.copy(phoneMusic = on) } }
            }
        }
    }
    SettingsScreen(
        com.tonihk00.clearplay.ui.settings.SettingsUi(
            servers = servers, active = client?.server, latency = latency, settings = settings,
            downloadCount = dlSongs.size, downloadBytes = dlBytes, imageCacheBytes = imageBytes,
            sleep = sleep, version = com.tonihk00.clearplay.BuildConfigInfo.versionName,
            phoneSongs = if (app.phone.hasPermission()) phoneSongs.size else null,
            localMode = client == null,
        ),
        actions, bottom,
    )
}
