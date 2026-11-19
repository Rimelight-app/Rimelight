package com.tonihk00.clearplay.ui.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.data.api.SearchResult
import com.tonihk00.clearplay.ui.EmptyState
import com.tonihk00.clearplay.ui.LocalActions
import com.tonihk00.clearplay.ui.edited
import com.tonihk00.clearplay.ui.components.AlbumCard
import com.tonihk00.clearplay.ui.components.ArtistRow
import com.tonihk00.clearplay.ui.components.GlassField
import com.tonihk00.clearplay.ui.components.LocalClient
import com.tonihk00.clearplay.ui.components.SectionLabel
import com.tonihk00.clearplay.ui.components.SongRow
import kotlinx.coroutines.delay

/** Searches as you type (60 songs, 18 albums, 12 artists), like the desktop search page. */
@Composable
fun SearchScreen(bottomPadding: Dp, playingId: String?, autoFocus: Boolean = true, initialQuery: String = "") {
    val client = com.tonihk00.clearplay.ui.LocalLibrary.current ?: LocalClient.current
    var query by rememberSaveable { mutableStateOf(initialQuery) }
    var result by remember { mutableStateOf<SearchResult?>(null) }
    var failed by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }

    LaunchedEffect(query, client) {
        val q = query.trim()
        if (q.isEmpty() || client == null) { result = null; return@LaunchedEffect }
        delay(220)
        runCatching { client.search(q) }
            .onSuccess { result = it; failed = false }
            .onFailure { failed = true }
    }
    LaunchedEffect(Unit) { if (autoFocus && query.isEmpty()) runCatching { focus.requestFocus() } }

    Column(Modifier.fillMaxSize()) {
        Text("Search", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.statusBarsPadding().padding(start = 20.dp, top = 12.dp, bottom = 12.dp))
        GlassField(
            query, { query = it }, "Songs, albums, artists",
            Modifier.fillMaxWidth().padding(horizontal = 16.dp).focusRequester(focus),
            leadingIcon = R.drawable.ic_search,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        )
        SearchResults(result, query, failed, bottomPadding, playingId)
    }
}

@Composable
fun SearchResults(result: SearchResult?, query: String, failed: Boolean, bottomPadding: Dp, playingId: String?) {
    val actions = LocalActions.current
    when {
        query.isBlank() -> return EmptyState(R.drawable.ic_search, "Find something to play", "Search your whole library as you type.")
        failed -> return EmptyState(R.drawable.ic_circle_alert, "Search failed", "Check the connection to your server.")
        result == null -> return
        result.songs.isEmpty() && result.albums.isEmpty() && result.artists.isEmpty() ->
            return EmptyState(R.drawable.ic_search, "Nothing found", "No songs, albums or artists match “${query.trim()}”.")
    }
    val r = result!!
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 12.dp, bottom = bottomPadding + 16.dp)) {
        if (r.artists.isNotEmpty()) {
            item { SectionLabel("Artists", Modifier.padding(start = 8.dp, bottom = 6.dp)) }
            items(r.artists.take(4), key = { "ar" + it.id }) { ArtistRow(it, { actions.openArtist(it.id) }) }
        }
        if (r.albums.isNotEmpty()) {
            item { SectionLabel("Albums", Modifier.padding(start = 8.dp, top = 16.dp, bottom = 8.dp)) }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(r.albums, key = { "al" + it.id }) { AlbumCard(it, { actions.openAlbum(it.id) }, Modifier.size(width = 140.dp, height = 190.dp)) }
                }
            }
        }
        if (r.songs.isNotEmpty()) {
            item { SectionLabel("Songs", Modifier.padding(start = 8.dp, top = 16.dp, bottom = 6.dp)) }
            itemsIndexed(r.songs, key = { _, s -> "so" + s.id }) { i, raw ->
                val song = raw.edited()
                SongRow(song, { actions.play(r.songs, i) }, { actions.songMenu(song) }, playing = raw.id == playingId)
            }
        }
    }
}
