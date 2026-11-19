package com.tonihk00.clearplay.ui.player

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.player.PlayerConnection
import com.tonihk00.clearplay.ui.components.CpIcon
import com.tonihk00.clearplay.ui.theme.Cp
import kotlinx.coroutines.delay

/** "Pauses in 23 min", "Pauses after this song", or null. */
@Composable
fun sleepLabel(sleep: PlayerConnection.Sleep?): String? {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(sleep) {
        while (sleep?.endsAtMs != null) {
            now = System.currentTimeMillis()
            delay(15_000)
        }
    }
    return when {
        sleep == null -> null
        sleep.endOfSong -> "Pauses after this song"
        else -> "Pauses in ${(((sleep.endsAtMs ?: now) - now) / 60_000 + 1).coerceAtLeast(1)} min"
    }
}

val SleepChoices = listOf(15, 30, 45, 60, 90)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SleepSheet(sleep: PlayerConnection.Sleep?, onSet: (Int?, Boolean) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Color(0xFF16161C).copy(alpha = 0.97f),
        scrimColor = Color.Black.copy(alpha = 0.45f),
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        dragHandle = null,
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
            Text("Sleep timer", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 22.dp, vertical = 8.dp))
            sleepLabel(sleep)?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = Cp.TextSoft, modifier = Modifier.padding(horizontal = 22.dp))
            }
            SleepChoices.forEach { m -> SleepRow("$m minutes") { onSet(m, false); onDismiss() } }
            SleepRow("End of this song") { onSet(null, true); onDismiss() }
            if (sleep != null) SleepRow("Turn off", R.drawable.ic_x) { onSet(null, false); onDismiss() }
        }
    }
}

@Composable
private fun SleepRow(label: String, icon: Int = R.drawable.ic_moon, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 22.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CpIcon(icon, size = 20.dp, tint = Cp.TextSoft)
        Text(label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 16.dp))
    }
}
