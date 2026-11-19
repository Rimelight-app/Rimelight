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
import com.tonihk00.clearplay.ui.components.glassPanel
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.clickable
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

val LibraryTabs = listOf("Albums", "Artists", "Songs", "Playlists", "Favorites", "Genres", "Downloads")

@Composable
fun LibraryScreen(bottomPadding: Dp, playingId: String?, modifier: Modifier = Modifier, initialTab: Int? = null) {
    var tab by rememberSaveable { mutableStateOf(initialTab ?: 0) }
    // Long-press selection of albums, shared by the album grids.
    val selection = remember { androidx.compose.runtime.mutableStateMapOf<String, Album>() }
    var visible by remember { mutableStateOf<List<Album>>(emptyList()) }
    val sel = remember(selection) { AlbumSelection(selection) { visible = it } }
    androidx.activity.compose.BackHandler(selection.isNotEmpty()) { selection.clear() }
    LaunchedEffect(tab) { selection.clear() }
    Column(modifier.fillMaxSize()) {
        AnimatedContent(
            selection.isNotEmpty(),
            transitionSpec = { fadeIn(tween(Cp.ControlMs)) togetherWith fadeOut(tween(120)) },
            label = "libheader",
        ) { selecting ->
            if (selecting) SelectionBar(selection.values.toList(), { visible.forEach { a -> selection[a.id] = a } }, { selection.clear() })
            else LibraryHeader()
        }
        PillTabs(LibraryTabs, tab, { tab = it }, Modifier.padding(bottom = 8.dp))
        AnimatedContent(
            tab,
            transitionSpec = { fadeIn(tween(Cp.ScreenMs, easing = Cp.EaseOutSoft)) togetherWith fadeOut(tween(120)) },
            label = "libtab",
        ) { t ->
            val pad = PaddingValues(start = 12.dp, end = 12.dp, top = 4.dp, bottom = bottomPadding + 12.dp)
            when (t) {
                0 -> AlbumsTab(pad, sel) { tab = DownloadsTabIndex }
                1 -> ArtistsTab(pad)
                2 -> SongsTab(pad, playingId)
                3 -> PlaylistsTab(pad)
                4 -> FavoritesTab(pad, playingId)
                5 -> GenresTab(pad)
                else -> DownloadsTab(pad, sel)
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
        Text("Library", style = MaterialTheme.typography.headlineMedium)
        // Offline: the same library, built from downloads (and phone music).
        if (!com.tonihk00.clearplay.ui.LocalOnline.current) {
            Spacer(Modifier.size(10.dp))
            com.tonihk00.clearplay.ui.components.MetaChip("Offline")
        }
        Spacer(Modifier.weight(1f))
        IconButtonCp(R.drawable.ic_shuffle, "Shuffle library", { actions.shuffleLibrary() }, outlined = true)
    }
}

const val DownloadsTabIndex = 6

fun isOnline(context: android.content.Context): Boolean {
    val cm = context.getSystemService(android.net.ConnectivityManager::class.java) ?: return true
    val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
    return caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
}

/** Shown when the server can't be reached: points to the downloads. */
@Composable
fun OfflineState(onDownloads: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
    ) {
        com.tonihk00.clearplay.ui.components.CpIcon(R.drawable.ic_cloud_download, size = 32.dp, tint = Cp.TextFaint)
        Text("Can't reach your server", style = MaterialTheme.typography.titleMedium, color = Cp.TextSoft)
        Text("Your downloads still play.", style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint)
        Spacer(Modifier.height(8.dp))
        com.tonihk00.clearplay.ui.components.PrimaryPill("Downloads", R.drawable.ic_download, onDownloads)
    }
}

/** Selection state handed to album grids. */
class AlbumSelection(val map: MutableMap<String, Album>, val setVisible: (List<Album>) -> Unit) {
    val active get() = map.isNotEmpty()
    fun toggle(a: Album) { if (map.containsKey(a.id)) map.remove(a.id) else map[a.id] = a }
    fun isSelected(a: Album) = map.containsKey(a.id)
}

/** Album grid item honouring selection: tap opens (or toggles while selecting), long-press selects. */
@Composable
fun SelectableAlbum(album: Album, sel: AlbumSelection?, modifier: Modifier = Modifier) {
    val actions = LocalActions.current
    AlbumCard(
        album,
        onClick = { if (sel?.active == true) sel.toggle(album) else actions.openAlbum(album.id) },
        modifier = modifier,
        selected = if (sel?.active == true) sel.isSelected(album) else null,
        onLongClick = sel?.let { { it.toggle(album) } },
    )
}

@Composable
private fun SelectionBar(albums: List<Album>, onSelectAll: () -> Unit, onClose: () -> Unit) {
    val actions = LocalActions.current
    val states = com.tonihk00.clearplay.ui.LocalDownloadStates.current
    val remote = com.tonihk00.clearplay.ui.LocalLibrary.current?.isRemote != false
    fun run(a: com.tonihk00.clearplay.ui.AlbumBulk) { actions.albums(albums, a); onClose() }
    Column(Modifier.fillMaxWidth().statusBarsPadding().padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButtonCp(R.drawable.ic_x, "Cancel", onClose, size = 42.dp)
            Text(
                "${albums.size} selected",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.weight(1f).padding(start = 6.dp),
            )
            Text(
                "Select all",
                Modifier.clip(androidx.compose.foundation.shape.CircleShape).clickable(onClick = onSelectAll).padding(horizontal = 12.dp, vertical = 8.dp),
                style = MaterialTheme.typography.labelLarge,
                color = Cp.TextSoft,
            )
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 6.dp).glassPanel(androidx.compose.foundation.shape.CircleShape).padding(4.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            IconButtonCp(R.drawable.ic_play_filled, "Play", { run(com.tonihk00.clearplay.ui.AlbumBulk.Play) }, size = 42.dp, iconSize = 20.dp, tint = Cp.TextStrong)
            IconButtonCp(R.drawable.ic_shuffle, "Shuffle", { run(com.tonihk00.clearplay.ui.AlbumBulk.Shuffle) }, size = 42.dp, iconSize = 20.dp, tint = Cp.TextStrong)
            IconButtonCp(R.drawable.ic_list_start, "Play next", { run(com.tonihk00.clearplay.ui.AlbumBulk.PlayNext) }, size = 42.dp, iconSize = 20.dp, tint = Cp.TextStrong)
            IconButtonCp(R.drawable.ic_list_plus, "Add to queue", { run(com.tonihk00.clearplay.ui.AlbumBulk.AddToQueue) }, size = 42.dp, iconSize = 20.dp, tint = Cp.TextStrong)
            if (remote) IconButtonCp(R.drawable.ic_download, "Download", { run(com.tonihk00.clearplay.ui.AlbumBulk.Download) }, size = 42.dp, iconSize = 20.dp, tint = Cp.TextStrong)
            if (states.isNotEmpty()) IconButtonCp(R.drawable.ic_trash_2, "Remove download", { run(com.tonihk00.clearplay.ui.AlbumBulk.RemoveDownload) }, size = 42.dp, iconSize = 20.dp, tint = Cp.TextStrong)
        }
    }
}

