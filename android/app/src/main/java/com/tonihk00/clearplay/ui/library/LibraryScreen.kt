package com.tonihk00.clearplay.ui.library

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.data.api.Album
import com.tonihk00.clearplay.data.api.Artist
import com.tonihk00.clearplay.data.api.Genre
import com.tonihk00.clearplay.data.api.Playlist
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.Starred
import com.tonihk00.clearplay.ui.EmptyState
import com.tonihk00.clearplay.ui.LoadBox
import com.tonihk00.clearplay.ui.LocalActions
import com.tonihk00.clearplay.ui.edited
import com.tonihk00.clearplay.ui.rememberLoad
import com.tonihk00.clearplay.ui.components.AlbumCard
import com.tonihk00.clearplay.ui.components.ArtistRow
import com.tonihk00.clearplay.ui.components.IconButtonCp
import com.tonihk00.clearplay.ui.components.LocalClient
import com.tonihk00.clearplay.ui.components.Logo
import com.tonihk00.clearplay.ui.components.PillTabs
import com.tonihk00.clearplay.ui.components.SectionLabel
import com.tonihk00.clearplay.ui.components.SimpleRow
import com.tonihk00.clearplay.ui.components.SongRow
import com.tonihk00.clearplay.ui.components.formatLongDuration
import com.tonihk00.clearplay.ui.theme.Cp

val LibraryTabs = listOf("Albums", "Artists", "Songs", "Playlists", "Favorites", "Genres")

@Composable
fun LibraryScreen(bottomPadding: Dp, playingId: String?, modifier: Modifier = Modifier, initialTab: Int = 0) {
    var tab by rememberSaveable { mutableStateOf(initialTab) }
    Column(modifier.fillMaxSize()) {
        LibraryHeader()
        PillTabs(LibraryTabs, tab, { tab = it }, Modifier.padding(bottom = 8.dp))
        AnimatedContent(
            tab,
            transitionSpec = { fadeIn(tween(Cp.ScreenMs, easing = Cp.EaseOutSoft)) togetherWith fadeOut(tween(120)) },
            label = "libtab",
        ) { t ->
            val pad = PaddingValues(start = 12.dp, end = 12.dp, top = 4.dp, bottom = bottomPadding + 12.dp)
            when (t) {
                0 -> AlbumsTab(pad)
                1 -> ArtistsTab(pad)
                2 -> SongsTab(pad, playingId)
                3 -> PlaylistsTab(pad)
                4 -> FavoritesTab(pad, playingId)
                else -> GenresTab(pad)
            }
        }
    }
}

@Composable
private fun LibraryHeader() {
    val actions = LocalActions.current
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().padding(start = 20.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Logo(Modifier.size(30.dp))
        Spacer(Modifier.size(12.dp))
        Text("Library", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
        IconButtonCp(R.drawable.ic_shuffle, "Shuffle library", { actions.shuffleLibrary() }, outlined = true)
    }
}

@Composable
fun AlbumsTab(pad: PaddingValues) {
    val client = LocalClient.current
    val actions = LocalActions.current
    val albums = remember(client) { mutableStateListOf<Album>() }
    var end by remember(client) { mutableStateOf(false) }
    var loading by remember(client) { mutableStateOf(false) }
    val grid = rememberLazyGridState()
    val nearEnd by remember { derivedStateOf { (grid.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) >= albums.size - 8 } }
    LaunchedEffect(client, nearEnd, albums.size) {
        if (client == null || end || loading || (!nearEnd && albums.isNotEmpty())) return@LaunchedEffect
        loading = true
        val page = runCatching { client.albumList(size = 60, offset = albums.size) }.getOrNull().orEmpty()
        if (page.size < 60) end = true
        albums += page
        loading = false
    }
    if (albums.isEmpty() && end) return EmptyState(R.drawable.ic_disc_3, "No albums yet")
    LazyVerticalGrid(
        GridCells.Adaptive(150.dp),
        state = grid,
        contentPadding = pad,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(albums, key = { it.id }) { AlbumCard(it, { actions.openAlbum(it.id) }) }
        if (loading) item(span = { GridItemSpan(maxLineSpan) }) { LoadBox<Unit>(com.tonihk00.clearplay.ui.Load.Loading) {} }
    }
}

@Composable
fun ArtistsTab(pad: PaddingValues) {
    val actions = LocalActions.current
    val state by rememberLoad { artists() }
    LoadBox(state) { list: List<Artist> ->
        if (list.isEmpty()) return@LoadBox EmptyState(R.drawable.ic_user, "No artists yet")
        LazyColumn(Modifier.fillMaxSize(), contentPadding = pad) {
            items(list, key = { it.id }) { ArtistRow(it, { actions.openArtist(it.id) }) }
        }
    }
}

@Composable
fun SongsTab(pad: PaddingValues, playingId: String?) {
    val client = LocalClient.current
    val actions = LocalActions.current
    val songs = remember(client) { mutableStateListOf<Song>() }
    var end by remember(client) { mutableStateOf(false) }
    var loading by remember(client) { mutableStateOf(false) }
    val list = rememberLazyListState()
    val nearEnd by remember { derivedStateOf { (list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) >= songs.size - 15 } }
    LaunchedEffect(client, nearEnd, songs.size) {
        if (client == null || end || loading || (!nearEnd && songs.isNotEmpty())) return@LaunchedEffect
        loading = true
        val page = runCatching { client.songs(200, songs.size) }.getOrNull().orEmpty()
        if (page.size < 200) end = true
        songs += page
        loading = false
    }
    LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = pad) {
        item {
            SimpleRow("Shuffle library", "Plays everything in random order, then keeps going", { actions.shuffleLibrary() }, icon = R.drawable.ic_shuffle)
            Spacer(Modifier.height(8.dp))
        }
        itemsIndexed(songs, key = { i, s -> "${s.id}-$i" }) { i, s ->
            val song = s.edited()
            SongRow(song, { actions.play(songs, i) }, { actions.songMenu(song) }, playing = s.id == playingId)
        }
    }
}

