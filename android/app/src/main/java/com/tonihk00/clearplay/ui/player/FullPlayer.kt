package com.tonihk00.clearplay.ui.player

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import kotlinx.coroutines.launch
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.clip
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.remember
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.media3.common.Player
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.data.api.Lyrics
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.player.PlayerState
import com.tonihk00.clearplay.ui.LocalActions
import com.tonihk00.clearplay.ui.edited
import com.tonihk00.clearplay.ui.components.Cover
import com.tonihk00.clearplay.ui.components.CoverBackdrop
import com.tonihk00.clearplay.ui.components.IconButtonCp
import com.tonihk00.clearplay.ui.components.LikeButton
import com.tonihk00.clearplay.ui.components.PlayButton
import com.tonihk00.clearplay.ui.components.StarRating
import com.tonihk00.clearplay.ui.components.glassPanel
import com.tonihk00.clearplay.ui.theme.Cp

/** What the player screens can ask the player to do. */
interface PlayerControls {
    fun togglePlay() {}
    fun next() {}
    fun previous() {}
    fun seekTo(ms: Long) {}
    fun toggleShuffle() {}
    fun cycleRepeat() {}
    fun skipTo(index: Int) {}
    fun removeAt(index: Int) {}
    fun move(from: Int, to: Int) {}
    fun clearQueue() {}
    fun position(): Long = 0
    fun setSleep(minutes: Int?, endOfSong: Boolean = false) {}
}

sealed interface LyricsState {
    data object Loading : LyricsState
    data object None : LyricsState
    data class Ready(val lyrics: Lyrics) : LyricsState
}

enum class Panel { None, Lyrics, Queue }

@Composable
fun FullPlayer(
    state: PlayerState,
    controls: PlayerControls,
    lyrics: LyricsState,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    initialPanel: Panel = Panel.None,
    fixedPositionMs: Long? = null,
    backdrop: @Composable () -> Unit = { CoverBackdrop(state.current?.coverArt, dim = 0.05f) },
    sleep: com.tonihk00.clearplay.player.PlayerConnection.Sleep? = null,
    /** Bitrate cap and format in use (to show "→ OPUS 192"), or null. */
    streamCap: Pair<Int, String>? = null,
    /** True while the player is being pulled down, so the page underneath must draw again. */
    onReveal: (Boolean) -> Unit = {},
) {
    val raw = state.current ?: return
    val song = raw.edited()
    var panel by rememberSaveable { mutableStateOf(initialPanel) }
    var sleepSheet by remember { mutableStateOf(false) }
    fun toggle(p: Panel) { panel = if (panel == p) Panel.None else p }
    val pull = rememberPullToDismiss(onClose)
    LaunchedEffect(pull) { androidx.compose.runtime.snapshotFlow { pull.offset > 0f }.collect(onReveal) }
    // Predictive back: the player follows the back swipe down, then closes (or springs back).
    val screenPx = with(androidx.compose.ui.platform.LocalDensity.current) { androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp.dp.toPx() }
    androidx.activity.compose.PredictiveBackHandler { progress ->
        try {
            progress.collect { e -> pull.follow(e.progress * screenPx * 0.35f) }
            onClose()
        } catch (e: kotlinx.coroutines.CancellationException) {
            pull.settle(0f)
            throw e
        }
    }

    Box(
        modifier.fillMaxSize()
            .graphicsLayer {
                translationY = pull.offset
                val f = (pull.offset / size.height).coerceIn(0f, 1f)
                shape = RoundedCornerShape((f * 160).coerceAtMost(28f).dp)
                clip = pull.offset > 0f
            }
            .nestedScroll(pull.connection)
            .draggable(pull.draggable, Orientation.Vertical, onDragStopped = { v -> pull.settle(v) }),
    ) {
        backdrop()
        Column(Modifier.fillMaxSize().systemBarsPadding()) {
            // Grab handle: pull down anywhere outside the lyrics to minimise.
            Box(Modifier.fillMaxWidth().padding(top = 2.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.size(width = 36.dp, height = 4.dp).clip(CircleShape).background(Cp.TextFaint.copy(alpha = 0.5f)))
            }
            // Top bar: close on the left, lyrics/queue toggles in a glass chip on the right.
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButtonCp(R.drawable.ic_chevron_down, "Close", onClose, size = 40.dp, tint = Cp.TextSoft)
                Spacer(Modifier.weight(1f))
                Row(Modifier.glassPanel(CircleShape, strong = true).padding(2.dp)) {
                    IconButtonCp(R.drawable.ic_mic_vocal, "Lyrics", { toggle(Panel.Lyrics) }, size = 38.dp, iconSize = 18.dp, active = panel == Panel.Lyrics)
                    IconButtonCp(R.drawable.ic_list_music, "Queue", { toggle(Panel.Queue) }, size = 38.dp, iconSize = 18.dp, active = panel == Panel.Queue)
                    IconButtonCp(R.drawable.ic_moon, "Sleep timer", { sleepSheet = true }, size = 38.dp, iconSize = 18.dp, active = sleep != null)
                }
            }

            AnimatedContent(
                panel,
                Modifier.weight(1f),
                transitionSpec = { fadeIn(tween(Cp.ScreenMs, easing = Cp.EaseOutSoft)) togetherWith fadeOut(tween(150)) },
                label = "panel",
            ) { p ->
                when (p) {
                    Panel.None -> CoverAndTitle(song, streamCap) {
                        SeekBar(controls::position, state.durationMs, state.isPlaying, raw.id, controls::seekTo)
                        Spacer(Modifier.height(6.dp))
                        TransportRow(state, controls)
                    }
                    Panel.Lyrics -> Column(Modifier.fillMaxSize()) {
                        SmallHeader(song)
                        Box(Modifier.weight(1f).padding(horizontal = 24.dp)) {
                            when (lyrics) {
                                is LyricsState.Ready -> LyricsView(
                                    lyrics.lyrics, controls::position, state.isPlaying, controls::seekTo,
                                    songKey = raw.id, fixedPositionMs = fixedPositionMs,
                                )
                                LyricsState.Loading -> NoLyrics(loading = true)
                                LyricsState.None -> NoLyrics(loading = false)
                            }
                        }
                    }
                    Panel.Queue -> Column(Modifier.fillMaxSize()) {
                        SmallHeader(song)
                        QueueList(state, controls, Modifier.weight(1f))
                    }
                }
            }

            if (panel != Panel.None) Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 12.dp)) {
                Spacer(Modifier.height(10.dp))
                SeekBar(controls::position, state.durationMs, state.isPlaying, raw.id, controls::seekTo)
                Spacer(Modifier.height(6.dp))
                TransportRow(state, controls)
            }
        }
    }
    if (sleepSheet) SleepSheet(sleep, controls::setSleep) { sleepSheet = false }
}

