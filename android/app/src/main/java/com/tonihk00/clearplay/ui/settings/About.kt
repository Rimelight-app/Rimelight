package com.tonihk00.clearplay.ui.settings

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.os.Build
import android.view.WindowManager
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.net.toUri
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.ui.components.IconButtonCp
import com.tonihk00.clearplay.ui.components.Logo
import com.tonihk00.clearplay.ui.theme.Cp

const val GITHUB_URL = "https://github.com/tonihk00/ClearPlay"

/** What the About window shows; built from the package info and the connected server. */
data class AboutInfo(
    val versionName: String,
    val versionCode: Long,
    /** "Navidrome 0.64.2 (10114574)", or null when offline / no server. */
    val server: String?,
    /** "MIT licence · Copyright (c) 2026 …", read from the bundled licence file. */
    val licence: String?,
)

/** "navidrome" + "0.64.2 (…)" → "Navidrome 0.64.2 (…)". */
fun serverLabel(type: String?, version: String?): String? {
    version ?: return null
    val name = type?.replaceFirstChar { it.uppercase() } ?: "Server"
    return "$name $version"
}

/**
 * The app's own licence, as bundled in assets/licenses/ClearPlay-<SPDX>.txt (a copy of the
 * repository's LICENSE.txt): the licence name from the file name, the copyright from its first line.
 */
fun licenceSummary(fileName: String, text: String): String {
    val spdx = fileName.removePrefix("ClearPlay-").removeSuffix(".txt")
    val copyright = text.lineSequence().map { it.trim() }.firstOrNull { it.startsWith("Copyright", ignoreCase = true) }
    return listOfNotNull("$spdx licence", copyright).joinToString(" · ")
}

fun readAppLicence(context: android.content.Context): String? = runCatching {
    val name = context.assets.list("licenses")?.firstOrNull { it.startsWith("ClearPlay-") } ?: return null
    licenceSummary(name, context.assets.open("licenses/$name").bufferedReader().use { it.readText() })
}.getOrNull()

/** For bug reports: versions and device only. No user names, addresses or tokens. */
fun debugInfo(about: AboutInfo, androidRelease: String, sdk: Int, manufacturer: String, model: String): String =
    listOf(
        "ClearPlay ${about.versionName} (build ${about.versionCode})",
        "Android $androidRelease (API $sdk)",
        "Device: $manufacturer $model",
        "Server: ${about.server ?: "offline"}",
    ).joinToString("\n")

/**
 * Centered About window: dimmed, blurred background (Android 12+ where the phone allows
 * cross-window blur), a frosted rounded card 90% wide up to 480 dp. Closes with the X,
 * a tap outside or Back. Scrolls when the font is large or the screen is short.
 */
@Composable
fun AboutDialog(about: AboutInfo, onClose: () -> Unit) {
    Dialog(onClose, DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = true, dismissOnClickOutside = true)) {
        val window = (LocalView.current.parent as? DialogWindowProvider)?.window
        SideEffect {
            window ?: return@SideEffect
            window.setDimAmount(0.55f)
            if (Build.VERSION.SDK_INT >= 31) {
                window.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
                window.attributes = window.attributes.also { it.blurBehindRadius = 48 }
            }
        }
        val context = LocalContext.current
        val shape = RoundedCornerShape(24.dp)
        // Tapping the empty space around the card closes it (the card itself swallows taps).
        Box(
            Modifier.fillMaxWidth().clickable(interactionSource = null, indication = null, onClick = onClose).padding(vertical = 16.dp),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                Modifier.fillMaxWidth(0.9f).widthIn(max = 480.dp)
                    .clip(shape).background(Cp.Popover.copy(alpha = 0.92f), shape)
                    .background(Cp.GlassFillStrong, shape).border(1.dp, Cp.GlassStroke, shape)
                    .clickable(interactionSource = null, indication = null) {},
            ) {
                Column(
                    Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 22.dp, vertical = 26.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Logo(Modifier.size(64.dp))
                    Spacer(Modifier.height(14.dp))
                    Text("ClearPlay", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                    Text(
                        "Version ${about.versionName} · build ${about.versionCode}",
                        style = MaterialTheme.typography.bodyMedium, color = Cp.TextSoft, textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "A Navidrome client focused on sound quality.",
                        style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint, textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(18.dp))
                    Column(Modifier.fillMaxWidth().clip(Cp.Shape).background(Cp.GlassFill).border(1.dp, Cp.GlassStroke, Cp.Shape)) {
                        AboutLine("Server", about.server ?: "Offline")
                        about.licence?.let { AboutLine("Licence", it) }
                    }
                    Spacer(Modifier.height(18.dp))
                    PillButton("View on GitHub", primary = true) {
                        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, GITHUB_URL.toUri()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                    }
                    Spacer(Modifier.height(8.dp))
                    var copied by remember { mutableStateOf(false) }
                    LaunchedEffect(copied) { if (copied) { kotlinx.coroutines.delay(2000); copied = false } }
                    PillButton(if (copied) "Copied" else "Copy debug info", primary = false) {
                        val text = debugInfo(about, Build.VERSION.RELEASE, Build.VERSION.SDK_INT, Build.MANUFACTURER, Build.MODEL)
                        context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("ClearPlay debug info", text))
                        copied = true
                    }
                }
                IconButtonCp(R.drawable.ic_x, "Close", onClose, Modifier.align(Alignment.TopEnd).padding(6.dp), size = 40.dp, iconSize = 18.dp)
            }
        }
    }
}

@Composable
private fun AboutLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = Cp.TextStrong, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun PillButton(text: String, primary: Boolean, onClick: () -> Unit) {
    Text(
        text,
        Modifier.fillMaxWidth().clip(CircleShape)
            .background(if (primary) Cp.Primary else Cp.GlassFillStrong)
            .border(1.dp, if (primary) Cp.Primary else Cp.GlassStroke, CircleShape)
            .clickable(role = Role.Button, onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        style = MaterialTheme.typography.labelLarge,
        color = if (primary) Cp.OnPrimary else Cp.TextSoft,
        fontWeight = FontWeight.SemiBold,
        textAlign = TextAlign.Center,
    )
}
