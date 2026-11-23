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
import com.tonihk00.clearplay.data.stats.LibraryStats
import com.tonihk00.clearplay.data.stats.Ranked
import com.tonihk00.clearplay.data.stats.STATS_PAGE
import com.tonihk00.clearplay.data.stats.computeStats
import com.tonihk00.clearplay.data.stats.fmtBytes
import com.tonihk00.clearplay.data.stats.fmtHours
import com.tonihk00.clearplay.data.stats.fmtInt
import androidx.compose.runtime.collectAsState
import com.tonihk00.clearplay.ui.theme.Cp
import com.tonihk00.clearplay.ui.theme.LocalReduceMotion

@Composable
fun StatsScreen(bottomPadding: Dp, preset: LibraryStats? = null, presetSyncedAt: Long? = null) {
    val client = LocalClient.current
    val online = LocalOnline.current
    val actions = LocalActions.current
    val view = when {
        preset != null -> StatsView(preset, syncedAt = presetSyncedAt, subtitle = if (presetSyncedAt != null) OFFLINE_SUBTITLE else SERVER_SUBTITLE)
        client != null -> serverStats(client, online)
        else -> localStats()
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = bottomPadding + 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Column(Modifier.statusBarsPadding().padding(start = 4.dp, top = 12.dp)) {
                Text("Statistics", style = MaterialTheme.typography.headlineMedium)
                Text(view.subtitle, style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint, modifier = Modifier.padding(top = 2.dp))
            }
        }
        val s = view.stats
        when {
            s == null && view.empty != null -> item { EmptyState(view.empty.first, view.empty.second, view.empty.third) }
            s == null -> item {
                Text(
                    if (view.loaded > 0) "Reading your library… ${fmtInt(view.loaded)} songs" else "Reading your library…",
                    style = MaterialTheme.typography.bodyMedium, color = Cp.TextSoft, modifier = Modifier.padding(4.dp),
                )
            }
            else -> {
                item {
                    Column {
                        Tiles(s)
                        view.syncedAt?.let { LastSynced(it, view.updating) }
                    }
                }
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

private const val SERVER_SUBTITLE = "Your listening, from Navidrome's play counts"
private const val OFFLINE_SUBTITLE = "Saved from Navidrome · you're offline"

/** What the page shows: the numbers, or a progress count / empty state; [syncedAt] adds "Last synced". */
private data class StatsView(
    val stats: LibraryStats?,
    val subtitle: String,
    val syncedAt: Long? = null,
    val updating: Boolean = false,
    val loaded: Int = 0,
    val empty: Triple<Int, String, String?>? = null,
)

/**
 * With a server: the saved snapshot of what Navidrome last returned. Online, a snapshot older
 * than 10 minutes (or none) is refetched and replaced; offline it is shown unchanged with
 * "Last synced". Reconnecting refetches by itself (ClearPlayApp), and the page follows.
 */
@Composable
private fun serverStats(client: com.tonihk00.clearplay.data.api.SubsonicClient, online: Boolean): StatsView {
    val repo = com.tonihk00.clearplay.ClearPlayApp.instance.stats
    val key = remember(client) { com.tonihk00.clearplay.data.stats.StatsStore.keyOf(client.server) }
    val snapshots by repo.snapshots.collectAsState()
    val progress by repo.progress.collectAsState()
    var failed by remember(client) { mutableStateOf(false) }
    var diskChecked by remember(client) { mutableStateOf(false) }
    LaunchedEffect(client, online) {
        val saved = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { repo.saved(client.server) }
        diskChecked = true
        if (!online || !repo.isStale(saved)) return@LaunchedEffect
        failed = false
        try {
            repo.refresh(client.server) { offset -> client.songs(STATS_PAGE, offset) }.await()
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e // left the page; the fetch itself carries on in the app
        } catch (e: Exception) {
            failed = true
        }
    }
    val snap = snapshots[key]
    val updating = key in progress
    return when {
        snap != null -> StatsView(
            snap.stats,
            subtitle = if (online) SERVER_SUBTITLE else OFFLINE_SUBTITLE,
            // Offline, or online but the refresh failed or is still running: say how old the numbers are.
            syncedAt = snap.fetchedAt.takeIf { !online || failed || updating },
            updating = online && updating,
        )
        !online && diskChecked -> StatsView(
            null, OFFLINE_SUBTITLE,
            empty = Triple(R.drawable.ic_chart_line, "No statistics saved yet", "Open Statistics once while connected to your server; they stay here for offline."),
        )
        failed -> StatsView(null, SERVER_SUBTITLE, empty = Triple(R.drawable.ic_circle_alert, "Couldn't read your library", null))
        else -> StatsView(null, SERVER_SUBTITLE, loaded = progress[key] ?: 0)
    }
}

/** Without a server (phone music mode): computed from downloads and phone music, as before. */
@Composable
private fun localStats(): StatsView {
    val library = LocalLibrary.current
    val cache = com.tonihk00.clearplay.ui.screenCache()
    val cacheKey = "stats@${System.identityHashCode(library)}"
    var stats by remember(library) { mutableStateOf(cache.map[cacheKey] as LibraryStats?) }
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
    return StatsView(
        stats, "From your downloads and phone music", loaded = loaded,
        empty = if (failed) Triple(R.drawable.ic_circle_alert, "Couldn't read your library", null) else null,
    )
}

/** "Last synced 12 minutes ago", kept current while the page is open. */
@Composable
private fun LastSynced(at: Long, updating: Boolean) {
    val now by androidx.compose.runtime.produceState(System.currentTimeMillis(), at) {
        while (true) {
            value = System.currentTimeMillis()
            kotlinx.coroutines.delay(30_000)
        }
    }
    val ago = if (now - at < 60_000) "just now"
    else android.text.format.DateUtils.getRelativeTimeSpanString(at, now, android.text.format.DateUtils.MINUTE_IN_MILLIS).toString()
    Text(
        "Last synced $ago" + if (updating) " · updating…" else "",
        style = MaterialTheme.typography.bodySmall, color = Cp.TextFaint,
        modifier = Modifier.padding(start = 4.dp, top = 8.dp),
    )
}

@Composable
private fun Tiles(s: LibraryStats) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val days = java.math.BigDecimal(s.listenSeconds / 86_400.0).setScale(1, java.math.RoundingMode.HALF_UP).toPlainString()
            Tile("Hours listened", fmtHours(s.listenSeconds), "$days days of music", Modifier.weight(1f))
            Tile("Plays", fmtInt(s.plays), "${fmtInt(s.songsPlayed)} different songs", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Tile("Discovered", "${s.discoveredPercent}%", "${fmtInt(s.songsPlayed)} of ${fmtInt(s.songs)} songs played", Modifier.weight(1f))
            Tile("Library", fmtHours(s.librarySeconds), "${fmtInt(s.albums)} albums · ${fmtInt(s.artists)} artists · ${fmtBytes(s.libraryBytes)}", Modifier.weight(1f))
        }
    }
}

@Composable
private fun Tile(label: String, value: String, note: String, modifier: Modifier) {
    Column(modifier.glassPanel().padding(16.dp)) {
        Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = Cp.TextFaint)
        Text(value, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 6.dp))
        Text(note, style = MaterialTheme.typography.bodySmall, color = Cp.TextFaint, maxLines = 3)
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
                    Text("${fmtHours(r.seconds)} · ${fmtInt(r.plays)}", style = MaterialTheme.typography.bodySmall, color = Cp.TextFaint)
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
