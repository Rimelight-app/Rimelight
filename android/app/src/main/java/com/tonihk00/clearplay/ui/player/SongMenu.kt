package com.tonihk00.clearplay.ui.player

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.ui.LocalActions
import com.tonihk00.clearplay.ui.edited
import com.tonihk00.clearplay.ui.components.Cover
import com.tonihk00.clearplay.ui.components.CpIcon
import com.tonihk00.clearplay.ui.components.StarRating
import com.tonihk00.clearplay.ui.theme.Cp

/** Long-press / ⋯ menu for a song: queue actions, like, 1–5 stars, go to album/artist. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SongMenu(song: Song, onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Color(0xFF16161C).copy(alpha = 0.97f),
        scrimColor = Color.Black.copy(alpha = 0.45f),
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        dragHandle = null,
    ) {
        SongMenuContent(song, onDismiss)
    }
}

@Composable
fun SongMenuContent(raw: Song, onDismiss: () -> Unit) {
    val song = raw.edited()
    val actions = LocalActions.current
    Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
        Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Cover(song.coverArt, Modifier.size(52.dp), RoundedCornerShape(12.dp), 150)
            Column(Modifier.weight(1f).padding(start = 14.dp)) {
                Text(song.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    listOfNotNull(song.artist, song.album).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
        StarRating(song.userRating, { actions.rate(song, it) }, Modifier.padding(start = 14.dp, top = 4.dp, bottom = 6.dp), starSize = 20.dp)
        HorizontalDivider(color = Cp.Border, modifier = Modifier.padding(vertical = 6.dp))
        MenuItem(R.drawable.ic_list_start, "Play next") { actions.playNext(listOf(raw)); onDismiss() }
        MenuItem(R.drawable.ic_list_plus, "Add to queue") { actions.addToQueue(listOf(raw)); onDismiss() }
        MenuItem(if (song.isStarred) R.drawable.ic_heart_filled else R.drawable.ic_heart, if (song.isStarred) "Remove from favourites" else "Add to favourites") {
            actions.toggleLike(song)
        }
        val dl = com.tonihk00.clearplay.ui.LocalDownloadStates.current[raw.id]
        when {
            dl?.done == true -> MenuItem(R.drawable.ic_circle_check, "Remove download") { actions.removeDownload(listOf(raw)); onDismiss() }
            dl?.active == true -> MenuItem(R.drawable.ic_download, "Downloading… ${dl.percent.toInt()}%") {}
            else -> MenuItem(R.drawable.ic_download, "Download") { actions.download(listOf(raw)); onDismiss() }
        }
        song.albumId?.let { id -> MenuItem(R.drawable.ic_disc_3, "Go to album") { onDismiss(); actions.openAlbum(id) } }
        song.artistId?.let { id -> MenuItem(R.drawable.ic_user, "Go to artist") { onDismiss(); actions.openArtist(id) } }
        Spacer(Modifier.height(4.dp))
    }
}

@Composable
private fun MenuItem(icon: Int, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 22.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CpIcon(icon, size = 20.dp, tint = Cp.TextSoft)
        Text(label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 16.dp))
    }
}
