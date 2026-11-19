package com.tonihk00.clearplay.ui.library

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.data.api.Album
import com.tonihk00.clearplay.data.api.Artist
import com.tonihk00.clearplay.data.api.Playlist
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.ui.LoadBox
import com.tonihk00.clearplay.ui.LocalActions
import com.tonihk00.clearplay.ui.UiActions
import com.tonihk00.clearplay.ui.edited
import com.tonihk00.clearplay.ui.rememberLoad
import com.tonihk00.clearplay.ui.components.AlbumCard
import com.tonihk00.clearplay.ui.components.Cover
import com.tonihk00.clearplay.ui.components.IconButtonCp
import com.tonihk00.clearplay.ui.components.MetaChip
import com.tonihk00.clearplay.ui.components.PrimaryPill
import com.tonihk00.clearplay.ui.components.SectionLabel
import com.tonihk00.clearplay.ui.components.SongRow
import com.tonihk00.clearplay.ui.components.formatLongDuration
import com.tonihk00.clearplay.ui.components.glassPanel
import com.tonihk00.clearplay.ui.theme.Cp
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

@Composable
fun BackButton(onBack: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier.statusBarsPadding().padding(12.dp)) {
        Box(Modifier.glassPanel(CircleShape, strong = true)) {
            IconButtonCp(R.drawable.ic_arrow_left, "Back", onBack, size = 40.dp, iconSize = 20.dp, tint = Cp.TextStrong)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DetailHeader(
    label: String,
    title: String,
    coverArt: String?,
    chips: List<String>,
    songs: List<Song>,
    subtitle: String? = null,
    onSubtitle: (() -> Unit)? = null,
    roundCover: Boolean = false,
) {
    val actions = LocalActions.current
    Column(
        Modifier.fillMaxWidth().statusBarsPadding().padding(start = 20.dp, end = 20.dp, top = 56.dp, bottom = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Cover(
            coverArt,
            Modifier.size(232.dp),
            if (roundCover) CircleShape else Cp.BigCoverShape,
            sizePx = 600,
        )
        Spacer(Modifier.height(22.dp))
        SectionLabel(label)
        Spacer(Modifier.height(6.dp))
        Text(
            title,
            style = MaterialTheme.typography.displaySmall,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (subtitle != null) {
            Spacer(Modifier.height(6.dp))
            Text(
                subtitle,
                style = MaterialTheme.typography.titleMedium,
                color = Cp.TextSoft,
                modifier = if (onSubtitle != null) Modifier.clickable(onClick = onSubtitle) else Modifier,
            )
        }
        if (chips.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                chips.forEach { MetaChip(it) }
            }
        }
        if (songs.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                PrimaryPill("Play", R.drawable.ic_play_filled, { actions.play(songs) })
                IconButtonCp(R.drawable.ic_shuffle, "Shuffle", { actions.play(songs, shuffle = true) }, size = 46.dp, outlined = true)
                IconButtonCp(R.drawable.ic_list_start, "Play next", { actions.playNext(songs) }, size = 46.dp, outlined = true)
                IconButtonCp(R.drawable.ic_list_plus, "Add to queue", { actions.addToQueue(songs) }, size = 46.dp, outlined = true)
                DownloadButton(songs)
            }
        }
    }
}

/** Songs in a quiet glass card, like the desktop track table. */
private fun LazyListScope.songCard(songs: List<Song>, playingId: String?, actions: UiActions, numbered: Boolean) {
    itemsIndexed(songs, key = { i, s -> "${s.id}-$i" }) { i, raw ->
        val first = i == 0
        val last = i == songs.lastIndex
        val shape = androidx.compose.foundation.shape.RoundedCornerShape(
            topStart = if (first) Cp.Radius else 0.dp, topEnd = if (first) Cp.Radius else 0.dp,
            bottomStart = if (last) Cp.Radius else 0.dp, bottomEnd = if (last) Cp.Radius else 0.dp,
        )
        Box(Modifier.padding(horizontal = 12.dp).background(Cp.GlassFill, shape).padding(horizontal = 6.dp).padding(top = if (first) 6.dp else 0.dp, bottom = if (last) 6.dp else 0.dp)) {
            val song = raw.edited()
            SongRow(
                song,
                { actions.play(songs, i) },
                { actions.songMenu(song) },
                playing = raw.id == playingId,
                showCover = !numbered,
                trackNumber = if (numbered) song.track ?: (i + 1) else null,
            )
        }
    }
}

@Composable
fun AlbumScreen(id: String, bottomPadding: Dp, playingId: String?, onBack: () -> Unit) {
    val state by rememberLoad(id) { album(id) }
    PullDownToGoBack(onBack) {
        LoadBox(state, Modifier.statusBarsPadding().padding(top = 80.dp)) { a -> AlbumContent(a, bottomPadding, playingId) }
        BackButton(onBack)
    }
}

@Composable
fun AlbumContent(a: Album, bottomPadding: Dp, playingId: String?) {
    val actions = LocalActions.current
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = bottomPadding + 16.dp)) {
        item {
            DetailHeader(
                "Album", a.name, a.coverArt,
                listOfNotNull(a.year?.toString(), a.genre, "${a.songCount} songs", formatLongDuration(a.duration)),
                a.song, a.artist, a.artistId?.let { { actions.openArtist(it) } },
            )
        }
        songCard(a.song, playingId, actions, numbered = true)
    }
}

