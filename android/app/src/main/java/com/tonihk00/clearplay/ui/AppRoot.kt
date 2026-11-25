package com.tonihk00.clearplay.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
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
import androidx.compose.ui.draw.drawWithContent
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
import kotlinx.coroutines.flow.first
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
    // A shortcut used while signed out: the login screen shows and the shortcut is dropped.
    LaunchedEffect(session) {
        if (session is Session.LoggedOut) {
            app.shortcutRequests.collect { app.shortcutRequests.resetReplayCache() }
        }
    }
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
                        app.queueStore.clear()
                        app.libraryCache.clear(s.client.server)
                        app.servers.remove(s.client.server)
                    }
                }
            }
            Session.Local -> CompositionLocalProvider(LocalClient provides null, LocalEdits provides app.edits) {
                MainScaffold(app.player, null) {
                    scope.launch {
                        app.player.reset()
                        app.queueStore.clear()
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
    override fun move(from: Int, to: Int) = p.move(from, to)
    override fun clearQueue() = p.clearQueue()
    override fun position(): Long = p.positionMs
    override fun setSleep(minutes: Int?, endOfSong: Boolean) = p.setSleepTimer(minutes, endOfSong)
}

/** The queue menu's server actions (Continue on other devices), with a toast for the result. */
private class QueueServerControls(
    private val base: PlayerControls,
    private val scope: kotlinx.coroutines.CoroutineScope,
    private val toast: (String) -> Unit,
    override val hasServer: Boolean,
) : PlayerControls by base {
    private val handoff get() = ClearPlayApp.instance.handoff
    override fun loadQueueFromServer() {
        scope.launch { toast(if (handoff.loadFromServer()) "Queue loaded from your server" else "No saved queue on your server") }
    }
    override fun saveQueueToServer() {
        scope.launch { toast(if (handoff.saveToServer()) "Queue saved to your server" else "Couldn't save the queue") }
    }
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
    val toast = remember { ToastState() }
    val controls = remember(player, client) { QueueServerControls(PlayerControlsImpl(player), scope, toast::show, client != null) }
    // Library's tab lives here, so a shortcut can open Library at Downloads.
    var libraryTab by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableIntStateOf(0) }
    val settings by app.settings.state.collectAsState()
    val haze = if (settings.liveBlur) hazeState else null
    val dlStates by app.downloads.states.collectAsState()
    val dlSongsRaw by app.downloads.songs.collectAsState()
    val lastUrl by app.lastServerUrl.collectAsState()
    val dlSongs = remember(dlSongsRaw, lastUrl) { dlSongsRaw.map(app::withOfflineCover) }
    val library by app.library.collectAsState()
    val online by app.connection.online.collectAsState()
    val sleep by player.sleep.collectAsState()
    var fullOpen by remember { mutableStateOf(false) }
    val playerVisibility = remember { androidx.compose.animation.core.MutableTransitionState(false) }
    var revealing by remember { mutableStateOf(false) }
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
            override fun openDecade(start: Int) = nav.navigate("decade/$start")
            override fun play(songs: List<Song>, index: Int, shuffle: Boolean) = player.play(songs, index, shuffle)
            override fun togglePlay() = player.togglePlay()
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

    // Launcher shortcuts (also the one that started the app: replayed once to this collector).
    val shortcutActions = remember(player) {
        com.tonihk00.clearplay.ShortcutActions(
            signedIn = { true },
            whenConnected = { block -> player.whenConnected { block() } },
            shuffleLibrary = { actions.shuffleLibrary() },
            resume = { player.resume() },
            openDownloads = {
                fullOpen = false
                libraryTab = com.tonihk00.clearplay.ui.library.DownloadsTabIndex
                nav.navigate(Tab.Library.route) {
                    popUpTo(Tab.Library.route) { inclusive = false }
                    launchSingleTop = true
                }
            },
            onNothingToResume = { toast.show("Nothing to resume") },
        )
    }
    LaunchedEffect(shortcutActions) {
        app.shortcutRequests.collect { action ->
            app.shortcutRequests.resetReplayCache()
            shortcutActions.handle(action)
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
    // What the pages need from here, in one stable holder: the NavHost's builder must never
    // change (a new builder rebuilds the graph, and one rebuilt in the middle of a page's
    // slide-out left the slide unfinished, so Back and the tabs stopped working).
    val pages = remember(nav) { PageArgs() }
    val logoutNow by androidx.compose.runtime.rememberUpdatedState(onLogout)
    pages.bottom = dockHeight
    pages.playingId = playingId
    pages.client = client
    pages.sleep = sleep
    pages.libraryTab = libraryTab
    pages.onLibraryTab = { libraryTab = it }
    pages.onLogout = { logoutNow() }
    pages.onAddServer = { addingServer = true }
    val streamCap = remember(settings, online) { app.streamBitrate().takeIf { it > 0 }?.let { it to settings.format.param } }

    CompositionLocalProvider(
        LocalActions provides actions,
        LocalDownloadStates provides dlStates,
        LocalPlaybackSource provides settings.playbackSource,
        LocalNowPlaying provides NowPlaying(current?.albumId, state.isPlaying),
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
            // While the player fully covers the app, don't draw the page or the blurred bars at
            // all (they redrew on every progress tick behind an opaque screen). They come back
            // the moment the player starts moving.
            playerVisibility.targetState = fullOpen && current != null
            val covered = playerVisibility.currentState && playerVisibility.isIdle && playerVisibility.targetState && !revealing
            val skipDraw = Modifier.drawWithContent { if (!covered) drawContent() }
            val pageBackdrop = com.tonihk00.clearplay.ui.components.rememberBlurredCover(current?.coverArt)
            Box(Modifier.fillMaxSize().then(skipDraw).hazeSource(hazeState).then(hidden)) {
                com.tonihk00.clearplay.ui.components.BackdropLayer(pageBackdrop)
                CompositionLocalProvider(com.tonihk00.clearplay.ui.components.LocalPageBackdrop provides pageBackdrop) {
                    AppNavHost(nav, pages)
                }
            }
            // Only the mini player and tab bar set the pages' bottom padding. The toast and the
            // Continue pill float above them: their animations must not change the padding (and
            // with it the NavHost) every frame, which left a page transition unfinished: Back and
            // the tabs then did nothing.
            Column(
                Modifier.align(Alignment.BottomCenter).then(skipDraw).then(hidden).padding(bottom = dockHeight),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                ToastHost(toast, haze, Modifier.padding(bottom = 8.dp))
                if (client != null) {
                    com.tonihk00.clearplay.ui.player.HandoffPills(
                        app.handoff, haze, onError = toast::show,
                        modifier = Modifier.padding(horizontal = 10.dp),
                    )
                }
            }
            Box(Modifier.align(Alignment.BottomCenter).then(skipDraw).then(hidden).onSizeChanged { dockHeight = with(density) { it.height.toDp() } }) {
                Dock(nav, state, controls, haze, onOpen = { fullOpen = true })
            }
            AnimatedVisibility(
                playerVisibility,
                enter = slideInVertically(tween(if (reduce) 0 else Cp.ScreenMs, easing = Cp.EaseOutSoft)) { it } + fadeIn(tween(if (reduce) 0 else 200)),
                exit = slideOutVertically(tween(if (reduce) 0 else Cp.ScreenMs, easing = Cp.EaseOutSoft)) { it } + fadeOut(tween(if (reduce) 0 else 250)),
            ) {
                FullPlayer(state, controls, lyrics, onClose = { fullOpen = false }, sleep = sleep, streamCap = streamCap, onReveal = { revealing = it })
            }
            menuSong?.let { SongMenu(it) { menuSong = null } }
            if (addingServer) {
                BackHandler { addingServer = false }
                Box(Modifier.fillMaxSize()) {
                    BackdropLayer(null, dim = 0.1f)
                    LoginScreen(onLoggedIn = { srv ->
                        player.reset()
                        client?.let { app.libraryCache.clear(it.server) }
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

/** Values the pages read (state, so only the pages recompose when they change, never the NavHost's graph). */
@androidx.compose.runtime.Stable
private class PageArgs {
    var bottom by mutableStateOf(0.dp)
    var playingId by mutableStateOf<String?>(null)
    var client by mutableStateOf<SubsonicClient?>(null)
    var sleep by mutableStateOf<PlayerConnection.Sleep?>(null)
    var libraryTab by mutableStateOf(0)
    var onLibraryTab: (Int) -> Unit = {}
    var onLogout: () -> Unit = {}
    var onAddServer: () -> Unit = {}
}

private fun dec(s: String?) = URLDecoder.decode(s.orEmpty(), "UTF-8")

@Composable
private fun AppNavHost(nav: NavHostController, p: PageArgs) {
    val reduce = LocalReduceMotion.current
    val t = if (reduce) 0 else Cp.ScreenMs
    val safe = rememberSafeBack(nav)
    NavHost(
        nav, startDestination = Tab.Library.route,
        // Pages are opaque sheets (each paints the blurred cover). Opening one slides it in
        // from the right while the page below drifts a little left; going back (also the
        // Android back swipe, which follows the finger) slides it off to the right. Bottom-tab
        // switches simply cross-fade. Nothing scales.
        enterTransition = {
            if (isTabSwitch(initialState.destination.route, targetState.destination.route)) fadeIn(tween(t * 2 / 3))
            else slideInHorizontally(tween(t, easing = Cp.EaseOutSoft)) { it }
        },
        exitTransition = {
            if (isTabSwitch(initialState.destination.route, targetState.destination.route)) fadeOut(tween(t / 2))
            else slideOutHorizontally(tween(t, easing = Cp.EaseOutSoft)) { -it / 4 }
        },
        popEnterTransition = {
            if (isTabSwitch(initialState.destination.route, targetState.destination.route)) fadeIn(tween(t * 2 / 3))
            else slideInHorizontally(tween(t, easing = Cp.EaseOutSoft)) { -it / 4 }
        },
        popExitTransition = {
            if (isTabSwitch(initialState.destination.route, targetState.destination.route)) fadeOut(tween(t / 2))
            else slideOutHorizontally(tween(t, easing = Cp.EaseOutSoft)) { it }
        },
        // The Android back swipe has its own animations, which by default shrink the page.
        // Use the same slide: the page follows the finger off to the right.
        predictivePopEnterTransition = { slideInHorizontally(tween(t, easing = LinearEasing)) { -it / 4 } },
        predictivePopExitTransition = { slideOutHorizontally(tween(t, easing = LinearEasing)) { it } },
    ) {
        composable(Tab.Library.route) { com.tonihk00.clearplay.ui.components.Page { LibraryScreen(p.bottom, p.playingId, tab = p.libraryTab, onTab = { p.onLibraryTab(it) }) } }
        composable(Tab.Search.route) { com.tonihk00.clearplay.ui.components.Page { SearchScreen(p.bottom, p.playingId) } }
        composable(Tab.Stats.route) { com.tonihk00.clearplay.ui.components.Page { StatsScreen(p.bottom) } }
        composable(Tab.Settings.route) { com.tonihk00.clearplay.ui.components.Page { SettingsRoute(p.client, p.bottom, p.sleep, { p.onLogout() }, { p.onAddServer() }) } }
        composable("album/{id}", listOf(navArgument("id") { type = NavType.StringType })) {
            com.tonihk00.clearplay.ui.components.Page {
                AlbumScreen(dec(it.arguments?.getString("id")), p.bottom, p.playingId) { safe.back() }
            }
        }
        composable("artist/{id}", listOf(navArgument("id") { type = NavType.StringType })) {
            com.tonihk00.clearplay.ui.components.Page {
                ArtistScreen(dec(it.arguments?.getString("id")), p.bottom) { safe.back() }
            }
        }
        composable("playlist/{id}", listOf(navArgument("id") { type = NavType.StringType })) {
            com.tonihk00.clearplay.ui.components.Page {
                PlaylistScreen(dec(it.arguments?.getString("id")), p.bottom, p.playingId) { safe.back() }
            }
        }
        composable("decade/{start}", listOf(navArgument("start") { type = NavType.IntType })) {
            com.tonihk00.clearplay.ui.components.Page {
                com.tonihk00.clearplay.ui.library.DecadeScreen(it.arguments?.getInt("start") ?: 2000, p.bottom) { safe.back() }
            }
        }
        composable("genre/{name}", listOf(navArgument("name") { type = NavType.StringType })) {
            com.tonihk00.clearplay.ui.components.Page {
                GenreScreen(dec(it.arguments?.getString("name")), p.bottom, p.playingId) { safe.back() }
            }
        }
    }
    BackDuringTransition(nav, safe)
}

/**
 * Going back while a page is still sliding in is where NavHost goes wrong: its back swipe
 * *seeks* the half-finished transition (the page jumps left, ignores the finger and snaps away
 * on release), and even a plain pop at that moment reverses it badly (the page vanishes and the
 * screen flashes empty). So every "back" from a page waits until the page has settled (a few
 * hundred ms at most) and then pops normally: the page slides off to the right. While a page is
 * settling, the back swipe is taken by [TransitionBackHandler] (overlay priority, so it is asked
 * before NavHost); once settled, NavHost's own finger-following swipe is used.
 */
private class SafeBack(private val nav: NavHostController, private val scope: kotlinx.coroutines.CoroutineScope) {
    private var pending: kotlinx.coroutines.Job? = null

    fun back() {
        if (pending?.isActive == true) return
        val top = nav.currentBackStackEntry ?: return
        if (settled(top)) { nav.popBackStack(); return }
        pending = scope.launch {
            kotlinx.coroutines.withTimeoutOrNull(700) { top.lifecycle.currentStateFlow.first { it.isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED) } }
            // Pop only if that page is still on top (the user may have navigated meanwhile).
            if (nav.currentBackStackEntry == top) nav.popBackStack()
        }
    }

    companion object {
        /** A NavHost entry is RESUMED only once its enter transition has finished. */
        fun settled(e: androidx.navigation.NavBackStackEntry) = e.lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED)
    }
}

@Composable
private fun rememberSafeBack(nav: NavHostController): SafeBack {
    val scope = rememberCoroutineScope()
    return remember(nav) { SafeBack(nav, scope) }
}

@Composable
private fun BackDuringTransition(nav: NavHostController, safe: SafeBack) {
    val stack by nav.currentBackStack.collectAsState()
    val top = stack.lastOrNull()
    val canPop = stack.count { it.destination !is androidx.navigation.NavGraph } > 1
    var settled by remember { mutableStateOf(true) }
    LaunchedEffect(top) {
        if (top == null) { settled = true; return@LaunchedEffect }
        top.lifecycle.currentStateFlow.collect { settled = it.isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED) }
    }
    val handler = remember(safe) { TransitionBackHandler(safe::back) }
    handler.isBackEnabled = canPop && (!settled || handler.swiping)
    val dispatcher = androidx.navigationevent.compose.LocalNavigationEventDispatcherOwner.current?.navigationEventDispatcher
    androidx.compose.runtime.DisposableEffect(dispatcher, handler) {
        dispatcher?.addHandler(handler, androidx.navigationevent.NavigationEventDispatcher.PRIORITY_OVERLAY)
        onDispose { handler.remove() }
    }
}

/** Takes the back swipe while a page is settling; goes back (via [SafeBack]) when it completes. */
private class TransitionBackHandler(private val back: () -> Unit) :
    androidx.navigationevent.NavigationEventHandler<androidx.navigationevent.NavigationEventInfo>(
        androidx.navigationevent.NavigationEventInfo.None, false,
    ) {
    var swiping by mutableStateOf(false)
    override fun onBackStarted(event: androidx.navigationevent.NavigationEvent) { swiping = true }
    override fun onBackCompleted() { swiping = false; back() }
    override fun onBackCancelled() { swiping = false }
}

/** Mini player and tab bar, both frosted glass floating over the page. */
@Composable
private fun Dock(nav: NavHostController, state: PlayerState, controls: PlayerControls, haze: HazeState?, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    // The active tab is the last tab in the history (an album opened from Search belongs to Search).
    val stack by nav.currentBackStack.collectAsState()
    val selected = stack.lastOrNull { e -> Tab.entries.any { it.route == e.destination.route } }
        ?.let { e -> Tab.entries.first { it.route == e.destination.route } }
    DockContent(
        state, controls, haze, onOpen,
        selected = selected,
        onTab = { t ->
            if (t == selected) {
                // Tapping the current tab goes back to its first page.
                nav.popBackStack(t.route, inclusive = false)
            } else {
                nav.navigate(t.route) {
                    popUpTo(Tab.Library.route) { saveState = true }
                    launchSingleTop = true
                    restoreState = true
                }
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
    val online by app.connection.online.collectAsState()
    var latency by remember { mutableStateOf<Map<String, Long?>>(emptyMap()) }
    var scanText by remember { mutableStateOf<String?>(null) }
    var scanning by remember { mutableStateOf(false) }
    fun describe(st: com.tonihk00.clearplay.data.api.ScanStatus) =
        st.lastScan?.let { "Last scan ${it.take(16).replace('T', ' ')} · ${"%,d".format(st.count).replace(',', ' ')} items" }
    LaunchedEffect(client) { scanText = runCatching { client?.scanStatus()?.let(::describe) }.getOrNull() }
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
    LaunchedEffect(Unit) {
        imageBytes = (loader.diskCache?.size ?: 0L) +
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { app.libraryCache.size() }
    }

    val actions = remember(client) {
        object : com.tonihk00.clearplay.ui.settings.SettingsActions {
            override fun switchServer(s: com.tonihk00.clearplay.data.api.ServerConfig) {
                scope.launch {
                    app.player.reset()
                    client?.let { app.libraryCache.clear(it.server) }
                    app.servers.saveAndActivate(s)
                }
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
                app.libraryCache.clearAll()
                imageBytes = 0L
            }
            override fun setSleep(minutes: Int?, endOfSong: Boolean) = app.player.setSleepTimer(minutes, endOfSong)
            override fun scanLibrary() {
                val c = client ?: return
                scope.launch {
                    scanning = true
                    runCatching {
                        var st = c.startScan()
                        while (st.scanning) {
                            scanText = "Scanning… ${"%,d".format(st.count).replace(',', ' ')} items found"
                            kotlinx.coroutines.delay(1000)
                            st = c.scanStatus()
                        }
                        scanText = "Scan finished · ${"%,d".format(st.count).replace(',', ' ')} items"
                    }.onFailure { e ->
                        scanText = if (e is com.tonihk00.clearplay.data.api.SubsonicException && e.code == 50) {
                            "Only an admin account can start a scan"
                        } else {
                            com.tonihk00.clearplay.ui.login.friendlyError(e)
                        }
                    }
                    scanning = false
                }
            }
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
            versionCode = com.tonihk00.clearplay.BuildConfigInfo.versionCode,
            serverVersion = client?.takeIf { online }?.let { com.tonihk00.clearplay.ui.settings.serverLabel(it.serverType, it.serverVersion) },
            licence = remember { com.tonihk00.clearplay.ui.settings.readAppLicence(app) },
            phoneSongs = if (app.phone.hasPermission()) phoneSongs.size else null,
            localMode = client == null,
            scan = scanText,
            scanning = scanning,
        ),
        actions, bottom,
    )
}

private val tabRoutes = setOf("library", "search", "stats", "settings")
private fun isTabSwitch(from: String?, to: String?) = from in tabRoutes && to in tabRoutes
