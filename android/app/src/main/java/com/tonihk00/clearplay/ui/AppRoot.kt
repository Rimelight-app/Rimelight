package com.tonihk00.clearplay.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
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
import com.tonihk00.clearplay.ClearPlayApp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.Session
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.player.PlayerConnection
import com.tonihk00.clearplay.player.PlayerState
import com.tonihk00.clearplay.ui.components.BackdropLayer
import com.tonihk00.clearplay.ui.components.CoverBackdrop
import com.tonihk00.clearplay.ui.components.CpIcon
import com.tonihk00.clearplay.ui.components.LocalClient
import com.tonihk00.clearplay.ui.library.AlbumScreen
import com.tonihk00.clearplay.ui.library.ArtistScreen
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
import com.tonihk00.clearplay.ui.theme.Cp
import com.tonihk00.clearplay.ui.theme.LocalReduceMotion
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import kotlinx.coroutines.launch
import java.net.URLDecoder
import java.net.URLEncoder

@Composable
fun AppRoot() {
    val app = ClearPlayApp.instance
    val session by app.session.collectAsState()
    val scope = rememberCoroutineScope()
    when (val s = session) {
        Session.Loading -> BackdropLayer(null)
        Session.LoggedOut -> Box(Modifier.fillMaxSize()) {
            BackdropLayer(null)
            LoginScreen(onLoggedIn = { app.servers.saveAndActivate(it) })
        }
        is Session.Active -> CompositionLocalProvider(LocalClient provides s.client, LocalEdits provides app.edits) {
            MainScaffold(app.player, s.client) {
                scope.launch {
                    app.player.reset()
                    app.servers.remove(s.client.server)
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
}

private enum class Tab(val route: String, val label: String, val icon: Int) {
    Library("library", "Library", R.drawable.ic_library),
    Search("search", "Search", R.drawable.ic_search),
    Settings("settings", "Settings", R.drawable.ic_settings),
}

@Composable
private fun MainScaffold(player: PlayerConnection, client: SubsonicClient, onLogout: () -> Unit) {
    val app = ClearPlayApp.instance
    val state by player.state.collectAsState()
    val nav = rememberNavController()
    val scope = rememberCoroutineScope()
    val haze = rememberHazeState()
    val reduce = LocalReduceMotion.current
    val controls = remember(player) { PlayerControlsImpl(player) }
    var fullOpen by remember { mutableStateOf(false) }
    var menuSong by remember { mutableStateOf<Song?>(null) }
    var dockHeight by remember { mutableStateOf(0.dp) }
    val density = LocalDensity.current

    val actions = remember(nav, player, client) {
        object : UiActions {
            override fun openAlbum(id: String) { fullOpen = false; nav.navigate("album/$id") }
            override fun openArtist(id: String) { fullOpen = false; nav.navigate("artist/$id") }
            override fun openPlaylist(id: String) = nav.navigate("playlist/$id")
            override fun openGenre(name: String) = nav.navigate("genre/${URLEncoder.encode(name, "UTF-8")}")
            override fun play(songs: List<Song>, index: Int, shuffle: Boolean) = player.play(songs, index, shuffle)
            override fun playNext(songs: List<Song>) = player.playNext(songs)
            override fun addToQueue(songs: List<Song>) = player.addToQueue(songs)
            override fun shuffleLibrary() = player.shuffleLibrary()
            override fun songMenu(song: Song) { menuSong = song }
            override fun toggleLike(song: Song) { scope.launch { app.edits.toggleStar(client, song) } }
            override fun rate(song: Song, stars: Int) { scope.launch { app.edits.rate(client, song, stars) } }
        }
    }

    // Lyrics for the current song: synced from the server first, then plain/legacy text.
    var lyrics by remember { mutableStateOf<LyricsState>(LyricsState.None) }
    val current = state.current
    LaunchedEffect(current?.id, client) {
        if (current == null) { lyrics = LyricsState.None; return@LaunchedEffect }
        lyrics = LyricsState.Loading
        lyrics = runCatching { client.lyrics(current) }.getOrNull()?.let { LyricsState.Ready(it) } ?: LyricsState.None
    }

    BackHandler(enabled = fullOpen) { fullOpen = false }
    val playingId = current?.id

    CompositionLocalProvider(LocalActions provides actions) {
        Box(Modifier.fillMaxSize()) {
            // Everything under the dock is a Haze source, so the mini player can blur it.
            // While the fullscreen player covers them, the page and dock are hidden from TalkBack.
            val hidden = if (fullOpen) Modifier.clearAndSetSemantics {} else Modifier
            Box(Modifier.fillMaxSize().hazeSource(haze).then(hidden)) {
                CoverBackdrop(current?.coverArt)
                AppNavHost(nav, dockHeight, playingId, client, onLogout)
            }
            Dock(
                nav, state, controls, haze,
                onOpen = { fullOpen = true },
                modifier = Modifier.align(Alignment.BottomCenter).then(hidden).onSizeChanged { dockHeight = with(density) { it.height.toDp() } },
            )
            AnimatedVisibility(
                fullOpen && current != null,
                enter = slideInVertically(tween(if (reduce) 0 else Cp.ScreenMs, easing = Cp.EaseOutSoft)) { it } + fadeIn(tween(if (reduce) 0 else 200)),
                exit = slideOutVertically(tween(if (reduce) 0 else Cp.ScreenMs, easing = Cp.EaseOutSoft)) { it } + fadeOut(tween(if (reduce) 0 else 250)),
            ) {
                FullPlayer(state, controls, lyrics, onClose = { fullOpen = false })
            }
            menuSong?.let { SongMenu(it) { menuSong = null } }
        }
    }
}

@Composable
private fun AppNavHost(nav: NavHostController, bottom: Dp, playingId: String?, client: SubsonicClient, onLogout: () -> Unit) {
    val enter = fadeIn(tween(Cp.ScreenMs, easing = Cp.EaseOutSoft))
    val exit = fadeOut(tween(150))
    NavHost(
        nav, startDestination = Tab.Library.route,
        enterTransition = { enter }, exitTransition = { exit }, popEnterTransition = { enter }, popExitTransition = { exit },
    ) {
        composable(Tab.Library.route) { LibraryScreen(bottom, playingId) }
        composable(Tab.Search.route) { SearchScreen(bottom, playingId) }
        composable(Tab.Settings.route) { SettingsScreen(client.server, bottom, onLogout) }
        composable("album/{id}", listOf(navArgument("id") { type = NavType.StringType })) {
            AlbumScreen(it.arguments?.getString("id").orEmpty(), bottom, playingId) { nav.popBackStack() }
        }
        composable("artist/{id}", listOf(navArgument("id") { type = NavType.StringType })) {
            ArtistScreen(it.arguments?.getString("id").orEmpty(), bottom) { nav.popBackStack() }
        }
        composable("playlist/{id}", listOf(navArgument("id") { type = NavType.StringType })) {
            PlaylistScreen(it.arguments?.getString("id").orEmpty(), bottom, playingId) { nav.popBackStack() }
        }
        composable("genre/{name}", listOf(navArgument("name") { type = NavType.StringType })) {
            GenreScreen(URLDecoder.decode(it.arguments?.getString("name").orEmpty(), "UTF-8"), bottom, playingId) { nav.popBackStack() }
        }
    }
}

/** Mini player (live glass) above the tab bar (solid fade, no blur). */
@Composable
private fun Dock(nav: NavHostController, state: PlayerState, controls: PlayerControls, haze: HazeState, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    DockContent(
        state, controls, haze, onOpen,
        selected = Tab.entries.firstOrNull { it.route == route },
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
    Column(
        modifier.fillMaxWidth().background(
            Brush.verticalGradient(0f to Color.Transparent, 0.3f to Cp.Base.copy(alpha = 0.6f), 0.6f to Cp.Base.copy(alpha = 0.94f), 1f to Cp.Base.copy(alpha = 0.97f)),
        ),
    ) {
        MiniPlayer(state, controls, onOpen, haze, Modifier.padding(horizontal = 10.dp, vertical = 6.dp))
        Row(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 24.dp, vertical = 4.dp),
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
        Modifier.clickable(remember { MutableInteractionSource() }, null, onClick = onClick).padding(horizontal = 18.dp, vertical = 8.dp),
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
