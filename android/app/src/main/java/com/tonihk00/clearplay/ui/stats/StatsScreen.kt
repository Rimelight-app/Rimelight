package com.tonihk00.clearplay.ui.stats

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.ui.EmptyState
import com.tonihk00.clearplay.ui.LocalActions
import com.tonihk00.clearplay.ui.LocalLibrary
import com.tonihk00.clearplay.ui.LocalOnline
import com.tonihk00.clearplay.ui.components.Cover
import com.tonihk00.clearplay.ui.components.CpIcon
import com.tonihk00.clearplay.ui.components.LocalClient
import com.tonihk00.clearplay.ui.components.MetaChip
import com.tonihk00.clearplay.ui.components.SectionLabel
import com.tonihk00.clearplay.ui.components.glassPanel
import com.tonihk00.clearplay.ui.settings.formatBytes
import com.tonihk00.clearplay.ui.theme.Cp
import com.tonihk00.clearplay.ui.theme.LocalReduceMotion

data class Ranked(val key: String, val label: String, val sublabel: String? = null, val coverArt: String? = null, val id: String? = null, val plays: Int, val seconds: Long)

data class LibraryStats(
    val songs: Int,
    val albums: Int,
    val artists: Int,
    val librarySeconds: Long,
    val libraryBytes: Long,
    val plays: Int,
    val listenSeconds: Long,
    val songsPlayed: Int,
    val losslessShare: Float,
    val formats: List<Pair<String, Int>>,
    val topSongs: List<Song>,
    val topArtists: List<Ranked>,
    val topAlbums: List<Ranked>,
    val topGenres: List<Ranked>,
    val decades: List<Ranked>,
)

private val LOSSLESS = setOf("flac", "alac", "wav", "aiff", "aif", "ape", "wv", "dsf", "dff")

/** Same aggregation as the desktop (src/utils/libraryStats.ts): play counts × durations. */
fun computeStats(songs: List<Song>): LibraryStats {
    val artists = HashMap<String, Ranked>()
    val albums = HashMap<String, Ranked>()
    val genres = HashMap<String, Ranked>()
    val decades = HashMap<String, Ranked>()
    val formats = HashMap<String, Int>()
    fun bump(map: HashMap<String, Ranked>, key: String, init: Ranked, plays: Int, secs: Long) {
        val e = map[key] ?: init
        map[key] = e.copy(plays = e.plays + plays, seconds = e.seconds + secs)
    }
    var plays = 0
    var listen = 0L
    var played = 0
    var lossless = 0
    for (s in songs) {
        val fmt = (s.suffix ?: "?").uppercase()
        formats[fmt] = (formats[fmt] ?: 0) + 1
        if ((s.suffix ?: "").lowercase() in LOSSLESS) lossless++
        val count = s.playCount
        if (count <= 0) continue
        val secs = s.duration.toLong() * count
        plays += count
        listen += secs
        played++
        val ak = s.artistId ?: s.artist.orEmpty()
        bump(artists, ak, Ranked(ak, s.artist ?: "Unknown artist", id = s.artistId, plays = 0, seconds = 0), count, secs)
        s.albumId?.let { bump(albums, it, Ranked(it, s.album.orEmpty(), s.artist, s.coverArt, it, 0, 0), count, secs) }
        s.genre?.takeIf { it.isNotBlank() }?.let { bump(genres, it, Ranked(it, it, plays = 0, seconds = 0), count, secs) }
        s.year?.takeIf { it > 0 }?.let { y ->
            val d = "${y / 10 * 10}s"
            bump(decades, d, Ranked(d, d, plays = 0, seconds = 0), count, secs)
        }
    }
    fun top(m: Map<String, Ranked>, n: Int) = m.values.sortedByDescending { it.seconds }.take(n)
    return LibraryStats(
        songs = songs.size,
        albums = songs.mapNotNull { it.albumId }.toSet().size,
        artists = songs.mapNotNull { it.artistId ?: it.artist }.toSet().size,
        librarySeconds = songs.sumOf { it.duration.toLong() },
        libraryBytes = songs.sumOf { it.size },
        plays = plays,
        listenSeconds = listen,
        songsPlayed = played,
        losslessShare = if (songs.isEmpty()) 0f else lossless.toFloat() / songs.size,
        formats = formats.entries.sortedByDescending { it.value }.map { it.key to it.value },
        topSongs = songs.filter { it.playCount > 0 }.sortedByDescending { it.playCount }.take(10),
        topArtists = top(artists, 8),
        topAlbums = top(albums, 10),
        topGenres = top(genres, 6),
        decades = decades.values.sortedBy { it.key },
    )
}