/** Drag-down-to-minimise state shared by the player's own drag and nested scrolling lists. */
class PullToDismiss(private val scope: kotlinx.coroutines.CoroutineScope, private val threshold: Float, private val onDismiss: () -> Unit) {
    private val anim = androidx.compose.animation.core.Animatable(0f)
    val offset get() = anim.value

    val draggable = androidx.compose.foundation.gestures.DraggableState { d -> scope.launch { anim.snapTo((anim.value + d).coerceAtLeast(0f)) } }

    /** Follow an external drag (predictive back) to [px]. */
    suspend fun follow(px: Float) = anim.snapTo(px.coerceAtLeast(0f))

    fun settle(velocity: Float) {
        scope.launch {
            if (anim.value > threshold || (velocity > 1600f && anim.value > 0f)) onDismiss()
            else anim.animateTo(0f, tween(Cp.ControlMs + 40, easing = Cp.EaseOutSoft))
        }
    }

    /** A list at its top hands further downward pulls to the player. */
    val connection = object : androidx.compose.ui.input.nestedscroll.NestedScrollConnection {
        override fun onPreScroll(available: androidx.compose.ui.geometry.Offset, source: androidx.compose.ui.input.nestedscroll.NestedScrollSource): androidx.compose.ui.geometry.Offset {
            if (anim.value > 0f && available.y < 0f) {
                val used = maxOf(available.y, -anim.value)
                scope.launch { anim.snapTo(anim.value + used) }
                return androidx.compose.ui.geometry.Offset(0f, used)
            }
            return androidx.compose.ui.geometry.Offset.Zero
        }

        override fun onPostScroll(consumed: androidx.compose.ui.geometry.Offset, available: androidx.compose.ui.geometry.Offset, source: androidx.compose.ui.input.nestedscroll.NestedScrollSource): androidx.compose.ui.geometry.Offset {
            if (available.y > 0f && source == androidx.compose.ui.input.nestedscroll.NestedScrollSource.UserInput) {
                scope.launch { anim.snapTo(anim.value + available.y) }
                return androidx.compose.ui.geometry.Offset(0f, available.y)
            }
            return androidx.compose.ui.geometry.Offset.Zero
        }

        override suspend fun onPreFling(available: androidx.compose.ui.unit.Velocity): androidx.compose.ui.unit.Velocity {
            if (anim.value > 0f) {
                settle(available.y)
                return available
            }
            return androidx.compose.ui.unit.Velocity.Zero
        }
    }
}