@Composable
fun AlbumsTab(pad: PaddingValues, sel: AlbumSelection? = null, onDownloads: () -> Unit = {}) {
    val lost = com.tonihk00.clearplay.ui.LocalConnectionLost.current
    val client = com.tonihk00.clearplay.ui.LocalLibrary.current ?: LocalClient.current
    val actions = LocalActions.current
    val albums = remember(client) { mutableStateListOf<Album>() }
    var end by remember(client) { mutableStateOf(false) }
    var loading by remember(client) { mutableStateOf(false) }
    var failed by remember(client) { mutableStateOf(false) }
    val grid = rememberLazyGridState()
    val nearEnd by remember { derivedStateOf { (grid.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) >= albums.size - 8 } }
    LaunchedEffect(client, nearEnd, albums.size) {
        if (client == null || end || loading || (!nearEnd && albums.isNotEmpty())) return@LaunchedEffect
        loading = true
        val result = runCatching { client.albumList(size = 60, offset = albums.size) }
        failed = result.isFailure && albums.isEmpty()
        if (result.isFailure && client.isRemote) lost()
        val page = result.getOrNull().orEmpty()
        if (page.size < 60) end = true
        albums += page
        loading = false
    }
    LaunchedEffect(albums.size) { sel?.setVisible?.invoke(albums.toList()) }
    if (failed) return OfflineState(onDownloads)
    if (albums.isEmpty() && end) return EmptyState(R.drawable.ic_disc_3, "No albums yet")
    LazyVerticalGrid(
        GridCells.Adaptive(150.dp),
        state = grid,
        contentPadding = pad,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(albums, key = { it.id }) { SelectableAlbum(it, sel) }
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
    val client = com.tonihk00.clearplay.ui.LocalLibrary.current ?: LocalClient.current
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

/** Downloaded albums (tap to open, long-press to select); everything here plays offline. */
@Composable
fun DownloadsTab(pad: PaddingValues, sel: AlbumSelection? = null) {
    val actions = LocalActions.current
    val songs = com.tonihk00.clearplay.ui.LocalDownloadedSongs.current
    if (songs.isEmpty()) {
        return EmptyState(
            R.drawable.ic_download, "No downloads yet",
            "Tap the download button on an album or playlist, or long-press albums to download several at once.",
        )
    }
    val albums = remember(songs) {
        songs.groupBy { it.albumId ?: it.id }.map { (id, s) ->
            val f = s.first()
            Album(
                id = id, name = f.album ?: f.title, artist = f.artist, artistId = f.artistId,
                coverArt = s.firstNotNullOfOrNull { it.coverArt }, songCount = s.size,
                duration = s.sumOf { it.duration }, year = f.year, genre = f.genre, song = s,
            )
        }
    }
    LaunchedEffect(albums) { sel?.setVisible?.invoke(albums) }
    LazyVerticalGrid(
        GridCells.Adaptive(150.dp),
        contentPadding = pad,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${albums.size} album${if (albums.size == 1) "" else "s"} · ${songs.size} song${if (songs.size == 1) "" else "s"}",
                    style = MaterialTheme.typography.titleSmall, color = Cp.TextSoft, modifier = Modifier.weight(1f),
                )
                IconButtonCp(R.drawable.ic_shuffle, "Shuffle downloads", { actions.play(songs, shuffle = true) }, outlined = true)
                Spacer(Modifier.size(8.dp))
                com.tonihk00.clearplay.ui.components.PrimaryPill("Play", R.drawable.ic_play_filled, { actions.play(songs) })
            }
        }
        items(albums, key = { "dl" + it.id }) { SelectableAlbum(it, sel) }
    }
}
