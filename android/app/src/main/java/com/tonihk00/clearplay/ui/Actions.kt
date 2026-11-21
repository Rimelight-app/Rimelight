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
    data class Failed(val message: String) : Load<Nothing>
}

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
}

@Composable
fun <T> rememberPaged(name: String): Paged<T> {
    val library = LocalLibrary.current ?: LocalClient.current
    val cache = screenCache()
    @Suppress("UNCHECKED_CAST")
    return remember(library, name) { cache.map.getOrPut("$name@${System.identityHashCode(library)}") { Paged<T>() } as Paged<T> }
}

/** Loads once per key (and again when the library switches between online and offline). */
@Composable
fun <T> rememberLoad(vararg keys: Any?, block: suspend MusicLibrary.() -> T): State<Load<T>> {
    val library = LocalLibrary.current ?: LocalClient.current
    val lost = LocalConnectionLost.current
    val cache = screenCache()
    // Keyed by where in the UI this load sits too: two loads with the same (or no) keys, like
    // the Artists and Genres tabs, must never share an entry.
    val site = androidx.compose.runtime.currentCompositeKeyHash
    val cacheKey = "load@${System.identityHashCode(library)}@$site:${keys.joinToString("|")}"
    @Suppress("UNCHECKED_CAST")
    val cached = cache.map[cacheKey] as Load.Done<T>?
    return produceState<Load<T>>(cached ?: Load.Loading, library, *keys) {
        if (cached != null) return@produceState
        value = if (library == null) {
            Load.Failed("Not connected")
        } else {
            runCatching { library.block() }.fold({ Load.Done(it).also { d -> cache.map[cacheKey] = d } }, {
                if (library.isRemote && it !is com.tonihk00.clearplay.data.api.SubsonicException) lost()
                Load.Failed(com.tonihk00.clearplay.ui.login.friendlyError(it))
            })
        }
    }
}

@Composable
fun <T> LoadBox(state: Load<T>, modifier: Modifier = Modifier, content: @Composable (T) -> Unit) {
    when (state) {
        is Load.Done -> content(state.value)
        Load.Loading -> Box(modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(Modifier.size(28.dp), color = Cp.TextSoft, strokeWidth = 2.dp, trackColor = Cp.Muted)
        }
        is Load.Failed -> EmptyState(R.drawable.ic_circle_alert, "Couldn't load", state.message, modifier)
    }
}

@Composable
fun EmptyState(icon: Int, title: String, subtitle: String? = null, modifier: Modifier = Modifier) {
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
    }
}