@Composable
fun rememberPullToDismiss(onDismiss: () -> Unit): PullToDismiss {
    val scope = rememberCoroutineScope()
    val threshold = with(androidx.compose.ui.platform.LocalDensity.current) { 140.dp.toPx() }
    val latest = androidx.compose.runtime.rememberUpdatedState(onDismiss)
    return remember { PullToDismiss(scope, threshold) { latest.value() } }
}

/**
 * Cover, title, seek bar and controls as one group, sitting a little above centre: spare
 * height is split one third above, two thirds below, so nothing floats apart on tall phones.
 */
@Composable
private fun CoverAndTitle(song: Song, streamCap: Pair<Int, String>?, controls: @Composable () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val side = minOf(maxWidth - 56.dp, maxHeight - 330.dp).coerceAtLeast(160.dp)
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(Modifier.weight(1f))
            Cover(
                song.coverArt,
                Modifier.size(side).shadow(36.dp, Cp.BigCoverShape, ambientColor = androidx.compose.ui.graphics.Color.Black, spotColor = androidx.compose.ui.graphics.Color.Black),
                Cp.BigCoverShape,
                sizePx = 600,
            )
            Spacer(Modifier.height(22.dp))
            Column(Modifier.padding(horizontal = 24.dp)) {
                TitleBlock(song, streamCap)
                Spacer(Modifier.height(10.dp))
                controls()
            }
            Spacer(Modifier.weight(2f))
        }
    }
}

@Composable
private fun TitleBlock(song: Song, streamCap: Pair<Int, String>?) {
    val actions = LocalActions.current
    Row(verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f)) {
            Text(song.title, style = MaterialTheme.typography.headlineMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(4.dp))
            Text(
                listOfNotNull(song.artist, song.album).joinToString(" · "),
                style = MaterialTheme.typography.titleMedium,
                color = Cp.TextSoft,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clickable { song.albumId?.let(actions::openAlbum) },
            )
            QualityLine(song, streamCap, Modifier.padding(top = 6.dp))
            OutputLine(song, com.tonihk00.clearplay.player.AudioPath.state.collectAsState().value, Modifier.padding(top = 2.dp))
            Spacer(Modifier.height(4.dp))
            if (!song.isLocal) StarRating(song.userRating, { actions.rate(song, it) }, Modifier.padding(start = 0.dp), starSize = 17.dp)
        }
        if (!song.isLocal) LikeButton(song.isStarred, { actions.toggleLike(song) })
    }
}

/** "FLAC · 24-bit · 96 kHz · 2 304 kbps" with a Hi-Res badge, like the desktop player bar. */
@Composable
fun QualityLine(song: Song, streamCap: Pair<Int, String>?, modifier: Modifier = Modifier) {
    val parts = listOfNotNull(
        song.suffix?.uppercase(),
        song.bitDepth?.takeIf { it > 0 }?.let { "$it-bit" },
        song.samplingRate?.takeIf { it > 0 }?.let { r -> if (r % 1000 == 0) "${r / 1000} kHz" else "%.1f kHz".format(r / 1000.0) },
        song.bitRate?.takeIf { it > 0 }?.let { "$it kbps" },
    )
    if (parts.isEmpty()) return
    val hiRes = (song.bitDepth ?: 0) >= 24 && (song.samplingRate ?: 0) >= 48_000
    val download = com.tonihk00.clearplay.ui.LocalDownloadStates.current[song.id]
    val downloaded = com.tonihk00.clearplay.ui.LocalPlaybackSource.current.useDownload(
        downloaded = download?.done == true,
        online = com.tonihk00.clearplay.ui.LocalOnline.current,
        hasServer = com.tonihk00.clearplay.ui.components.LocalClient.current != null,
    )
    // A download plays as it was saved: the original file, or converted at the download quality.
    val converted = if (downloaded) download?.transcode
    else streamCap?.takeIf { (cap, _) -> !song.isLocal && cap > 0 && (song.bitRate ?: 0) > cap }?.let { (cap, fmt) -> cap to fmt as String? }
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(parts.joinToString(" · "), style = MaterialTheme.typography.labelMedium, color = Cp.TextFaint, maxLines = 1)
        if (hiRes && converted == null) {
            Text(
                "Hi-Res",
                Modifier.padding(start = 8.dp).border(1.dp, Cp.TextFaint, RoundedCornerShape(4.dp)).padding(horizontal = 5.dp, vertical = 1.dp),
                style = MaterialTheme.typography.labelSmall, color = Cp.TextSoft,
            )
        }
        if (converted != null) {
            Text("  →  " + (converted.second?.let { "${it.uppercase()} ${converted.first}" } ?: "${converted.first} kbps"), style = MaterialTheme.typography.labelMedium, color = Cp.TextSoft, maxLines = 1)
        }
    }
}

