package com.tonihk00.clearplay.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.animation.animateColorAsState
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
) {
    val source = remember { MutableInteractionSource() }
    val bg by animateColorAsState(if (active) Color.White.copy(alpha = 0.16f) else Color.Transparent, tween(Cp.ControlMs), label = "bg")
    Box(
        modifier
            .size(size)
            .pressScale(source)
            .clip(CircleShape)
            .background(bg)
            .then(if (outlined) Modifier.border(1.dp, Cp.GlassStroke, CircleShape) else Modifier)
            .clickable(source, null, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        CpIcon(icon, size = iconSize, tint = tint, contentDescription = contentDescription)
    }
}

/** White pill button, like "Play" on the desktop album header. */
@Composable
fun PrimaryPill(text: String, @DrawableRes icon: Int?, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val source = remember { MutableInteractionSource() }
    Row(
        modifier
            .pressScale(source, 0.96f)
            .clip(CircleShape)
            .background(Cp.Primary)
            .clickable(source, null, role = Role.Button, onClick = onClick)
            .padding(horizontal = 22.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (icon != null) CpIcon(icon, size = 18.dp, tint = Cp.OnPrimary)
        Text(text, style = MaterialTheme.typography.titleMedium, color = Cp.OnPrimary, fontWeight = FontWeight.SemiBold)
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
