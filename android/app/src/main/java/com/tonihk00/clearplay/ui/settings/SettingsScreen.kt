package com.tonihk00.clearplay.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.BuildConfigInfo
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.ui.components.CpIcon
import com.tonihk00.clearplay.ui.components.Logo
import com.tonihk00.clearplay.ui.components.SectionLabel
import com.tonihk00.clearplay.ui.components.glassPanel
import com.tonihk00.clearplay.ui.theme.Cp

@Composable
fun SettingsScreen(server: ServerConfig?, bottomPadding: Dp, onLogout: () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .statusBarsPadding().padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = bottomPadding + 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Settings", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(start = 4.dp, bottom = 8.dp))

        SectionLabel("Server", Modifier.padding(start = 4.dp))
        Column(Modifier.fillMaxWidth().glassPanel()) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                CpIcon(R.drawable.ic_server, size = 20.dp, tint = Cp.TextSoft)
                Column(Modifier.padding(start = 14.dp).weight(1f)) {
                    Text(server?.baseUrl ?: "Not connected", style = MaterialTheme.typography.titleMedium)
                    Text(server?.user.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = Cp.TextFaint)
                }
            }
            Row(
                Modifier.fillMaxWidth().clickable(onClick = onLogout).padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CpIcon(R.drawable.ic_x, size = 20.dp, tint = Cp.TextSoft)
                Text("Sign out", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 14.dp))
            }
        }

        SectionLabel("About", Modifier.padding(start = 4.dp, top = 8.dp))
        Row(Modifier.fillMaxWidth().glassPanel().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Logo(Modifier.size(36.dp))
            Column(Modifier.padding(start = 14.dp)) {
                Text("ClearPlay for Android", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Version ${BuildConfigInfo.versionName} · MIT licence · github.com/tonihk00/ClearPlay",
                    style = MaterialTheme.typography.bodySmall,
                    color = Cp.TextFaint,
                )
            }
        }
    }
}
