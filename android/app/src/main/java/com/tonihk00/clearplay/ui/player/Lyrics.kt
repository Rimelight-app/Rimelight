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
import com.tonihk00.clearplay.data.api.msUntilNextLine
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.FrameRateCategory
import androidx.compose.ui.preferredFrameRate
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
 * Synced lyrics that glide, ported from the desktop SmoothLyrics. One animated value (the
 * current line as a float) drives everything: the column's offset, each line's size and
 * brightness, and the soft fade at the edges. All of it is read at draw time, so a line
 * change never recomposes or re-measures text; no offscreen mask either. Dragging lets you
 * look around; it eases back after 2.5 s.
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
    val n = lines.size
    var active by remember(lines) { mutableIntStateOf(fixedPositionMs?.let { activeLine(lines, it) } ?: -1) }
    // True shortly before a line change: frames start flowing early (see below).
    var warm by remember(lines) { mutableStateOf(false) }
    LaunchedEffect(lines, playing, songKey, fixedPositionMs) {
        warm = false
        if (fixedPositionMs != null) return@LaunchedEffect
        active = activeLine(lines, position())
        while (playing && isActive) {
            delay(100) // like the desktop: 10 checks a second; only a line change does anything
            val pos = position()
            active = activeLine(lines, pos)
            warm = !reduce && (msUntilNextLine(lines, pos) ?: Long.MAX_VALUE) in 0..WARM_UP_MS
        }
        warm = false
    }

    // Line geometry, filled in at placement. The version counter is what drawing observes, so
    // the layers redraw once when measurements arrive or change (and never recompose).
    val tops = remember(lines) { FloatArray(n) }
    val heights = remember(lines) { FloatArray(n) }
    var geometry by remember(lines) { mutableIntStateOf(0) }
    val anim = remember(lines) { Animatable(active.coerceAtLeast(0).toFloat()) }
    val manual = remember(lines) { Animatable(0f) }
    val scope = rememberCoroutineScope()
    var manualJob by remember { mutableStateOf<Job?>(null) }

    // Smoothness on phones with adaptive refresh rate (Samsung LTPO and others): while the
    // lyrics sit still, the only thing drawing is the seek bar, 4 times a second, so the screen
    // drops to a low refresh rate, and a glide that starts there stutters until it speeds up
    // again. A screen recording pins the rate, which is why it never showed in recordings.
    // So while synced lyrics are on screen and playing, the window asks for the screen's top
    // refresh rate (released when you leave the lyrics or pause).
    HighRefreshRate(playing && fixedPositionMs == null)
    // Second safeguard, for phones that don't honour that request: ~[WARM_UP_MS] before each
    // line change the lyrics draw every frame (the text moves by 0.02 px, invisible), so the
    // system's own "content is moving" detection has already sped the screen up when the glide
    // starts. preferredFrameRate below also votes for the high rate wherever that is supported.
    val tick = remember { mutableIntStateOf(0) }
    LaunchedEffect(warm) {
        if (warm) while (isActive) withFrameNanos { tick.intValue++ }
    }

    LaunchedEffect(active) {
        manualJob?.cancel()
        manual.snapTo(0f)
        val target = active.coerceAtLeast(0).toFloat()
        if (reduce) anim.snapTo(target) else anim.animateTo(target, tween(900, easing = Cp.EaseOutSoft))
    }

    fun centerOf(f: Float): Float {
        if (n == 0) return 0f
        val i = f.toInt().coerceIn(0, n - 1)
        val j = (i + 1).coerceAtMost(n - 1)
        val t = (f - i).coerceIn(0f, 1f)
        val ci = tops[i] + heights[i] / 2f
        val cj = tops[j] + heights[j] / 2f
        return ci + (cj - ci) * t
    }

    BoxWithConstraints(
        modifier.fillMaxSize().clipToBounds()
            .preferredFrameRate(FrameRateCategory.High)
            .draggable(
                rememberDraggableState { d -> scope.launch { manual.snapTo(manual.value + d) } },
                Orientation.Vertical,
                onDragStopped = {
                    manualJob?.cancel()
                    manualJob = scope.launch {
                        delay(2500)
                        manual.animateTo(0f, tween(if (reduce) 0 else 300, easing = Cp.EaseOutSoft))
                    }
                },
            ),
    ) {
        val boxH = with(LocalDensity.current) { maxHeight.toPx() }
        val anchor = boxH * 0.30f
        Column(
            // Unbounded: every line keeps its real height even far below the visible area.
            Modifier.fillMaxWidth().wrapContentHeight(Alignment.Top, unbounded = true)
                .graphicsLayer {
                    @Suppress("UNUSED_VARIABLE") val g = geometry
                    val nudge = if (tick.intValue % 2 == 0) 0f else 0.02f
                    translationY = anchor - centerOf(anim.value) + manual.value + nudge
                },
        ) {
            lines.forEachIndexed { i, line ->
                Text(
                    line.text.ifBlank { "♪" },
                    style = MaterialTheme.typography.headlineSmall.copy(
                        fontSize = 27.sp, lineHeight = 33.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.02).em,
                    ),
                    color = Color.White,
                    modifier = Modifier
                        .fillMaxWidth()
                        .onPlaced { c ->
                            val y = c.positionInParent().y
                            val h = c.size.height.toFloat()
                            if (tops[i] != y || heights[i] != h) {
                                tops[i] = y
                                heights[i] = h
                                geometry++
                            }
                        }
                        .clickable(remember { MutableInteractionSource() }, null) { line.timeMs?.let(onSeek) }
                        .padding(vertical = 12.dp)
                        .graphicsLayer {
                            @Suppress("UNUSED_VARIABLE") val g = geometry
                            val a = anim.value
                            val d = abs(i - a)
                            val near = d.coerceAtMost(1f)
                            val s = 1f - 0.16f * near
                            scaleX = s; scaleY = s
                            transformOrigin = TransformOrigin(0f, 0.5f)
                            val far = max(0.18f, 0.42f - d * 0.05f)
                            var alphaNow = 1f + (far - 1f) * near
                            // Soft fade near the top and bottom edges (replaces the offscreen mask).
                            val y = anchor - centerOf(a) + manual.value + tops[i] + heights[i] / 2f
                            val top = boxH * 0.12f
                            val bottom = boxH * 0.82f
                            if (y < top) alphaNow *= (y / top).coerceIn(0f, 1f)
                            if (y > bottom) alphaNow *= ((boxH - y) / (boxH - bottom)).coerceIn(0f, 1f)
                            alpha = alphaNow
                        },
                )
            }
            Spacer(Modifier.height(400.dp))
        }
    }
}

