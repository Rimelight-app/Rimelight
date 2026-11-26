package com.tonihk00.clearplay.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.blur.hazeBlur
import com.tonihk00.clearplay.ui.theme.Cp

/** `.glass-panel`: faint white fill, hairline stroke, rounded 16 dp. */
fun Modifier.glassPanel(shape: Shape = Cp.Shape, strong: Boolean = false): Modifier =
    this.clip(shape)
        .background(if (strong) Cp.GlassFillStrong else Cp.GlassFill, shape)
        .border(1.dp, Cp.GlassStroke, shape)

/** Pressed controls dip slightly, like the desktop player bar buttons. */
@Composable
fun Modifier.pressScale(source: MutableInteractionSource, pressed: Float = 0.92f): Modifier {
    val isPressed by source.collectIsPressedAsState()
    val s by animateFloatAsState(if (isPressed) pressed else 1f, tween(150, easing = Cp.EaseOutSoft), label = "press")
    return graphicsLayer { scaleX = s; scaleY = s }
}

@Composable
fun CpIcon(@DrawableRes id: Int, modifier: Modifier = Modifier, size: Dp = 22.dp, tint: Color = Cp.TextStrong, contentDescription: String? = null) {
    Icon(painterResource(id), contentDescription, modifier.size(size), tint = tint)
}

/** Round icon button: quiet by default, white-tinted when [active]. */
@Composable
fun IconButtonCp(
    @DrawableRes icon: Int,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 44.dp,
    iconSize: Dp = 22.dp,
    active: Boolean = false,
    outlined: Boolean = false,
    tint: Color = if (active) Cp.TextStrong else Cp.TextSoft,
    enabled: Boolean = true,
) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current
    // Pressed: a soft white glow (quick in, slower out) so every tap visibly lands.
    val bg by animateColorAsState(
        when {
            pressed -> Color.White.copy(alpha = 0.22f)
            active -> Color.White.copy(alpha = 0.16f)
            else -> Color.Transparent
        },
        tween(if (pressed) 60 else 260),
        label = "bg",
    )
    Box(
        modifier
            .size(size)
            .pressScale(source, 0.88f)
            .clip(CircleShape)
            .background(bg)
            .then(if (outlined) Modifier.border(1.dp, Cp.GlassStroke, CircleShape) else Modifier)
            .clickable(source, null, enabled = enabled, role = Role.Button) {
                haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .then(if (enabled) Modifier else Modifier.graphicsLayer { alpha = 0.4f }),
        contentAlignment = Alignment.Center,
    ) {
        CpIcon(icon, size = iconSize, tint = tint, contentDescription = contentDescription)
    }
}

/** White pill button, like "Play" on the desktop album header. */
@Composable
fun PrimaryPill(text: String, @DrawableRes icon: Int?, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current
    val bg by animateColorAsState(if (pressed) Color(0xFFD4D4D8) else Cp.Primary, tween(if (pressed) 60 else 260), label = "pill")
    Row(
        modifier
            .pressScale(source, 0.94f)
            .clip(CircleShape)
            .background(bg)
            .clickable(source, null, role = Role.Button) {
                haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .padding(horizontal = 22.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (icon != null) CpIcon(icon, size = 18.dp, tint = Cp.OnPrimary)
        Text(text, style = MaterialTheme.typography.titleMedium, color = Cp.OnPrimary, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * The album's big Play pill, which turns into Pause while that album plays. Not playing, it is
 * exactly [PrimaryPill] ("Play" with the filled triangle); the icon and word cross-fade and the
 * pill eases to its new width when it switches.
 */
@Composable
fun PlayPausePill(playing: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val reduce = com.tonihk00.clearplay.ui.theme.LocalReduceMotion.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current
    val bg by animateColorAsState(if (pressed) Color(0xFFD4D4D8) else Cp.Primary, tween(if (pressed) 60 else 260), label = "pill")
    val ms = if (reduce) 0 else Cp.ControlMs
    Row(
        modifier
            .pressScale(source, 0.94f)
            .clip(CircleShape)
            .background(bg)
            .clickable(source, null, role = Role.Button) {
                haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .animateContentSize(tween(ms, easing = Cp.EaseOutSoft))
            .padding(horizontal = 22.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        androidx.compose.animation.Crossfade(playing, animationSpec = tween(ms), label = "pillIcon") { p ->
            CpIcon(if (p) com.tonihk00.clearplay.R.drawable.ic_pause_filled else com.tonihk00.clearplay.R.drawable.ic_play_filled, size = 18.dp, tint = Cp.OnPrimary)
        }
        androidx.compose.animation.Crossfade(playing, animationSpec = tween(ms), label = "pillText") { p ->
            Text(if (p) "Pause" else "Play", style = MaterialTheme.typography.titleMedium, color = Cp.OnPrimary, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** Small rounded metadata chip ("2024", "7 songs"). */
@Composable
fun MetaChip(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier
            .clip(CircleShape)
            .background(Cp.GlassFill)
            .border(1.dp, Cp.GlassStroke, CircleShape)
            .padding(horizontal = 12.dp, vertical = 5.dp),
        style = MaterialTheme.typography.labelMedium,
        color = Cp.TextSoft,
    )
}

/** The desktop's library tab pill: glass track, the selected tab sits on a lighter chip. */
@Composable
fun PillTabs(tabs: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val state = androidx.compose.foundation.lazy.rememberLazyListState()
    androidx.compose.runtime.LaunchedEffect(selected) { state.animateScrollToItem(maxOf(0, selected - 1)) }
    LazyRow(
        modifier,
        state = state,
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        itemsIndexed(tabs) { i, label ->
            val on = i == selected
            val bg by animateColorAsState(if (on) Color.White.copy(alpha = 0.14f) else Color.Transparent, tween(Cp.ControlMs), label = "tab")
            val fg by animateColorAsState(if (on) Cp.TextStrong else Cp.TextFaint, tween(Cp.ControlMs), label = "tabfg")
            Text(
                label,
                Modifier
                    .clip(CircleShape)
                    .background(bg)
                    .clickable(role = Role.Tab) { onSelect(i) }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                style = MaterialTheme.typography.titleSmall,
                color = fg,
            )
        }
    }
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(text.uppercase(), modifier, style = MaterialTheme.typography.labelSmall, color = Cp.TextFaint)
}

/**
 * Live frosted glass (Haze) over whatever scrolls behind: the mini player and the tab bar.
 * With [haze] null (blur turned off in Settings, or in tests) it is a solid dark glass.
 * [dim]: extra black under the tint (the sheets: text must stay readable over a white cover,
 * and with blur off nothing sharp may show through under it); 0 for the bars.
 */
fun Modifier.liveGlass(haze: dev.chrisbanes.haze.HazeState?, shape: Shape, dim: Float = 0f): Modifier =
    this.clip(shape)
        .then(
            if (haze != null) {
                Modifier.hazeBlur(
                    dev.chrisbanes.haze.HazeInput.Sources(haze),
                    dev.chrisbanes.haze.blur.HazeBlurStyle {
                        blurRadius(28.dp)
                        backgroundColor(Cp.Base)
                        noiseFactor(0f)
                    },
                )
            } else {
                Modifier
            },
        )
        .then(if (dim > 0f) Modifier.background(Color.Black.copy(alpha = dim)) else Modifier)
        .background(if (haze != null) Color(20, 20, 28).copy(alpha = 0.35f) else Color(20, 20, 28).copy(alpha = 0.72f))
        .background(if (haze != null) Cp.GlassFill else Cp.GlassFillStrong)
        .border(1.dp, Cp.GlassStroke, shape)