@Composable
fun PlaylistsTab(pad: PaddingValues) {
    val actions = LocalActions.current
    val state by rememberLoad { playlists() }
    LoadBox(state) { list: List<Playlist> ->
        if (list.isEmpty()) return@LoadBox EmptyState(R.drawable.ic_list_music, "No playlists yet")
        LazyColumn(Modifier.fillMaxSize(), contentPadding = pad) {
            items(list, key = { it.id }) {
                SimpleRow(it.name, "${it.songCount} songs · ${formatLongDuration(it.duration)}", { actions.openPlaylist(it.id) }, coverArt = it.coverArt)
            }
        }
    }
}

@Composable
fun FavoritesTab(pad: PaddingValues, playingId: String?) {
    val actions = LocalActions.current
    val state by rememberLoad { starred() }
    LoadBox(state) { s: Starred -> FavoritesContent(s, pad, playingId, actions) }
}

@Composable
fun FavoritesContent(s: Starred, pad: PaddingValues, playingId: String?, actions: com.tonihk00.clearplay.ui.UiActions) {
    if (s.songs.isEmpty() && s.albums.isEmpty() && s.artists.isEmpty()) {
        return EmptyState(R.drawable.ic_heart, "No favourites yet", "Tap the heart on a song to keep it here.")
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = pad) {
        if (s.albums.isNotEmpty()) {
            item { SectionLabel("Albums", Modifier.padding(start = 8.dp, top = 4.dp, bottom = 8.dp)) }
            item {
                androidx.compose.foundation.lazy.LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(s.albums, key = { it.id }) { AlbumCard(it, { actions.openAlbum(it.id) }, Modifier.size(width = 140.dp, height = 190.dp)) }
                }
            }
        }
        if (s.songs.isNotEmpty()) {
            item { SectionLabel("Songs", Modifier.padding(start = 8.dp, top = 16.dp, bottom = 8.dp)) }
            itemsIndexed(s.songs, key = { _, it -> it.id }) { i, raw ->
                val song = raw.edited()
                SongRow(song, { actions.play(s.songs, i) }, { actions.songMenu(song) }, playing = raw.id == playingId)
            }
        }
        if (s.artists.isNotEmpty()) {
            item { SectionLabel("Artists", Modifier.padding(start = 8.dp, top = 16.dp, bottom = 8.dp)) }
            items(s.artists, key = { it.id }) { ArtistRow(it, { actions.openArtist(it.id) }) }
        }
    }
}

@Composable
fun GenresTab(pad: PaddingValues) {
    val actions = LocalActions.current
    val state by rememberLoad { genres() }
    LoadBox(state) { list: List<Genre> ->
        if (list.isEmpty()) return@LoadBox EmptyState(R.drawable.ic_tag, "No genres yet")
        LazyColumn(Modifier.fillMaxSize(), contentPadding = pad) {
            items(list, key = { it.value }) {
                SimpleRow(it.value, "${it.songCount} songs · ${it.albumCount} albums", { actions.openGenre(it.value) }, icon = R.drawable.ic_tag)
            }
        }
    }
}
