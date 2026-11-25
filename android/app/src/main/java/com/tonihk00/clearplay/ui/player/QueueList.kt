package com.tonihk00.clearplay.ui.player

import androidx.compose.animation.core.animate
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.player.PlayerState
import com.tonihk00.clearplay.ui.LocalActions
import com.tonihk00.clearplay.ui.components.Cover
import com.tonihk00.clearplay.ui.components.CpIcon
import com.tonihk00.clearplay.ui.components.IconButtonCp
import com.tonihk00.clearplay.ui.components.glassPanel
import com.tonihk00.clearplay.ui.edited
import com.tonihk00.clearplay.ui.theme.Cp
import com.tonihk00.clearplay.ui.theme.LocalReduceMotion
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** One queue row. [index] is its place in the player's queue; [key] stays the same while it moves. */
internal data class QueueEntry(val key: String, val song: Song, val index: Int)

/** Stable row keys: the song id plus which copy of it this is (a song can be queued twice). */
internal fun queueEntries(queue: List<Song>): List<QueueEntry> {
    val seen = HashMap<String, Int>()
    return queue.mapIndexed { i, s ->
        val n = (seen[s.id] ?: 0) + 1
        seen[s.id] = n
        QueueEntry("${s.id}#$n", s, i)
    }
}

/** [this] with the item at [from] moved to [to]. */
internal fun <T> List<T>.moved(from: Int, to: Int): List<T> =
    if (from == to || from !in indices || to !in indices) this else toMutableList().apply { add(to, removeAt(from)) }

/** The row being held or dragged. */
private class QueueDrag {
    var key by mutableStateOf<String?>(null)
    var dragging by mutableStateOf(false)
    /** Dragged row's distance from its laid-out place, so it stays under the finger. */
    var offset by mutableFloatStateOf(0f)
    /** List index the dragged row should be at once the last swap is laid out. */
    var expectIndex = -1
}

/**
 * The queue in the full player.
 * - Tap a song: play it.
 * - Hold it still: the row lifts; let go and the song menu opens (play next, go to album…).
 * - Hold and move: the row follows the finger and the others make room; let go to drop it there.
 *   Near the top or bottom edge the list scrolls by itself.
 */
