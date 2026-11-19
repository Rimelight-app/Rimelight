package com.tonihk00.clearplay.ui.player

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.ui.Alignment
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onPlaced
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.tonihk00.clearplay.data.api.LyricLine
import com.tonihk00.clearplay.data.api.Lyrics
import com.tonihk00.clearplay.data.api.activeLine
import com.tonihk00.clearplay.ui.theme.Cp
import com.tonihk00.clearplay.ui.theme.LocalReduceMotion
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.max

/** Soft fade at the top and bottom edges (the desktop's lyrics mask). */
fun Modifier.edgeFade(top: Float = 0.12f, bottom: Float = 0.18f) = this
    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
    .drawWithContent {
        drawContent()
        drawRect(
            Brush.verticalGradient(
                0f to Color.Transparent, top to Color.Black, (1f - bottom) to Color.Black, 1f to Color.Transparent,
            ),
            blendMode = BlendMode.DstIn,
        )
    }

@Composable
fun LyricsView(lyrics: Lyrics, position: () -> Long, playing: Boolean, onSeek: (Long) -> Unit, modifier: Modifier = Modifier, songKey: Any? = null, fixedPositionMs: Long? = null) {
    if (lyrics.synced) {
        SyncedLyrics(lyrics.lines, position, playing, onSeek, modifier, songKey, fixedPositionMs)
    } else {
        Column(modifier.fillMaxSize().edgeFade().verticalScroll(rememberScrollState()).padding(vertical = 40.dp)) {
            lyrics.lines.forEach {
                Text(
                    it.text.ifBlank { " " },
                    style = MaterialTheme.typography.titleLarge.copy(fontSize = 21.sp, lineHeight = 30.sp),
                    color = Cp.TextSoft,
                )
            }
        }
    }
}

/**
 * Synced lyrics that glide, ported from the desktop SmoothLyrics: the whole column moves
 * with one transform and eases to the current line; the current line is full size and
 * bright, the others shrink and fade with distance. Dragging lets you look around; it eases
 * back after 2.5 s. Only transform and alpha animate.
 */
@Composable
fun SyncedLyrics(
    lines: List<LyricLine>,
    position: () -> Long,
    playing: Boolean,
    onSeek: (Long) -> Unit,
    modifier: Modifier = Modifier,
    songKey: Any? = null,
    fixedPositionMs: Long? = null,
) {
    val reduce = LocalReduceMotion.current
    var active by remember(lines) { mutableIntStateOf(fixedPositionMs?.let { activeLine(lines, it) } ?: -1) }
    LaunchedEffect(lines, playing, songKey, fixedPositionMs) {
        if (fixedPositionMs != null) return@LaunchedEffect
        active = activeLine(lines, position())
        while (playing && isActive) {
            delay(100) // like the desktop: 10 checks a second, re-render only on line change
            active = activeLine(lines, position())
        }
    }

    val tops = remember(lines) { mutableStateListOf<Float>().apply { repeat(lines.size) { add(0f) } } }
    val heights = remember(lines) { mutableStateListOf<Float>().apply { repeat(lines.size) { add(0f) } } }
    val offset = remember(lines) { Animatable(0f) }
    val manual = remember(lines) { Animatable(0f) }
    val scope = rememberCoroutineScope()
    var manualJob by remember { mutableStateOf<Job?>(null) }

    BoxWithConstraints(
        modifier.fillMaxSize().clipToBounds().edgeFade()
            .draggable(
                rememberDraggableState { d -> scope.launch { manual.snapTo(manual.value + d) } },
                Orientation.Vertical,
                onDragStopped = {
                    manualJob?.cancel()
                    manualJob = scope.launch {
                        delay(2500)
                        manual.animateTo(0f, tween(if (reduce) 0 else 260, easing = Cp.EaseOutSoft))
                    }
                },
            ),
    ) {
        val boxH = with(LocalDensity.current) { maxHeight.toPx() }
        val idx = max(0, active)
        val target = boxH * 0.40f - (tops.getOrElse(idx) { 0f } + heights.getOrElse(idx) { 0f } / 2f)
        LaunchedEffect(active, boxH, heights.getOrElse(idx) { 0f }) {
            manualJob?.cancel()
            manual.snapTo(0f)
            if (reduce || offset.value == 0f && active <= 0) offset.snapTo(target)
            else offset.animateTo(target, tween(1100, easing = Cp.EaseOutSoft))
        }
        Column(
            // Unbounded: every line keeps its real height even far below the visible area.
            Modifier.fillMaxWidth().wrapContentHeight(Alignment.Top, unbounded = true)
                .graphicsLayer { translationY = offset.value + manual.value },
        ) {
            lines.forEachIndexed { i, line ->
                val distance = if (active < 0) i + 1 else abs(i - active)
                val isActive = i == active
                val scale by animateFloatAsState(if (isActive) 1f else 0.84f, tween(if (reduce) 0 else 700, easing = Cp.EaseOutSoft), label = "ls")
                val alpha by animateFloatAsState(
                    if (isActive) 1f else max(0.18f, 0.42f - distance * 0.05f),
                    tween(if (reduce) 0 else 700, easing = Cp.EaseOutSoft),
                    label = "la",
                )
                Text(
                    line.text.ifBlank { "♪" },
                    style = MaterialTheme.typography.headlineSmall.copy(
                        fontSize = 27.sp, lineHeight = 33.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.02).em,
                    ),
                    color = Color.White,
                    modifier = Modifier
                        .fillMaxWidth()
                        .onPlaced { c ->
                            if (i < tops.size) {
                                tops[i] = c.positionInParent().y
                                heights[i] = c.size.height.toFloat()
                            }
                        }
                        .clickable(remember { MutableInteractionSource() }, null) { line.timeMs?.let(onSeek) }
                        .padding(vertical = 12.dp)
                        .graphicsLayer {
                            scaleX = scale; scaleY = scale
                            this.alpha = alpha
                            transformOrigin = TransformOrigin(0f, 0.5f)
                        },
                )
            }
            Spacer(Modifier.height(400.dp))
        }
    }
}

@Composable
fun NoLyrics(modifier: Modifier = Modifier, loading: Boolean) {
    Box(modifier.fillMaxSize().padding(24.dp)) {
        Text(
            if (loading) "" else "No lyrics for this song",
            style = MaterialTheme.typography.titleMedium,
            color = Cp.TextFaint,
        )
    }
}
