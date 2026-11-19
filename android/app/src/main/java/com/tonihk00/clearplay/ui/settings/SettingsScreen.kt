package com.tonihk00.clearplay.ui.settings

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.data.Backdrop
import com.tonihk00.clearplay.data.Settings
import com.tonihk00.clearplay.data.StreamFormat
import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.player.PlayerConnection
import com.tonihk00.clearplay.ui.components.CpIcon
import com.tonihk00.clearplay.ui.components.IconButtonCp
import com.tonihk00.clearplay.ui.components.Logo
import com.tonihk00.clearplay.ui.components.SectionLabel
import com.tonihk00.clearplay.ui.components.glassPanel
import com.tonihk00.clearplay.ui.player.SleepSheet
import com.tonihk00.clearplay.ui.player.sleepLabel
import com.tonihk00.clearplay.ui.theme.Cp

/** Everything the settings page shows; built by the app, faked in screenshot tests. */
data class SettingsUi(
    val servers: List<ServerConfig> = emptyList(),
    val active: ServerConfig? = null,
    /** Round-trip time per server URL in ms; null while measuring, -1 when unreachable. */
    val latency: Map<String, Long?> = emptyMap(),
    val settings: Settings = Settings(),
    val downloadCount: Int = 0,
    val downloadBytes: Long = 0,
    val imageCacheBytes: Long = 0,
    val sleep: PlayerConnection.Sleep? = null,
    val version: String = "",
    /** Songs found on the phone, or null without permission. */
    val phoneSongs: Int? = null,
    /** Signed in with "Use music on this phone" (no server). */
    val localMode: Boolean = false,
)

interface SettingsActions {
    fun switchServer(s: ServerConfig) {}
    fun removeServer(s: ServerConfig) {}
    fun addServer() {}
    fun signOut() {}
    fun update(change: (Settings) -> Settings) {}
    fun removeAllDownloads() {}
    fun clearImageCache() {}
    fun setSleep(minutes: Int?, endOfSong: Boolean) {}
    fun phoneMusic(on: Boolean) {}
}

private val Bitrates = listOf(0, 320, 256, 192, 128, 96)
private fun bitrateLabel(b: Int) = if (b == 0) "Original" else "$b"

fun formatBytes(b: Long): String = when {
    b >= 1L shl 30 -> "%.1f GB".format(b / (1L shl 30).toDouble())
    b >= 1L shl 20 -> "%.0f MB".format(b / (1L shl 20).toDouble())
    b > 0 -> "%.0f KB".format(b / 1024.0)
    else -> "0 MB"
}

