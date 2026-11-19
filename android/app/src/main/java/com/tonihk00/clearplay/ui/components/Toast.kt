package com.tonihk00.clearplay.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.ui.theme.Cp
import kotlinx.coroutines.delay

@Stable
class ToastState {
    var message by mutableStateOf<String?>(null)
        private set
    var visible by mutableStateOf(false)
        private set
    internal var serial by mutableIntStateOf(0)
        private set

    fun show(text: String) {
        message = text
        visible = true
        serial++
    }

    internal fun hide() { visible = false }
}

/** Small glass confirmation that rises above the player bar and fades after ~1.8 s. */
@Composable
fun ToastHost(state: ToastState, haze: dev.chrisbanes.haze.HazeState?, modifier: Modifier = Modifier) {
    LaunchedEffect(state.serial) {
        if (state.visible) {
            delay(1800)
            state.hide()
        }
    }
    AnimatedVisibility(
        state.visible,
        modifier,
        enter = fadeIn(tween(160)) + slideInVertically(tween(220, easing = Cp.EaseOutSoft)) { it / 2 } + scaleIn(tween(220, easing = Cp.EaseOutSoft), 0.92f),
        exit = fadeOut(tween(220)) + slideOutVertically(tween(220)) { it / 3 } + scaleOut(tween(220), 0.96f),
    ) {
        Row(
            Modifier.liveGlass(haze, CircleShape).padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CpIcon(R.drawable.ic_check, size = 16.dp, tint = Cp.TextStrong)
            Text(
                state.message.orEmpty(),
                style = MaterialTheme.typography.labelLarge,
                color = Cp.TextStrong,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
    }
}