@Composable
fun PlaylistScreen(id: String, bottomPadding: Dp, playingId: String?, onBack: () -> Unit) {
    val actions = LocalActions.current
    val state by rememberLoad(id) { playlist(id) }
    PullDownToGoBack(onBack) {
        LoadBox(state, Modifier.statusBarsPadding().padding(top = 80.dp)) { p: Playlist ->
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = bottomPadding + 16.dp)) {
                item {
                    DetailHeader("Playlist", p.name, p.coverArt, listOf("${p.songCount} songs", formatLongDuration(p.duration)), p.entry, p.owner)
                }
                songCard(p.entry, playingId, actions, numbered = false)
            }
        }
        BackButton(onBack)
    }
}

@Composable
fun GenreScreen(name: String, bottomPadding: Dp, playingId: String?, onBack: () -> Unit) {
    val actions = LocalActions.current
    val state by rememberLoad(name) { songsByGenre(name, 300) }
    PullDownToGoBack(onBack) {
        LoadBox(state, Modifier.statusBarsPadding().padding(top = 80.dp)) { songs: List<Song> ->
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = bottomPadding + 16.dp)) {
                item { DetailHeader("Genre", name, songs.firstOrNull()?.coverArt, listOf("${songs.size} songs"), songs) }
                songCard(songs, playingId, actions, numbered = false)
            }
        }
        BackButton(onBack)
    }
}

@Composable
fun ArtistScreen(id: String, bottomPadding: Dp, onBack: () -> Unit) {
    val actions = LocalActions.current
    val state by rememberLoad(id) {
        val artist = artist(id)
        // Songs of every album, for Play / Shuffle; albums load in parallel.
        val songs = coroutineScope {
            artist.album.map { al -> async { runCatching { album(al.id).song }.getOrDefault(emptyList()) } }.awaitAll()
        }.flatten()
        artist to songs
    }
    PullDownToGoBack(onBack) {
        LoadBox(state, Modifier.statusBarsPadding().padding(top = 80.dp)) { (a: Artist, songs: List<Song>) ->
            LazyVerticalGrid(
                GridCells.Adaptive(150.dp),
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = bottomPadding + 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    DetailHeader(
                        "Artist", a.name, a.coverArt,
                        listOf("${a.albumCount} albums", "${songs.size} songs"),
                        songs, roundCover = true,
                    )
                }
                item(span = { GridItemSpan(maxLineSpan) }) { SectionLabel("Albums", Modifier.padding(start = 8.dp, top = 8.dp)) }
                items(a.album.sortedByDescending { it.year ?: 0 }, key = { it.id }) { AlbumCard(it, { actions.openAlbum(it.id) }) }
            }
        }
        BackButton(onBack)
    }
}

/** Download all / progress / downloaded (tap to remove) for a list of songs. */
@Composable
fun DownloadButton(songs: List<Song>) {
    val actions = LocalActions.current
    val states = com.tonihk00.clearplay.ui.LocalDownloadStates.current
    val mine = songs.mapNotNull { states[it.id] }
    val allDone = songs.isNotEmpty() && mine.size == songs.size && mine.all { it.done }
    val active = mine.any { it.active }
    // Offline or phone music: nothing to download (still show the check if it's all here).
    val canDownload = com.tonihk00.clearplay.ui.LocalLibrary.current?.isRemote != false && songs.any { !it.isLocal }
    if (!canDownload && !allDone) return
    when {
        active -> Box(Modifier.size(46.dp).glassPanel(CircleShape), contentAlignment = Alignment.Center) {
            val pct = songs.sumOf { (states[it.id]?.let { s -> if (s.done) 100f else s.percent } ?: 0f).toDouble() } / songs.size
            androidx.compose.material3.CircularProgressIndicator(
                progress = { (pct / 100).toFloat() },
                modifier = Modifier.size(22.dp),
                color = Cp.TextStrong,
                trackColor = Cp.Muted,
                strokeWidth = 2.dp,
            )
        }
        allDone -> IconButtonCp(R.drawable.ic_circle_check, "Remove download", { actions.removeDownload(songs) }, size = 46.dp, outlined = true, tint = Cp.TextStrong)
        else -> IconButtonCp(R.drawable.ic_download, "Download", { actions.download(songs) }, size = 46.dp, outlined = true)
    }
}

/**
 * Pull the page down from its top to go back, like the full player: the page follows the
 * finger, shrinks a little and pops when let go far enough.
 */
@Composable
fun PullDownToGoBack(onBack: () -> Unit, content: @Composable androidx.compose.foundation.layout.BoxScope.() -> Unit) {
    val pull = com.tonihk00.clearplay.ui.player.rememberPullToDismiss(onBack)
    Box(
        Modifier.fillMaxSize()
            .graphicsLayer {
                translationY = pull.offset
                val f = (pull.offset / size.height).coerceIn(0f, 1f)
                scaleX = 1f - f * 0.1f
                scaleY = 1f - f * 0.1f
                alpha = 1f - f * 0.6f
                shape = androidx.compose.foundation.shape.RoundedCornerShape((f * 160).coerceAtMost(28f).dp)
                clip = pull.offset > 0f
            }
            .nestedScroll(pull.connection),
        content = content,
    )
}