@Composable
fun QueueList(state: PlayerState, controls: PlayerControls, modifier: Modifier = Modifier) {
    val actions = LocalActions.current
    val haptic = LocalHapticFeedback.current
    val reduce = LocalReduceMotion.current
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val list = rememberLazyListState(initialFirstVisibleItemIndex = state.index.coerceAtLeast(0))
    // Follow the playing song when it changes (not when the queue is only reordered).
    val drag = remember { QueueDrag() }
    // (Not while a row is held: that would pull the list away from under the finger.)
    LaunchedEffect(state.current?.id) { if (state.index >= 0 && drag.key == null) list.animateScrollToItem(state.index) }

    val fromPlayer = remember(state.queue) { queueEntries(state.queue) }
    var rows by remember { mutableStateOf(fromPlayer) }
    // The player's order, except while a row is held (the drop sends its move to the player,
    // which then sends the same order back).
    LaunchedEffect(fromPlayer) { if (drag.key == null) rows = fromPlayer }
    val latestFromPlayer by rememberUpdatedState(fromPlayer)

    fun settleSwaps() {
        val info = list.layoutInfo
        val cur = info.visibleItemsInfo.firstOrNull { it.key == drag.key } ?: return
        if (cur.index != drag.expectIndex) return // last swap not laid out yet
        val center = cur.offset + drag.offset + cur.size / 2f
        val next = info.visibleItemsInfo.firstOrNull { it.index == cur.index + 1 }
        val prev = info.visibleItemsInfo.firstOrNull { it.index == cur.index - 1 }
        val target = when {
            next != null && drag.offset > 0 && center > next.offset + next.size / 2f -> next
            prev != null && drag.offset < 0 && center < prev.offset + prev.size / 2f -> prev
            else -> return
        }
        rows = rows.moved(cur.index, target.index)
        // The row's slot moves by the neighbour's height; shift the offset back so it stays put.
        drag.offset += if (target.index > cur.index) -target.size.toFloat() else target.size.toFloat()
        drag.expectIndex = target.index
        haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
    }

    // Scroll by itself while the dragged row is near an edge.
    val edgePx = with(density) { 64.dp.toPx() }
    val maxSpeed = with(density) { 14.dp.toPx() }
    LaunchedEffect(drag.dragging) {
        if (!drag.dragging) return@LaunchedEffect
        while (isActive) {
            withFrameNanos {}
            val info = list.layoutInfo
            val cur = info.visibleItemsInfo.firstOrNull { it.key == drag.key } ?: continue
            val top = cur.offset + drag.offset
            val bottom = top + cur.size
            val speed = when {
                top < info.viewportStartOffset + edgePx -> -maxSpeed * ((info.viewportStartOffset + edgePx - top) / edgePx).coerceIn(0f, 1f)
                bottom > info.viewportEndOffset - edgePx -> maxSpeed * ((bottom - (info.viewportEndOffset - edgePx)) / edgePx).coerceIn(0f, 1f)
                else -> 0f
            }
            if (speed != 0f) {
                val used = list.scrollBy(speed)
                drag.offset += used
                settleSwaps()
            }
        }
    }

    fun drop(entry: QueueEntry) {
        val wasDragging = drag.dragging
        drag.dragging = false
        if (!wasDragging) {
            drag.key = null
            actions.songMenu(entry.song)
            return
        }
        val from = latestFromPlayer.indexOfFirst { it.key == entry.key }
        val to = rows.indexOfFirst { it.key == entry.key }
        haptic.performHapticFeedback(HapticFeedbackType.GestureEnd)
        scope.launch {
            // Ease the row into its slot, then hand the new order to the player.
            if (!reduce) animate(drag.offset, 0f, animationSpec = tween(Cp.ControlMs, easing = Cp.EaseOutSoft)) { v, _ -> drag.offset = v }
            drag.offset = 0f
            drag.key = null
            if (from >= 0 && to >= 0 && from != to) controls.move(from, to) else rows = latestFromPlayer
        }
    }

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
                CpIcon(R.drawable.ic_list_x, size = 16.dp, tint = Cp.TextSoft)
                Spacer(Modifier.width(6.dp))
                Text("Clear", style = MaterialTheme.typography.labelLarge, color = Cp.TextSoft)
            }
            if (controls.hasServer) QueueServerMenu(controls)
        }
        LazyColumn(Modifier.fillMaxSize().edgeFade(0.04f, 0.08f), state = list, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
            items(rows, key = { it.key }) { entry ->
                val held = drag.key == entry.key
                val lift by animateFloatAsState(if (held) 1f else 0f, tween(if (reduce) 0 else Cp.ControlMs, easing = Cp.EaseOutSoft), label = "lift")
                QueueRow(
                    entry.song.edited(),
                    current = entry.index == state.index,
                    past = entry.index < state.index,
                    lift = lift,
                    onClick = { controls.skipTo(entry.index) },
                    onRemove = { controls.removeAt(entry.index) },
                    modifier = Modifier
                        .then(if (held) Modifier.zIndex(1f) else Modifier.animateItem(fadeInSpec = null, fadeOutSpec = null, placementSpec = tween(if (reduce) 0 else Cp.ControlMs + 40, easing = Cp.EaseOutSoft)))
                        .graphicsLayer { translationY = if (held) drag.offset else 0f },
                    gesture = Modifier.holdToDrag(
                        key = entry.key,
                        onHold = {
                            rows = latestFromPlayer
                            drag.key = entry.key
                            drag.offset = 0f
                            drag.expectIndex = list.layoutInfo.visibleItemsInfo.firstOrNull { it.key == entry.key }?.index
                                ?: rows.indexOfFirst { it.key == entry.key }
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        },
                        onDragStart = { drag.dragging = true },
                        onDrag = { dy -> drag.offset += dy; settleSwaps() },
                        onRelease = { drop(entry) },
                        onCancel = { drag.dragging = false; drag.offset = 0f; drag.key = null; rows = latestFromPlayer },
                    ),
                )
            }
        }
    }
}

