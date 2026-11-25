package com.tonihk00.clearplay.ui.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.player.Handoff
import com.tonihk00.clearplay.player.QueueHandoff
import com.tonihk00.clearplay.ui.components.IconButtonCp
import com.tonihk00.clearplay.ui.components.liveGlass
import com.tonihk00.clearplay.ui.theme.Cp
import com.tonihk00.clearplay.ui.theme.LocalReduceMotion
import dev.chrisbanes.haze.HazeState
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** What the pill above the mini player says, and its button. */
data class HandoffPillText(val text: String, val button: String)

/** "just now", "5 min ago", "2 h ago", "yesterday", or the date ("24 Nov"; "24 Nov 2025" in another year). */
fun ageLabel(age: QueueHandoff.Age, nowMs: Long, zone: ZoneId = ZoneId.systemDefault()): String = when (age) {
    QueueHandoff.Age.JustNow -> "just now"
    is QueueHandoff.Age.Minutes -> "${age.count} min ago"
    is QueueHandoff.Age.Hours -> "${age.count} h ago"
    QueueHandoff.Age.Yesterday -> "yesterday"
    is QueueHandoff.Age.Date -> {
        val ms = QueueHandoff.instant(age.changed) ?: nowMs
        val date = Instant.ofEpochMilli(ms).atZone(zone)
        val sameYear = date.year == Instant.ofEpochMilli(nowMs).atZone(zone).year
        date.format(DateTimeFormatter.ofPattern(if (sameYear) "d MMM" else "d MMM yyyy", Locale.ENGLISH))
    }
}

/**
 * The Continue offer's words (the same in ClearPlay desktop 0.6.0). `<song>` is always the song
 * Continue starts; `<age>` is this phone's clock minus the server's `changed`, for display only.
 */
fun offerText(offer: QueueHandoff.Offer<com.tonihk00.clearplay.data.api.Song>, nowMs: Long): HandoffPillText {
    val song = offer.song.title.ifBlank { "a song" }
    val age = ageLabel(QueueHandoff.ageText(offer.changed, nowMs), nowMs)
    return when (offer.kind) {
        QueueHandoff.Kind.playing -> HandoffPillText("Playing on ${offer.device} · $song", "Continue here")
        QueueHandoff.Kind.paused -> HandoffPillText("Paused on ${offer.device} · $song · $age", "Continue")
        QueueHandoff.Kind.saved -> HandoffPillText("Saved by ${offer.device} · $song · $age", "Continue")
    }
}

fun leftBehindText(device: String) = HandoffPillText("Continued on $device", "Pause here")

/** The glass pill: text, a white button, and ×. Stays until acted on. */
@Composable
fun HandoffPill(text: HandoffPillText, onAction: () -> Unit, onDismiss: () -> Unit, haze: HazeState?, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().liveGlass(haze, RoundedCornerShape(20.dp)).padding(start = 16.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text.text,
            style = MaterialTheme.typography.bodyMedium,
            color = Cp.TextStrong,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).padding(end = 10.dp),
        )
        Text(
            text.button,
            Modifier.clip(CircleShape).background(Cp.Primary).clickable(role = Role.Button, onClick = onAction)
                .padding(horizontal = 14.dp, vertical = 8.dp),
            style = MaterialTheme.typography.labelLarge,
            color = Cp.OnPrimary,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
        IconButtonCp(R.drawable.ic_x, "Dismiss", onDismiss, size = 40.dp, iconSize = 18.dp)
    }
}

/**
 * The Continue offer ("Playing on / Paused on / Saved by …") or "Continued on <device>", above
 * the mini player, wired to [handoff]. Ages refresh every 30 s while shown.
 */
@Composable
fun HandoffPills(handoff: Handoff, haze: HazeState?, onError: (String) -> Unit, modifier: Modifier = Modifier) {
    val offer by handoff.offer.collectAsState()
    val left by handoff.leftBehind.collectAsState()
    val scope = rememberCoroutineScope()
    val reduce = LocalReduceMotion.current
    val now by produceState(System.currentTimeMillis(), offer) {
        while (true) { value = System.currentTimeMillis(); delay(30_000) }
    }
    val shown: HandoffPillText? = when {
        left != null -> leftBehindText(left!!.device)
        offer != null -> offerText(offer!!.offer, now)
        else -> null
    }
    // The last words stay on the pill while it animates away.
    val lastText = androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(shown) }
    if (shown != null) lastText.value = shown
    AnimatedVisibility(
        shown != null,
        modifier,
        enter = fadeIn(tween(if (reduce) 0 else 180)) + slideInVertically(tween(if (reduce) 0 else 240, easing = Cp.EaseOutSoft)) { it / 2 },
        exit = fadeOut(tween(if (reduce) 0 else 180)) + slideOutVertically(tween(if (reduce) 0 else 200)) { it / 3 },
    ) {
        val last = lastText.value ?: return@AnimatedVisibility
        if (left != null) {
            HandoffPill(last, onAction = { handoff.pauseHere() }, onDismiss = { handoff.closeLeftBehind() }, haze = haze)
        } else {
            HandoffPill(
                last,
                onAction = { scope.launch { if (!handoff.continueOffer()) onError("Couldn't continue") } },
                onDismiss = { handoff.dismissOffer() },
                haze = haze,
            )
        }
    }
}