private fun fmtInt(n: Number) = "%,d".format(n.toLong()).replace(',', ' ')
private fun hours(secs: Long) = if (secs >= 36_000) fmtInt(secs / 3600) else "%.1f".format(secs / 3600.0)

@Composable
fun StatsScreen(bottomPadding: Dp, preset: LibraryStats? = null) {
    val library = LocalLibrary.current ?: LocalClient.current
    val online = LocalOnline.current
    val actions = LocalActions.current
    val cache = com.tonihk00.clearplay.ui.screenCache()
    val cacheKey = "stats@${System.identityHashCode(library)}"
    var stats by remember(library) { mutableStateOf(preset ?: cache.map[cacheKey] as LibraryStats?) }
    var loaded by remember(library) { mutableIntStateOf(0) }
    var failed by remember(library) { mutableStateOf(false) }
    LaunchedEffect(library) {
        if (stats != null || library == null) return@LaunchedEffect
        runCatching { library.allSongs { loaded = it } }
            .onSuccess { songs ->
                stats = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) { computeStats(songs) }
                cache.map[cacheKey] = stats
            }
            .onFailure { failed = true }
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = bottomPadding + 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Column(Modifier.statusBarsPadding().padding(start = 4.dp, top = 12.dp)) {
                Text("Statistics", style = MaterialTheme.typography.headlineMedium)
                Text(
                    if (library?.isRemote == false || !online) "From your downloads and phone music" else "Your listening, from Navidrome's play counts",
                    style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint, modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
        val s = stats
        when {
            failed -> item { EmptyState(R.drawable.ic_circle_alert, "Couldn't read your library") }
            s == null -> item {
                Text(
                    if (loaded > 0) "Reading your library… ${fmtInt(loaded)} songs" else "Reading your library…",
                    style = MaterialTheme.typography.bodyMedium, color = Cp.TextSoft, modifier = Modifier.padding(4.dp),
                )
            }
            else -> {
                item { Tiles(s) }
                if (s.plays == 0) item { EmptyState(R.drawable.ic_chart_line, "No plays yet", "Statistics fill in as you listen.") }
                if (s.topArtists.isNotEmpty()) item { Section("Top artists") { BarList(s.topArtists) { r -> r.id?.let(actions::openArtist) } } }
                if (s.topAlbums.isNotEmpty()) item { TopAlbums(s.topAlbums) }
                if (s.topSongs.isNotEmpty()) item { Section("Top songs") { TopSongs(s.topSongs) } }
                if (s.topGenres.isNotEmpty()) item { Section("Top genres") { BarList(s.topGenres) { r -> actions.openGenre(r.key) } } }
                if (s.decades.isNotEmpty()) item { Section("Decades") { BarList(s.decades) { r -> r.key.removeSuffix("s").toIntOrNull()?.let(actions::openDecade) } } }
                item { Section("Formats") { Formats(s) } }
            }
        }
    }
}

@Composable
private fun Tiles(s: LibraryStats) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Tile("Hours listened", hours(s.listenSeconds), "${hours(s.librarySeconds)} h of music in the library", Modifier.weight(1f))
            Tile("Plays", fmtInt(s.plays), "${fmtInt(s.songsPlayed)} different songs", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val pct = if (s.songs == 0) 0 else s.songsPlayed * 100 / s.songs
            Tile("Discovered", "$pct%", "${fmtInt(s.songsPlayed)} of ${fmtInt(s.songs)} songs played", Modifier.weight(1f))
            Tile("Library", fmtInt(s.songs), "${fmtInt(s.albums)} albums · ${formatBytes(s.libraryBytes)}", Modifier.weight(1f))
        }
    }
}