/**
 * Hold without moving for the long-press time, then: let go → [onRelease] without a drag;
 * move → [onDragStart], [onDrag] per movement, [onRelease] at the end. Moving before the hold
 * time is a normal scroll (nothing is consumed), and a quick tap stays a tap.
 */
private fun Modifier.holdToDrag(
    key: Any,
    onHold: () -> Unit,
    onDragStart: () -> Unit,
    onDrag: (Float) -> Unit,
    onRelease: () -> Unit,
    onCancel: () -> Unit,
): Modifier = pointerInput(key) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        val slop = viewConfiguration.touchSlop
        // null = still held after the timeout; true = lifted or moved/taken by a scroll first.
        val ended = withTimeoutOrNull(viewConfiguration.longPressTimeoutMillis) {
            while (true) {
                val ev = awaitPointerEvent()
                val c = ev.changes.firstOrNull { it.id == down.id } ?: return@withTimeoutOrNull true
                if (!c.pressed || c.isConsumed) return@withTimeoutOrNull true
                if ((c.position - down.position).getDistance() > slop) return@withTimeoutOrNull true
            }
            @Suppress("UNREACHABLE_CODE")
            true
        }
        if (ended != null) return@awaitEachGesture
        onHold()
        var dragging = false
        var start = down.position
        var lifted = false
        while (true) {
            val ev = awaitPointerEvent()
            val c = ev.changes.firstOrNull { it.id == down.id }
            if (c == null) break
            if (!c.pressed) { c.consume(); lifted = true; break }
            if (!dragging && (c.position - start).getDistance() > slop) {
                dragging = true
                onDragStart()
                start = c.position
            } else if (dragging) {
                onDrag(c.positionChange().y)
            }
            c.consume()
        }
        if (lifted) onRelease() else onCancel()
    }
}

@Composable
private fun QueueRow(
    song: Song,
    current: Boolean,
    past: Boolean,
    lift: Float,
    onClick: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
    gesture: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier
            .fillMaxWidth()
            .graphicsLayer {
                val s = 1f + 0.03f * lift
                scaleX = s; scaleY = s
            }
            // A lifted row gets a nearly solid popover fill under its glass, so rows sliding
            // past underneath don't show through it.
            .then(if (lift > 0f) Modifier.background(Cp.Popover.copy(alpha = 0.94f * lift), shape) else Modifier)
            .then(if (current || lift > 0f) Modifier.glassPanel(shape, strong = true) else Modifier)
            .clickable(onClick = onClick)
            // Inside clickable, so a hold that ends here is not also taken as a tap.
            .then(gesture)
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

/** ⋮ next to Clear: Load queue from server / Save queue to server (Continue on other devices). */
@Composable
private fun QueueServerMenu(controls: PlayerControls) {
    var open by remember { mutableStateOf(false) }
    androidx.compose.foundation.layout.Box {
        IconButtonCp(R.drawable.ic_ellipsis_vertical, "Queue menu", { open = true }, size = 36.dp, iconSize = 18.dp)
        androidx.compose.material3.DropdownMenu(
            expanded = open,
            onDismissRequest = { open = false },
            containerColor = Cp.Card,
            shape = RoundedCornerShape(14.dp),
        ) {
            androidx.compose.material3.DropdownMenuItem(
                text = { Text("Load queue from server", style = MaterialTheme.typography.bodyLarge) },
                leadingIcon = { CpIcon(R.drawable.ic_cloud_download, size = 18.dp, tint = Cp.TextSoft) },
                onClick = { open = false; controls.loadQueueFromServer() },
            )
            androidx.compose.material3.DropdownMenuItem(
                text = { Text("Save queue to server", style = MaterialTheme.typography.bodyLarge) },
                leadingIcon = { CpIcon(R.drawable.ic_server, size = 18.dp, tint = Cp.TextSoft) },
                onClick = { open = false; controls.saveQueueToServer() },
            )
        }
    }
}
