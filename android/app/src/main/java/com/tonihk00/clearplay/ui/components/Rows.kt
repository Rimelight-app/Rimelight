package com.tonihk00.clearplay.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.data.api.Album
import com.tonihk00.clearplay.data.api.Artist
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.ui.theme.Cp

fun formatDuration(seconds: Int): String {
    val s = seconds.coerceAtLeast(0)
    return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, (s % 3600) / 60, s % 60) else "%d:%02d".format(s / 60, s % 60)
}

fun formatLongDuration(seconds: Int): String {
    val m = seconds / 60
    return if (m >= 60) "${m / 60} h ${m % 60} min" else "$m min ${"%02d".format(seconds % 60)} s"
}

/**
 * A song row: cover (or track number), title, artist, duration, menu. The playing song's
 * title is full white and the row sits on a faint glass chip.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SongRow(
    song: Song,
    onClick: () -> Unit,
    onMenu: () -> Unit,
    modifier: Modifier = Modifier,
    playing: Boolean = false,
    showCover: Boolean = true,
    trackNumber: Int? = null,
) {
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (playing) Cp.Accent else androidx.compose.ui.graphics.Color.Transparent)
            .combinedClickable(onClick = onClick, onLongClick = onMenu)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when {
            showCover -> Cover(song.coverArt, Modifier.size(48.dp), RoundedCornerShape(10.dp), 120)
            else -> Text(
                (trackNumber ?: song.track)?.toString() ?: "",
                Modifier.widthIn(min = 28.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = if (playing) Cp.TextStrong else Cp.TextFaint,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                song.title,
                style = MaterialTheme.typography.titleMedium,
                color = if (playing) Cp.TextStrong else Cp.TextStrong.copy(alpha = 0.9f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                song.artist.orEmpty(),
                style = MaterialTheme.typography.bodyMedium,
                color = Cp.TextFaint,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (song.isStarred) {
            CpIcon(R.drawable.ic_heart_filled, size = 14.dp, tint = Cp.TextSoft)
            Spacer(Modifier.width(10.dp))
        }
        DownloadBadge(song.id)
        Text(formatDuration(song.duration), style = MaterialTheme.typography.bodySmall, color = Cp.TextFaint)
        IconButtonCp(R.drawable.ic_ellipsis_vertical, "More", onMenu, size = 36.dp, iconSize = 18.dp, tint = Cp.TextFaint)
    }
}

@Composable
fun AlbumCard(album: Album, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.clip(RoundedCornerShape(18.dp)).clickable(onClick = onClick).padding(4.dp)) {
        SquareCover(album.coverArt, shape = Cp.Shape)
        Spacer(Modifier.height(8.dp))
        Text(album.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
            listOfNotNull(album.artist, album.year?.toString()).joinToString(" · "),
            style = MaterialTheme.typography.bodySmall,
            color = Cp.TextFaint,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun ArtistRow(artist: Artist, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Cover(artist.coverArt, Modifier.size(48.dp), CircleShape, 120)
        Column(Modifier.weight(1f)) {
            Text(artist.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${artist.albumCount} album${if (artist.albumCount == 1) "" else "s"}",
                style = MaterialTheme.typography.bodyMedium,
                color = Cp.TextFaint,
            )
        }
        CpIcon(R.drawable.ic_chevron_right, size = 18.dp, tint = Cp.TextFaint)
    }
}

/** Plain list row for playlists / genres. */
@Composable
fun SimpleRow(title: String, subtitle: String, onClick: () -> Unit, modifier: Modifier = Modifier, coverArt: String? = null, icon: Int? = null) {
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (icon != null) {
            Box(Modifier.size(48.dp).glassPanel(RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
                CpIcon(icon, size = 20.dp, tint = Cp.TextSoft)
            }
        } else {
            Cover(coverArt, Modifier.size(48.dp), RoundedCornerShape(10.dp), 120)
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint, maxLines = 1)
        }
        CpIcon(R.drawable.ic_chevron_right, size = 18.dp, tint = Cp.TextFaint)
    }
}

/** Quiet marker in song rows: a check when downloaded, a thin progress ring while downloading. */
@Composable
fun DownloadBadge(songId: String, size: androidx.compose.ui.unit.Dp = 14.dp) {
    val st = com.tonihk00.clearplay.ui.LocalDownloadStates.current[songId] ?: return
    when {
        st.done -> CpIcon(R.drawable.ic_circle_check, size = size, tint = Cp.TextSoft)
        st.active -> androidx.compose.material3.CircularProgressIndicator(
            progress = { st.percent / 100f },
            modifier = Modifier.size(size),
            color = Cp.TextSoft,
            trackColor = Cp.Muted,
            strokeWidth = 1.5.dp,
        )
        else -> return
    }
    Spacer(Modifier.width(10.dp))
}