@Composable
fun SettingsScreen(ui: SettingsUi, actions: SettingsActions, bottomPadding: Dp) {
    var confirmRemoveAll by remember { mutableStateOf(false) }
    var confirmSignOut by remember { mutableStateOf(false) }
    var sleepSheet by remember { mutableStateOf(false) }
    val s = ui.settings

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .statusBarsPadding().padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = bottomPadding + 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Settings", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(start = 4.dp, bottom = 6.dp))

        // Servers ---------------------------------------------------------------
        Group("Servers", if (ui.localMode) "Playing music on this phone. Connect a server for your whole library." else "Your Navidrome addresses. Tap one to switch.") {
            ui.servers.forEach { srv ->
                val isActive = ui.active?.let { it.baseUrl == srv.baseUrl && it.user == srv.user } == true
                Row(
                    Modifier.fillMaxWidth().clickable(enabled = !isActive) { actions.switchServer(srv) }.padding(start = 16.dp, end = 6.dp, top = 10.dp, bottom = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CpIcon(R.drawable.ic_server, size = 20.dp, tint = if (isActive) Cp.TextStrong else Cp.TextFaint)
                    Column(Modifier.weight(1f).padding(start = 14.dp)) {
                        Text(srv.baseUrl.removePrefix("http://").removePrefix("https://"), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val lat = ui.latency[srv.baseUrl]
                        val latText = when {
                            !ui.latency.containsKey(srv.baseUrl) -> ""
                            lat == null -> " · checking…"
                            lat < 0 -> " · unreachable"
                            else -> " · $lat ms"
                        }
                        Text(srv.user + latText, style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint)
                    }
                    if (isActive) {
                        Text("In use", style = MaterialTheme.typography.labelMedium, color = Cp.TextSoft, modifier = Modifier.padding(end = 10.dp))
                    } else {
                        IconButtonCp(R.drawable.ic_x, "Remove server", { actions.removeServer(srv) }, size = 36.dp, iconSize = 16.dp, tint = Cp.TextFaint)
                    }
                }
                Divider()
            }
            ActionRow(R.drawable.ic_plus, "Add a server", "Home, Tailscale or a friend's") { actions.addServer() }
            Divider()
            if (ui.localMode) {
                ActionRow(R.drawable.ic_x, "Back to sign-in", "Leave phone-only mode") { actions.signOut() }
            } else {
                ActionRow(R.drawable.ic_x, "Sign out", ui.active?.let { "${it.user} on ${it.baseUrl.removePrefix("http://").removePrefix("https://")}" }) { confirmSignOut = true }
            }
        }

        // Library ---------------------------------------------------------------
        Group("Library", "Used when the server can't be reached, or without a server.") {
            SwitchRow(
                R.drawable.ic_smartphone, "Music on this phone",
                when (ui.phoneSongs) {
                    null -> "Allow access to show your phone's music"
                    else -> "${ui.phoneSongs} song${if (ui.phoneSongs == 1) "" else "s"} found"
                },
                s.phoneMusic && ui.phoneSongs != null,
            ) { actions.phoneMusic(it) }
        }

        // Streaming -------------------------------------------------------------
        Group("Streaming", "Cap the bitrate to save mobile data. Only songs above the cap are converted.") {
            ChoiceRow(R.drawable.ic_wifi, "On Wi-Fi", Bitrates, s.wifiBitrate, ::bitrateLabel) { b -> actions.update { it.copy(wifiBitrate = b) } }
            Divider()
            ChoiceRow(R.drawable.ic_signal, "On mobile data", Bitrates, s.mobileBitrate, ::bitrateLabel) { b -> actions.update { it.copy(mobileBitrate = b) } }
            if (s.wifiBitrate > 0 || s.mobileBitrate > 0 || s.downloadBitrate > 0) {
                Divider()
                ChoiceRow(R.drawable.ic_sliders_horizontal, "Convert to", StreamFormat.entries, s.format, { it.label }) { f -> actions.update { it.copy(format = f) } }
            }
        }

        // Downloads -------------------------------------------------------------
        Group("Downloads", "Songs you download play without a connection.") {
            ChoiceRow(R.drawable.ic_download, "Download quality", Bitrates, s.downloadBitrate, ::bitrateLabel) { b -> actions.update { it.copy(downloadBitrate = b) } }
            Divider()
            SwitchRow(R.drawable.ic_wifi, "Download on Wi-Fi only", "Waits for Wi-Fi before downloading", s.downloadWifiOnly) { v -> actions.update { it.copy(downloadWifiOnly = v) } }
            Divider()
            InfoRow(R.drawable.ic_hard_drive, "Storage used", "${ui.downloadCount} song${if (ui.downloadCount == 1) "" else "s"} · ${formatBytes(ui.downloadBytes)}")
            if (ui.downloadCount > 0) {
                Divider()
                ActionRow(R.drawable.ic_trash_2, "Remove all downloads", null, danger = true) { confirmRemoveAll = true }
            }
        }

        // Player ----------------------------------------------------------------
        Group("Player", null) {
            ActionRow(R.drawable.ic_moon, "Sleep timer", sleepLabel(ui.sleep) ?: "Off") { sleepSheet = true }
            Divider()
            SwitchRow(R.drawable.ic_activity, "Scrobble plays", "Send plays to Navidrome (and on to Last.fm or ListenBrainz)", s.scrobble) { v -> actions.update { it.copy(scrobble = v) } }
        }

        // Appearance ------------------------------------------------------------
        Group("Appearance", null) {
            ChoiceRow(R.drawable.ic_palette, "Background", Backdrop.entries, s.backdrop, { it.label }) { b -> actions.update { it.copy(backdrop = b) } }
            Divider()
            SwitchRow(R.drawable.ic_sparkles, "Live glass blur", "Frosted mini player and tab bar. Turn off on slower phones.", s.liveBlur) { v -> actions.update { it.copy(liveBlur = v) } }
        }

        // Storage ---------------------------------------------------------------
        Group("Storage", null) {
            Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 10.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                CpIcon(R.drawable.ic_image, size = 20.dp, tint = Cp.TextSoft)
                Column(Modifier.weight(1f).padding(start = 14.dp)) {
                    Text("Cover cache", style = MaterialTheme.typography.titleMedium)
                    Text(formatBytes(ui.imageCacheBytes), style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint)
                }
                SmallButton("Clear") { actions.clearImageCache() }
            }
        }

        // About -----------------------------------------------------------------
        SectionLabel("About", Modifier.padding(start = 4.dp, top = 8.dp))
        Row(Modifier.fillMaxWidth().glassPanel().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Logo(Modifier.size(36.dp))
            Column(Modifier.padding(start = 14.dp)) {
                Text("ClearPlay", style = MaterialTheme.typography.titleMedium)
                Text("Version ${ui.version} · MIT licence · github.com/tonihk00/ClearPlay", style = MaterialTheme.typography.bodySmall, color = Cp.TextFaint)
            }
        }
    }

    if (sleepSheet) SleepSheet(ui.sleep, actions::setSleep) { sleepSheet = false }
    if (confirmRemoveAll) {
        Confirm("Remove all downloads?", "${ui.downloadCount} songs (${formatBytes(ui.downloadBytes)}) will be deleted from this phone. They stay on your server.", "Remove") {
            if (it) actions.removeAllDownloads()
            confirmRemoveAll = false
        }
    }
    if (confirmSignOut) {
        Confirm("Sign out?", "This server is removed from the app and the queue stops. Downloads stay.", "Sign out") {
            if (it) actions.signOut()
            confirmSignOut = false
        }
    }
}

@Composable
private fun Group(title: String, description: String?, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.padding(top = 8.dp)) {
        SectionLabel(title, Modifier.padding(start = 4.dp))
        if (description != null) {
            Text(description, style = MaterialTheme.typography.bodySmall, color = Cp.TextFaint, modifier = Modifier.padding(start = 4.dp, top = 4.dp, end = 4.dp))
        }
        Spacer(Modifier.height(8.dp))
        Column(Modifier.fillMaxWidth().glassPanel(), content = content)
    }
}

@Composable
private fun Divider() = HorizontalDivider(color = Cp.Border, modifier = Modifier.padding(start = 50.dp))

@Composable
private fun ActionRow(icon: Int, title: String, subtitle: String?, danger: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CpIcon(icon, size = 20.dp, tint = if (danger) Cp.Destructive.copy(alpha = 0.9f) else Cp.TextSoft)
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = if (danger) Cp.Destructive.copy(alpha = 0.95f) else Cp.TextStrong)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun InfoRow(icon: Int, title: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        CpIcon(icon, size = 20.dp, tint = Cp.TextSoft)
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f).padding(start = 14.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint)
    }
}