/**
 * While [on], asks for the display's highest-refresh-rate mode (same resolution) and, on
 * Android 15+, tells the system not to lower the rate to save power for this window.
 */
@Composable
fun HighRefreshRate(on: Boolean) {
    val view = androidx.compose.ui.platform.LocalView.current
    androidx.compose.runtime.DisposableEffect(on, view) {
        val window = view.context.findActivity()?.window
        val display = view.display
        if (!on || window == null || display == null) return@DisposableEffect onDispose {}
        val now = display.mode
        val top = display.supportedModes
            .filter { it.physicalWidth == now.physicalWidth && it.physicalHeight == now.physicalHeight }
            .maxByOrNull { it.refreshRate } ?: return@DisposableEffect onDispose {}
        window.attributes = window.attributes.apply {
            preferredDisplayModeId = top.modeId
            preferredRefreshRate = top.refreshRate
            if (android.os.Build.VERSION.SDK_INT >= 35) setFrameRatePowerSavingsBalanced(false)
        }
        onDispose {
            window.attributes = window.attributes.apply {
                preferredDisplayModeId = 0
                preferredRefreshRate = 0f
                if (android.os.Build.VERSION.SDK_INT >= 35) setFrameRatePowerSavingsBalanced(true)
            }
        }
    }
}

private tailrec fun android.content.Context.findActivity(): android.app.Activity? = when (this) {
    is android.app.Activity -> this
    is android.content.ContextWrapper -> baseContext.findActivity()
    else -> null
}

/** How long before a line change the lyrics start drawing every frame (see SyncedLyrics). */
private const val WARM_UP_MS = 350L

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