/** Where the sound really goes, under the quality line. Hidden until a song has played. */
@Composable
fun OutputLine(song: Song, path: com.tonihk00.clearplay.player.OutputPath, modifier: Modifier = Modifier) {
    val text = outputText(song.samplingRate, song.bitDepth, path) ?: return
    val exact = path.kind == com.tonihk00.clearplay.player.OutputPath.Kind.BitPerfect
    Column(modifier) {
        Text(text, style = MaterialTheme.typography.labelMedium, color = if (exact) Cp.TextStrong else Cp.TextFaint, maxLines = 1, overflow = TextOverflow.Ellipsis)
        // Why bit-perfect isn't on although Settings asks for it (own line, so it is never cut off).
        path.reason?.let {
            Text(it.replaceFirstChar(Char::uppercase), style = MaterialTheme.typography.bodySmall, color = Cp.TextFaint, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/**
 * Short status of the output: "Bit-perfect · 96 kHz · 24-bit", "No resampling · 44.1 kHz · 24-bit"
 * (mixer set to the song's format on phones without bit-perfect), "Resampled to 48 kHz",
 * "Mixed at 48 kHz", "Android mixer" (rate not reported) or "Bluetooth · re-encoded".
 * The decoded rate ([OutputPath.inputRate]) wins over the server's [songRate], so a converted
 * download is judged by what really plays.
 */
fun outputText(songRate: Int?, songBits: Int?, path: com.tonihk00.clearplay.player.OutputPath): String? {
    fun khz(r: Int) = com.tonihk00.clearplay.player.khzText(r)
    val input = path.inputRate.takeIf { it > 0 } ?: songRate?.takeIf { it > 0 }
    return when (path.kind) {
        com.tonihk00.clearplay.player.OutputPath.Kind.Unknown -> null
        com.tonihk00.clearplay.player.OutputPath.Kind.BitPerfect -> {
            val bits = songBits?.takeIf { it > 0 }
            if (bits != null && bits > path.bits) "Cut to ${path.bits}-bit · ${khz(path.sampleRate)}"
            else "Bit-perfect · ${khz(path.sampleRate)} · ${bits ?: path.bits}-bit"
        }
        com.tonihk00.clearplay.player.OutputPath.Kind.NativeRate -> {
            val bits = songBits?.takeIf { it > 0 }
            if (bits != null && bits > path.bits) "Cut to ${path.bits}-bit · ${khz(path.sampleRate)}"
            else "No resampling · ${khz(path.sampleRate)} · ${bits ?: path.bits}-bit"
        }
        com.tonihk00.clearplay.player.OutputPath.Kind.Bluetooth -> "Bluetooth · re-encoded"
        com.tonihk00.clearplay.player.OutputPath.Kind.Mixer -> when {
            path.sampleRate <= 0 -> "Android mixer"
            input != null && input != path.sampleRate -> "Resampled to ${khz(path.sampleRate)}"
            else -> "Mixed at ${khz(path.sampleRate)}"
        }
    }
}

@Composable
private fun SmallHeader(song: Song) {
    val actions = LocalActions.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Cover(song.coverArt, Modifier.size(56.dp), RoundedCornerShape(12.dp), 200)
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Text(song.title, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(song.artist.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = Cp.TextSoft, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (!song.isLocal) LikeButton(song.isStarred, { actions.toggleLike(song) }, size = 40.dp, iconSize = 20.dp)
    }
}

@Composable
fun TransportRow(state: PlayerState, controls: PlayerControls, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        IconButtonCp(R.drawable.ic_shuffle, "Shuffle", controls::toggleShuffle, active = state.shuffle, tint = if (state.shuffle) Cp.TextStrong else Cp.TextFaint)
        IconButtonCp(R.drawable.ic_skip_back_filled, "Previous", controls::previous, size = 52.dp, iconSize = 26.dp, tint = Cp.TextStrong)
        PlayButton(state.isPlaying, controls::togglePlay, size = 72.dp)
        IconButtonCp(R.drawable.ic_skip_forward_filled, "Next", controls::next, size = 52.dp, iconSize = 26.dp, tint = Cp.TextStrong)
        val one = state.repeat == Player.REPEAT_MODE_ONE
        val on = state.repeat != Player.REPEAT_MODE_OFF
        IconButtonCp(if (one) R.drawable.ic_repeat_1 else R.drawable.ic_repeat, "Repeat", controls::cycleRepeat, active = on, tint = if (on) Cp.TextStrong else Cp.TextFaint)
    }
}
