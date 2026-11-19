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
) {
    val raw = state.current ?: return
    val song = raw.edited()
    var panel by rememberSaveable { mutableStateOf(initialPanel) }
    var sleepSheet by remember { mutableStateOf(false) }
    fun toggle(p: Panel) { panel = if (panel == p) Panel.None else p }
    val pull = rememberPullToDismiss(onClose)

    Box(
        modifier.fillMaxSize()
            .graphicsLayer {
                translationY = pull.offset
                val f = (pull.offset / size.height).coerceIn(0f, 1f)
                scaleX = 1f - f * 0.08f
                scaleY = 1f - f * 0.08f
                shape = RoundedCornerShape((f * 160).coerceAtMost(28f).dp)
                clip = pull.offset > 0f
            }
            .nestedScroll(pull.connection)
            .draggable(pull.draggable, Orientation.Vertical, onDragStopped = { v -> pull.settle(v) }),
    ) {
        backdrop()
        Column(Modifier.fillMaxSize().systemBarsPadding()) {
            // Grab handle: pull down anywhere outside the lyrics to minimise.
            Box(Modifier.fillMaxWidth().padding(top = 6.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.size(width = 36.dp, height = 4.dp).clip(CircleShape).background(Cp.TextFaint.copy(alpha = 0.5f)))
            }
            // Top bar: close on the left, lyrics/queue toggles in a glass chip on the right.
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
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
                    Panel.None -> BigCover(song)
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

            Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 12.dp)) {
                if (panel == Panel.None) TitleBlock(song)
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

@Composable
private fun BigCover(song: Song) {
    BoxWithConstraints(Modifier.fillMaxSize().padding(horizontal = 28.dp, vertical = 12.dp), contentAlignment = Alignment.Center) {
        val side = minOf(maxWidth, maxHeight)
        Cover(
            song.coverArt,
            Modifier.size(side).shadow(36.dp, Cp.BigCoverShape, ambientColor = androidx.compose.ui.graphics.Color.Black, spotColor = androidx.compose.ui.graphics.Color.Black),
            Cp.BigCoverShape,
            sizePx = 800,
        )
    }
}

@Composable
private fun TitleBlock(song: Song) {
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
            Spacer(Modifier.height(6.dp))
            StarRating(song.userRating, { actions.rate(song, it) }, Modifier.padding(start = 0.dp), starSize = 17.dp)
        }
        LikeButton(song.isStarred, { actions.toggleLike(song) })
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
        LikeButton(song.isStarred, { actions.toggleLike(song) }, size = 40.dp, iconSize = 20.dp)
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

@Composable
fun QueueList(state: PlayerState, controls: PlayerControls, modifier: Modifier = Modifier) {
    val list = rememberLazyListState(initialFirstVisibleItemIndex = (state.index).coerceAtLeast(0))
    LaunchedEffect(state.index) { if (state.index >= 0) list.animateScrollToItem(state.index) }
    Column(modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(start = 24.dp, end = 16.dp, top = 6.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (state.endless) "Queue · shuffling the library" else "Queue · ${state.queue.size} song${if (state.queue.size == 1) "" else "s"}",
                style = MaterialTheme.typography.titleSmall,
                color = Cp.TextSoft,
                modifier = Modifier.weight(1f),
            )
            Row(
                Modifier.glassPanel(CircleShape, strong = true).clickable(onClick = controls::clearQueue).padding(horizontal = 14.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                com.tonihk00.clearplay.ui.components.CpIcon(R.drawable.ic_list_x, size = 16.dp, tint = Cp.TextSoft)
                Spacer(Modifier.width(6.dp))
                Text("Clear", style = MaterialTheme.typography.labelLarge, color = Cp.TextSoft)
            }
        }
        LazyColumn(Modifier.fillMaxSize().edgeFade(0.04f, 0.08f), state = list, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
            itemsIndexed(state.queue, key = { i, s -> "${s.id}-$i" }) { i, s ->
                QueueRow(s.edited(), i == state.index, i < state.index, { controls.skipTo(i) }, { controls.removeAt(i) })
            }
        }
    }
}

@Composable
private fun QueueRow(song: Song, current: Boolean, past: Boolean, onClick: () -> Unit, onRemove: () -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .then(if (current) Modifier.glassPanel(RoundedCornerShape(12.dp), strong = true) else Modifier)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(song.coverArt, Modifier.size(44.dp), RoundedCornerShape(10.dp), 120)
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            val c = when { current -> Cp.TextStrong; past -> Cp.TextFaint; else -> Cp.TextStrong.copy(alpha = 0.88f) }
            Text(song.title, style = MaterialTheme.typography.titleMedium, color = c, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(song.artist.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (!current) IconButtonCp(R.drawable.ic_x, "Remove", onRemove, size = 34.dp, iconSize = 16.dp, tint = Cp.TextFaint)
    }
}
