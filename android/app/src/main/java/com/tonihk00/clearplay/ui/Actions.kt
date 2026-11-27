package com.tonihk00.clearplay.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.data.Backdrop
import com.tonihk00.clearplay.data.DownloadState
import com.tonihk00.clearplay.data.SongEdits
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.Album
import com.tonihk00.clearplay.data.api.MusicLibrary
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.ui.components.CpIcon
import com.tonihk00.clearplay.ui.components.LocalClient
import com.tonihk00.clearplay.ui.theme.Cp

/** Everything a screen can ask the app to do. Screenshot tests pass [NoActions]. */
interface UiActions {
    fun openAlbum(id: String) {}
    fun openArtist(id: String) {}
    fun openPlaylist(id: String) {}
    fun openGenre(name: String) {}
    fun play(songs: List<Song>, index: Int = 0, shuffle: Boolean = false) {}
    /** Pause, or resume what is loaded. */
    fun togglePlay() {}
    fun playNext(songs: List<Song>) {}
    fun addToQueue(songs: List<Song>) {}
    fun shuffleLibrary() {}
    fun songMenu(song: Song) {}
    fun toggleLike(song: Song) {}
    fun rate(song: Song, stars: Int) {}
    fun download(songs: List<Song>) {}
    fun removeDownload(songs: List<Song>) {}
    fun openDownloads() {}
    fun openStats() {}
    /** Albums from a decade, e.g. 1990 for the 1990s. */
    fun openDecade(start: Int) {}
    /** Play, queue or download several albums at once (multi-select). */
    fun albums(albums: List<Album>, action: AlbumBulk) {}
}

enum class AlbumBulk { Play, Shuffle, PlayNext, AddToQueue, Download, RemoveDownload }

/** False while the server can't be reached (the library then shows downloads). */
val LocalOnline = compositionLocalOf { true }

object NoActions : UiActions

val LocalActions = staticCompositionLocalOf<UiActions> { NoActions }
val LocalEdits = staticCompositionLocalOf { SongEdits() }

/** Download state per song id (empty in previews and tests). */
val LocalDownloadStates = compositionLocalOf<Map<String, DownloadState>> { emptyMap() }

/** Completed downloads, newest first. */
val LocalDownloadedSongs = compositionLocalOf<List<Song>> { emptyList() }

/** What is playing, for screens that react to it (the album's Play/Pause pill). */
data class NowPlaying(val albumId: String? = null, val playing: Boolean = false)

val LocalNowPlaying = compositionLocalOf { NowPlaying() }

/** Settings → Player → Playback source (tests: downloads, the behaviour before it existed). */
val LocalPlaybackSource = compositionLocalOf { com.tonihk00.clearplay.data.PlaybackSource.Downloads }

/** Background strength from Settings → Appearance. */
val LocalBackdropMode = compositionLocalOf { Backdrop.Balanced }

/** Applies this session's likes/ratings to a loaded song. */
@Composable
fun Song.edited(): Song {
    val edits = LocalEdits.current
    val map by edits.edits.collectAsState()
    return edits.apply(this, map)
}

sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Done<T>(val value: T) : Load<T>
    /** [retry] loads the page again ([PageError.Server]); null where trying again can't help. */
    data class Failed(val message: String, val kind: PageError = PageError.Server, val retry: (() -> Unit)? = null) : Load<Nothing>
}

/** How a failed page load looks to the user (like the desktop's classifyPageError). */
enum class PageError { NotFound, Server, Auth }

/**
 * "Not found" only for Subsonic error 70; 40 / 41 / 44 mean the login is no longer accepted;
 * everything else (an HTTP error, a timeout, an answer that isn't JSON) is a server error that a
 * Retry may fix.
 */
fun classifyPageError(e: Throwable): PageError = when {
    e is com.tonihk00.clearplay.data.api.SubsonicException && e.code == 70 -> PageError.NotFound
    e is com.tonihk00.clearplay.data.api.SubsonicException && e.code in setOf(40, 41, 44) -> PageError.Auth
    else -> PageError.Server
}

/** Opens the login screen for the current server ("Log in again" on an auth error); null in previews. */
val LocalLogInAgain = staticCompositionLocalOf<(() -> Unit)?> { null }

/** Where screens read music from: the server, or downloads/phone music when offline. */
val LocalLibrary = compositionLocalOf<MusicLibrary?> { null }

/** Called when a request fails, so the app re-checks the server and can switch to offline. */
val LocalConnectionLost = staticCompositionLocalOf<() -> Unit> { {} }

/** Short confirmation pill ("Added to queue"). */
val LocalToast = staticCompositionLocalOf<(String) -> Unit> { {} }

/**
 * Data a screen loaded, kept for as long as the screen is in the back stack (a ViewModel
 * per navigation entry). Going back shows it at once, so lists keep their scroll position.
 */
class ScreenCache : androidx.lifecycle.ViewModel() {
    val map = HashMap<String, Any?>()
}

@Composable
fun screenCache(): ScreenCache = androidx.lifecycle.viewmodel.compose.viewModel()

/** Paged list kept in [ScreenCache]: items plus whether the end was reached. */
class Paged<T> {
    val items = androidx.compose.runtime.mutableStateListOf<T>()
    var end by androidx.compose.runtime.mutableStateOf(false)
    var failed by androidx.compose.runtime.mutableStateOf(false)
    /** The first page on screen came from disk and is being loaded again. */
    var fromDisk by androidx.compose.runtime.mutableStateOf(false)
}