@Composable
private fun Tile(label: String, value: String, note: String, modifier: Modifier) {
    Column(modifier.glassPanel().padding(16.dp)) {
        Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = Cp.TextFaint)
        Text(value, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 6.dp))
        Text(note, style = MaterialTheme.typography.bodySmall, color = Cp.TextFaint, maxLines = 2)
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().glassPanel().padding(16.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = Cp.TextStrong.copy(alpha = 0.9f))
        Spacer(Modifier.height(12.dp))
        content()
    }
}

/** Rows with a thin white bar sized by listening time; bars grow in once. */
@Composable
private fun BarList(items: List<Ranked>, onClick: ((Ranked) -> Unit)?) {
    val max = items.maxOfOrNull { it.seconds }?.coerceAtLeast(1) ?: 1
    val reduce = LocalReduceMotion.current
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items.forEach { r ->
            val click = onClick?.let { f -> { f(r) } }
            val grow = remember { Animatable(if (reduce) 1f else 0f) }
            LaunchedEffect(Unit) { grow.animateTo(1f, tween(700, easing = Cp.EaseOutSoft)) }
            Column(Modifier.fillMaxWidth().then(if (click != null) Modifier.clip(RoundedCornerShape(8.dp)).clickable(onClick = click) else Modifier)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(r.label, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text("${hours(r.seconds)} h · ${fmtInt(r.plays)}", style = MaterialTheme.typography.bodySmall, color = Cp.TextFaint)
                }
                Spacer(Modifier.height(6.dp))
                Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(Cp.Muted)) {
                    Box(Modifier.fillMaxWidth(r.seconds.toFloat() / max * grow.value).height(4.dp).clip(CircleShape).background(Cp.TextStrong.copy(alpha = 0.8f)))
                }
            }
        }
    }
}

@Composable
private fun TopAlbums(albums: List<Ranked>) {
    val actions = LocalActions.current
    Column {
        SectionLabel("Top albums", Modifier.padding(start = 4.dp, bottom = 8.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(albums, key = { it.key }) { a ->
                Column(Modifier.width(132.dp).clip(RoundedCornerShape(16.dp)).clickable { a.id?.let(actions::openAlbum) }) {
                    Cover(a.coverArt, Modifier.size(132.dp), Cp.Shape, 300)
                    Text(a.label, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
                    Text("${fmtInt(a.plays)} plays", style = MaterialTheme.typography.bodySmall, color = Cp.TextFaint)
                }
            }
        }
    }
}

@Composable
private fun TopSongs(songs: List<Song>) {
    val actions = LocalActions.current
    Column {
        songs.forEachIndexed { i, s ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { actions.play(songs, i) }.padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("${i + 1}", style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint, modifier = Modifier.width(26.dp))
                Cover(s.coverArt, Modifier.size(40.dp), RoundedCornerShape(8.dp), 150)
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Text(s.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(s.artist.orEmpty(), style = MaterialTheme.typography.bodySmall, color = Cp.TextFaint, maxLines = 1)
                }
                Text("${fmtInt(s.playCount)}×", style = MaterialTheme.typography.bodySmall, color = Cp.TextSoft)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Formats(s: LibraryStats) {
    Column {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            s.formats.take(8).forEach { (f, n) -> MetaChip("$f · ${fmtInt(n)}") }
        }
        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            CpIcon(R.drawable.ic_sparkles, size = 16.dp, tint = Cp.TextSoft)
            Text("${(s.losslessShare * 100).toInt()}% lossless", style = MaterialTheme.typography.bodyMedium, color = Cp.TextSoft, modifier = Modifier.padding(start = 8.dp))
        }
    }
}