@Composable
private fun SwitchRow(icon: Int, title: String, subtitle: String?, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().toggleable(value = checked, role = Role.Switch) { onChange(it) }.padding(start = 16.dp, end = 14.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CpIcon(icon, size = 20.dp, tint = Cp.TextSoft)
        Column(Modifier.weight(1f).padding(start = 14.dp, end = 12.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint)
        }
        GlassSwitch(checked)
    }
}

/** The desktop switch: white track when on, faint glass track with a white thumb when off. */
@Composable
fun GlassSwitch(checked: Boolean) {
    val track by animateColorAsState(if (checked) Cp.Primary else Color.White.copy(alpha = 0.14f), tween(Cp.ControlMs), label = "track")
    val thumb by animateColorAsState(if (checked) Cp.OnPrimary else Color.White, tween(Cp.ControlMs), label = "thumb")
    val x by animateDpAsState(if (checked) 20.dp else 0.dp, tween(Cp.ControlMs, easing = Cp.EaseOutSoft), label = "x")
    Box(Modifier.size(width = 46.dp, height = 26.dp).clip(CircleShape).background(track).border(1.dp, Cp.GlassStroke, CircleShape).padding(3.dp)) {
        Box(Modifier.offset(x = x).size(20.dp).clip(CircleShape).background(thumb))
    }
}

/** Title with a row of pill choices underneath (selected = white pill). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun <T> ChoiceRow(icon: Int, title: String, options: List<T>, selected: T, label: (T) -> String, onSelect: (T) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CpIcon(icon, size = 20.dp, tint = Cp.TextSoft)
            Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 14.dp))
        }
        Spacer(Modifier.height(10.dp))
        FlowRow(Modifier.padding(start = 34.dp), horizontalArrangement = Arrangement.spacedBy(5.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            options.forEach { o ->
                val on = o == selected
                val bg by animateColorAsState(if (on) Cp.Primary else Cp.GlassFill, tween(Cp.ControlMs), label = "chip")
                Text(
                    label(o),
                    Modifier.clip(CircleShape).background(bg).border(1.dp, if (on) Color.Transparent else Cp.GlassStroke, CircleShape)
                        .selectable(selected = on, role = Role.RadioButton) { onSelect(o) }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (on) Cp.OnPrimary else Cp.TextSoft,
                    fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium,
                )
            }
        }
    }
}

@Composable
private fun SmallButton(text: String, onClick: () -> Unit) {
    Text(
        text,
        Modifier.clip(CircleShape).background(Cp.GlassFillStrong).border(1.dp, Cp.GlassStroke, CircleShape)
            .clickable(role = Role.Button, onClick = onClick).padding(horizontal = 14.dp, vertical = 7.dp),
        style = MaterialTheme.typography.labelLarge,
        color = Cp.TextSoft,
    )
}

@Composable
private fun Confirm(title: String, text: String, confirm: String, onResult: (Boolean) -> Unit) {
    AlertDialog(
        onDismissRequest = { onResult(false) },
        containerColor = Color(0xFF16161C),
        title = { Text(title, style = MaterialTheme.typography.titleLarge) },
        text = { Text(text, style = MaterialTheme.typography.bodyMedium, color = Cp.TextSoft) },
        confirmButton = { TextButton({ onResult(true) }) { Text(confirm, color = Cp.Destructive) } },
        dismissButton = { TextButton({ onResult(false) }) { Text("Cancel", color = Cp.TextSoft) } },
    )
}
