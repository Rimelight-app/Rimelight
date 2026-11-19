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
    fun playNext(songs: List<Song>) {}
    fun addToQueue(songs: List<Song>) {}
    fun shuffleLibrary() {}
    fun songMenu(song: Song) {}
    fun toggleLike(song: Song) {}
    fun rate(song: Song, stars: Int) {}
    fun download(songs: List<Song>) {}
    fun removeDownload(songs: List<Song>) {}
    fun openDownloads() {}
}

object NoActions : UiActions

val LocalActions = staticCompositionLocalOf<UiActions> { NoActions }
val LocalEdits = staticCompositionLocalOf { SongEdits() }

/** Download state per song id (empty in previews and tests). */
val LocalDownloadStates = compositionLocalOf<Map<String, DownloadState>> { emptyMap() }

/** Completed downloads, newest first. */
val LocalDownloadedSongs = compositionLocalOf<List<Song>> { emptyList() }

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

/** Loads once per key with the active client. */
@Composable
fun <T> rememberLoad(vararg keys: Any?, block: suspend SubsonicClient.() -> T): State<Load<T>> {
    val client = LocalClient.current
    return produceState<Load<T>>(Load.Loading, client, *keys) {
        value = if (client == null) {
            Load.Failed("Not connected")
        } else {
            runCatching { client.block() }.fold({ Load.Done(it) }, { Load.Failed(com.tonihk00.clearplay.ui.login.friendlyError(it)) })
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