@Composable
fun <T> rememberPaged(name: String): Paged<T> {
    val library = LocalLibrary.current ?: LocalClient.current
    val cache = screenCache()
    @Suppress("UNCHECKED_CAST")
    return remember(library, name) { cache.map.getOrPut("$name@${System.identityHashCode(library)}") { Paged<T>() } as Paged<T> }
}

/** A list kept on disk by [com.tonihk00.clearplay.data.LibraryCache] under [name]. */
class DiskCached<T>(val name: String, val serializer: kotlinx.serialization.KSerializer<T>)

/**
 * Loads once per key (and again when the library switches between online and offline). With
 * [disk], the server's last answer is shown at once from disk (no spinner) while it loads again
 * in the background; the new answer replaces it only if it differs, so lists keep their place.
 */
@Composable
fun <T> rememberLoad(vararg keys: Any?, disk: DiskCached<T>? = null, block: suspend MusicLibrary.() -> T): State<Load<T>> {
    val library = LocalLibrary.current ?: LocalClient.current
    val lost = LocalConnectionLost.current
    val cache = screenCache()
    // Keyed by where in the UI this load sits too: two loads with the same (or no) keys, like
    // the Artists and Genres tabs, must never share an entry.
    val site = androidx.compose.runtime.currentCompositeKeyHash
    val cacheKey = "load@${System.identityHashCode(library)}@$site:${keys.joinToString("|")}"
    @Suppress("UNCHECKED_CAST")
    val cached = cache.map[cacheKey] as Load.Done<T>?
    val server = (library as? SubsonicClient)?.server
    // Retry on a failed page: a new attempt is a new key for produceState.
    var attempt by remember(cacheKey) { androidx.compose.runtime.mutableIntStateOf(0) }
    val fromDisk: T? = remember(cacheKey) {
        if (cached != null || disk == null || server == null) null
        else libraryCache()?.read(server, disk.name, disk.serializer, (library as SubsonicClient).serverVersion)
    }
    return produceState<Load<T>>(cached ?: fromDisk?.let { Load.Done(it) } ?: Load.Loading, library, attempt, *keys) {
        if (cached != null) return@produceState
        if (attempt > 0 && value is Load.Failed) value = Load.Loading
        if (library == null) {
            value = Load.Failed("Not connected", PageError.NotFound)
            return@produceState
        }
        runCatching { library.block() }.fold({ fresh ->
            val done = Load.Done(fresh)
            cache.map[cacheKey] = done
            if (fromDisk == null || fresh != fromDisk) value = done
            if (disk != null && server != null) {
                val version = (library as SubsonicClient).serverVersion
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { libraryCache()?.write(server, disk.name, disk.serializer, fresh, version) }
            }
        }, {
            if (library.isRemote && it !is com.tonihk00.clearplay.data.api.SubsonicException) lost()
            // With the list from disk on screen, keep showing it.
            if (fromDisk == null) {
                value = if (!library.isRemote) {
                    // Offline (downloads and phone music): the page loads again by itself once the
                    // server answers (the library switches), so no Retry.
                    Load.Failed(com.tonihk00.clearplay.ui.login.friendlyError(it), PageError.NotFound)
                } else {
                    when (val kind = classifyPageError(it)) {
                        PageError.NotFound -> Load.Failed(it.message ?: "Not found", kind)
                        PageError.Auth -> Load.Failed("Your username or password is no longer accepted.", kind)
                        PageError.Server -> Load.Failed(
                            "The server didn't answer properly. Check that it's running, then try again.", kind,
                            retry = { attempt++ },
                        )
                    }
                }
            }
        })
    }
}

/** The app's library cache (null in previews where the app isn't running). */
fun libraryCache(): com.tonihk00.clearplay.data.LibraryCache? =
    runCatching { com.tonihk00.clearplay.ClearPlayApp.instance.libraryCache }.getOrNull()

@Composable
fun <T> LoadBox(state: Load<T>, modifier: Modifier = Modifier, content: @Composable (T) -> Unit) {
    when (state) {
        is Load.Done -> content(state.value)
        Load.Loading -> Box(modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(Modifier.size(28.dp), color = Cp.TextSoft, strokeWidth = 2.dp, trackColor = Cp.Muted)
        }
        is Load.Failed -> {
            val logIn = LocalLogInAgain.current
            when (state.kind) {
                PageError.Server -> EmptyState(
                    R.drawable.ic_circle_alert, "Couldn't load this page", state.message, modifier,
                    action = state.retry?.let { "Retry" to it },
                )
                PageError.Auth -> EmptyState(
                    R.drawable.ic_circle_alert, "The server rejected your login", state.message, modifier,
                    action = logIn?.let { "Log in again" to it },
                )
                PageError.NotFound -> EmptyState(R.drawable.ic_circle_alert, "Couldn't load", state.message, modifier)
            }
        }
    }
}

@Composable
fun EmptyState(icon: Int, title: String, subtitle: String? = null, modifier: Modifier = Modifier, action: Pair<String, () -> Unit>? = null) {
    Column(
        modifier.fillMaxSize().padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
    ) {
        CpIcon(icon, size = 32.dp, tint = Cp.TextFaint)
        Text(title, style = MaterialTheme.typography.titleMedium, color = Cp.TextSoft)
        if (subtitle != null) {
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint, textAlign = TextAlign.Center)
        }
        if (action != null) {
            androidx.compose.foundation.layout.Spacer(Modifier.padding(top = 4.dp))
            com.tonihk00.clearplay.ui.components.PrimaryPill(action.first, null, action.second)
        }
    }
}
