package com.tonihk00.clearplay.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.lerp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.ui.theme.Cp
import com.tonihk00.clearplay.ui.theme.LocalReduceMotion

/**
 * Pause bars ↔ play triangle in one shape change (~180 ms), like the desktop.
 * Each bar morphs into one half of the triangle.
 */
@Composable
fun PlayPauseGlyph(playing: Boolean, modifier: Modifier = Modifier, color: Color = Cp.OnPrimary) {
    val reduce = LocalReduceMotion.current
    val t by animateFloatAsState(
        if (playing) 1f else 0f,
        if (reduce) tween(0) else tween(Cp.ControlMs, easing = Cp.EaseOutSoft),
        label = "playpause",
    )
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        // Play triangle (t = 0), slightly right of centre for optical balance.
        val left = w * 0.24f
        val right = w * 0.86f
        val top = h * 0.14f
        val bottom = h * 0.86f
        val midX = (left + right) / 2f
        val midY = h / 2f
        val yAtMid = (midX - left) / (right - left) * (midY - top) // triangle's top edge at midX
        // Pause bars (t = 1).
        val barW = w * 0.22f
        val gap = w * 0.16f
        val b1l = w / 2f - gap / 2f - barW
        val b2l = w / 2f + gap / 2f
        val bt = h * 0.16f
        val bb = h * 0.84f

        fun quad(x1: Float, y1: Float, x2: Float, y2: Float, x3: Float, y3: Float, x4: Float, y4: Float) = Path().apply {
            moveTo(x1, y1); lineTo(x2, y2); lineTo(x3, y3); lineTo(x4, y4); close()
        }
        val p1 = quad(
            lerp(left, b1l, t), lerp(top, bt, t),
            lerp(midX, b1l + barW, t), lerp(top + yAtMid, bt, t),
            lerp(midX, b1l + barW, t), lerp(bottom - yAtMid, bb, t),
            lerp(left, b1l, t), lerp(bottom, bb, t),
        )
        val p2 = quad(
            lerp(midX, b2l, t), lerp(top + yAtMid, bt, t),
            lerp(right, b2l + barW, t), lerp(midY, bt, t),
            lerp(right, b2l + barW, t), lerp(midY, bb, t),
            lerp(midX, b2l, t), lerp(bottom - yAtMid, bb, t),
        )
        val round = PathEffect.cornerPathEffect(w * 0.06f)
        for (p in listOf(p1, p2)) {
            drawPath(p, color, style = Fill)
            drawPath(p, color, style = Stroke(width = w * 0.06f, join = StrokeJoin.Round, pathEffect = round))
        }
    }
}

/** The white round play button. */
@Composable
fun PlayButton(playing: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, size: Dp = 64.dp) {
    val source = remember { MutableInteractionSource() }
    Box(
        modifier
            .size(size)
            .pressScale(source, 0.93f)
            .clip(CircleShape)
            .background(Cp.Primary)
            .clickable(source, null, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = if (playing) "Pause" else "Play" },
        contentAlignment = Alignment.Center,
    ) {
        PlayPauseGlyph(playing, Modifier.size(size * 0.38f))
    }
}

/** Quiet white 1–5 stars. Tapping the current value clears it. Filled stars pop. */
@Composable
fun StarRating(rating: Int, onRate: (Int) -> Unit, modifier: Modifier = Modifier, starSize: Dp = 18.dp) {
    val reduce = LocalReduceMotion.current
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
        for (i in 1..5) {
            val on = i <= rating
            val pop = remember { Animatable(1f) }
            LaunchedEffect(on) {
                if (on && !reduce) {
                    pop.snapTo(0.7f)
                    pop.animateTo(1f, tween(220, easing = Cp.EaseOutSoft))
                }
            }
            Box(
                Modifier
                    .size(starSize + 10.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button) { onRate(i) }
                    .semantics { contentDescription = "$i star${if (i > 1) "s" else ""}" },
                contentAlignment = Alignment.Center,
            ) {
                CpIcon(
                    if (on) R.drawable.ic_star_filled else R.drawable.ic_star,
                    Modifier.graphicsLayer { scaleX = pop.value; scaleY = pop.value },
                    size = starSize,
                    tint = if (on) Cp.TextStrong else Cp.TextFaint.copy(alpha = 0.35f),
                )
            }
        }
    }
}

/** Heart that pops when filled. */
@Composable
fun LikeButton(liked: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, size: Dp = 44.dp, iconSize: Dp = 22.dp) {
    val reduce = LocalReduceMotion.current
    val pop = remember { Animatable(1f) }
    LaunchedEffect(liked) {
        if (liked && !reduce) {
            pop.snapTo(0.7f)
            pop.animateTo(1f, tween(220, easing = Cp.EaseOutSoft))
        }
    }
    Box(modifier.graphicsLayer { scaleX = pop.value; scaleY = pop.value }) {
        IconButtonCp(
            if (liked) R.drawable.ic_heart_filled else R.drawable.ic_heart,
            if (liked) "Unlike" else "Like",
            onClick,
            size = size,
            iconSize = iconSize,
            tint = if (liked) Cp.TextStrong else Cp.TextSoft,
        )
    }
}
