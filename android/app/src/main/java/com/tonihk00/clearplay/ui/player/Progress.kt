package com.tonihk00.clearplay.ui.player

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.ui.components.formatDuration
import com.tonihk00.clearplay.ui.theme.Cp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

/**
 * Polls the player position only while it is shown and playing, so nothing else
 * recomposes on progress ticks (the desktop's old player-bar bug).
 */
@Composable
fun rememberPosition(position: () -> Long, playing: Boolean, key: Any?, intervalMs: Long = 250): Long {
    var pos by remember(key) { mutableLongStateOf(position()) }
    LaunchedEffect(playing, key) {
        pos = position()
        while (playing && isActive) {
            delay(intervalMs)
            pos = position()
        }
    }
    return pos
}

/** Thin white track with a grab-to-seek area, elapsed and total time underneath. */
@Composable
fun SeekBar(position: () -> Long, durationMs: Long, playing: Boolean, songKey: Any?, onSeek: (Long) -> Unit, modifier: Modifier = Modifier) {
    val pos = rememberPosition(position, playing, songKey)
    var dragging by remember { mutableStateOf(false) }
    var dragFrac by remember { mutableFloatStateOf(0f) }
    val frac = if (dragging) dragFrac else if (durationMs > 0) (pos.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
    val thickness by animateDpAsState(if (dragging) 6.dp else 4.dp, tween(Cp.ControlMs), label = "thick")

    Column(modifier) {
        Box(
            Modifier.fillMaxWidth().height(24.dp)
                .pointerInput(durationMs) {
                    detectTapGestures { o -> if (durationMs > 0) onSeek((o.x / size.width * durationMs).toLong()) }
                }
                .pointerInput(durationMs) {
                    detectHorizontalDragGestures(
                        onDragStart = { o -> dragging = true; dragFrac = (o.x / size.width).coerceIn(0f, 1f) },
                        onDragEnd = { dragging = false; if (durationMs > 0) onSeek((dragFrac * durationMs).toLong()) },
                        onDragCancel = { dragging = false },
                    ) { change, _ -> dragFrac = (change.position.x / size.width).coerceIn(0f, 1f) }
                },
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.fillMaxWidth().height(thickness)) {
                val r = CornerRadius(size.height / 2)
                drawRoundRect(Color.White.copy(alpha = 0.22f), cornerRadius = r)
                drawRoundRect(Color.White, size = Size(size.width * frac, size.height), cornerRadius = r)
                if (dragging) drawCircle(Color.White, size.height * 1.4f, Offset(size.width * frac, size.height / 2))
            }
        }
        Row(Modifier.fillMaxWidth()) {
            val shown = if (dragging) (dragFrac * durationMs).toLong() else pos
            Text(formatDuration((shown / 1000).toInt()), style = MaterialTheme.typography.labelMedium, color = Cp.TextFaint, modifier = Modifier.weight(1f))
            Text(formatDuration((durationMs / 1000).toInt()), style = MaterialTheme.typography.labelMedium, color = Cp.TextFaint)
        }
    }
}

/** Hairline progress for the mini player. */
@Composable
fun MiniProgress(position: () -> Long, durationMs: Long, playing: Boolean, songKey: Any?, modifier: Modifier = Modifier) {
    val pos = rememberPosition(position, playing, songKey, intervalMs = 1000)
    val frac = if (durationMs > 0) (pos.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
    Canvas(modifier.fillMaxWidth().height(2.dp)) {
        drawRect(Color.White.copy(alpha = 0.12f))
        drawRect(Color.White.copy(alpha = 0.85f), size = Size(size.width * frac, size.height))
    }
}
