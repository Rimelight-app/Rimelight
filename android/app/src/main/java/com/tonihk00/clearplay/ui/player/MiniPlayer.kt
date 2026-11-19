package com.tonihk00.clearplay.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.player.PlayerState
import com.tonihk00.clearplay.ui.LocalActions
import com.tonihk00.clearplay.ui.edited
import com.tonihk00.clearplay.ui.components.Cover
import com.tonihk00.clearplay.ui.components.IconButtonCp
import com.tonihk00.clearplay.ui.components.LikeButton
import com.tonihk00.clearplay.ui.components.PlayButton
import com.tonihk00.clearplay.ui.components.liveGlass
import com.tonihk00.clearplay.ui.theme.Cp
import dev.chrisbanes.haze.HazeInput
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.blur.HazeBlurStyle
import dev.chrisbanes.haze.blur.hazeBlur

private val MiniShape = RoundedCornerShape(20.dp)

/**
 * The one live blur in the app (Haze), like the desktop player bar: a small floating
 * glass card over the page content. Without a [haze] state it uses a solid glass fill.
 */
@Composable
fun MiniPlayer(state: PlayerState, controls: PlayerControls, onOpen: () -> Unit, haze: HazeState?, modifier: Modifier = Modifier) {
    val raw = state.current ?: return
    val song = raw.edited()
    val actions = LocalActions.current
    Box(
        modifier
            .fillMaxWidth()
            .liveGlass(haze, MiniShape)
            .clickable(remember { MutableInteractionSource() }, null, onClick = onOpen),
    ) {
        Column {
            Row(Modifier.padding(start = 8.dp, end = 8.dp, top = 8.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Cover(song.coverArt, Modifier.size(46.dp), RoundedCornerShape(12.dp), 150)
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Text(song.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(song.artist.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = Cp.TextSoft, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (!song.isLocal) LikeButton(song.isStarred, { actions.toggleLike(song) }, size = 40.dp, iconSize = 20.dp)
                Spacer(Modifier.width(2.dp))
                PlayButton(state.isPlaying, controls::togglePlay, size = 42.dp)
                IconButtonCp(R.drawable.ic_skip_forward_filled, "Next", controls::next, size = 42.dp, iconSize = 20.dp, tint = Cp.TextStrong)
            }
            MiniProgress(controls::position, state.durationMs, state.isPlaying, raw.id, Modifier.padding(horizontal = 14.dp).clip(RoundedCornerShape(1.dp)))
            Spacer(Modifier.size(6.dp))
        }
    }
}
