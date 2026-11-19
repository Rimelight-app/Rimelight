package com.tonihk00.clearplay.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.ui.components.GlassField
import com.tonihk00.clearplay.ui.components.Logo
import com.tonihk00.clearplay.ui.components.PrimaryPill
import com.tonihk00.clearplay.ui.components.glassPanel
import com.tonihk00.clearplay.ui.theme.Cp
import kotlinx.coroutines.launch

/**
 * Server address, user and password. The password is turned into a Subsonic token
 * (md5(password + salt)) right away and only the token is stored.
 */
@Composable
fun LoginScreen(onLoggedIn: suspend (ServerConfig) -> Unit, initialError: String? = null) {
    var url by rememberSaveable { mutableStateOf("") }
    var user by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var busy by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf(initialError) }
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current
    val next = KeyboardActions(onNext = { focus.moveFocus(FocusDirection.Down) })

    fun submit() {
        if (busy || url.isBlank() || user.isBlank()) return
        busy = true
        error = null
        scope.launch {
            val cfg = ServerConfig.fromPassword(url, user, password)
            runCatching { SubsonicClient(cfg).ping() }
                .onSuccess { onLoggedIn(cfg) }
                .onFailure { error = friendlyError(it) }
            busy = false
        }
    }

    Column(
        Modifier.fillMaxSize().systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Spacer(Modifier.height(32.dp))
        Logo(Modifier.size(72.dp))
        Spacer(Modifier.height(20.dp))
        Text("ClearPlay", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Connect to your Navidrome or OpenSubsonic server",
            style = MaterialTheme.typography.bodyMedium,
            color = Cp.TextSoft,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 6.dp),
        )
        Spacer(Modifier.height(28.dp))
        Column(
            Modifier.widthIn(max = 420.dp).fillMaxWidth().glassPanel().padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            GlassField(
                url, { url = it }, "Server, e.g. 192.168.1.10:4533", Modifier.fillMaxWidth(), R.drawable.ic_server,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
                keyboardActions = next,
            )
            GlassField(
                user, { user = it }, "Username", Modifier.fillMaxWidth(), R.drawable.ic_user,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                keyboardActions = next,
            )
            GlassField(
                password, { password = it }, "Password", Modifier.fillMaxWidth(), R.drawable.ic_lock, password = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { submit() }),
            )
            if (error != null) {
                Text(error!!, style = MaterialTheme.typography.bodyMedium, color = Cp.Destructive.copy(alpha = 0.9f))
            }
            Spacer(Modifier.height(4.dp))
            PrimaryPill(if (busy) "Connecting…" else "Connect", null, { submit() }, Modifier.align(Alignment.CenterHorizontally))
        }
    }
}

/** Short, readable errors; never the request URL (it carries the auth token). */
fun friendlyError(e: Throwable): String = when {
    e is com.tonihk00.clearplay.data.api.SubsonicException && (e.code == 40 || e.code == 41) -> "Wrong username or password."
    e is com.tonihk00.clearplay.data.api.SubsonicException && e.code == -1 -> "That address isn't a Navidrome or Subsonic server."
    e is com.tonihk00.clearplay.data.api.SubsonicException -> e.message
    e.javaClass.simpleName.contains("Timeout") -> "The server didn't answer. Check the address and that you're on the right network."
    e is java.net.UnknownHostException -> "Can't find that server address."
    e is java.net.ConnectException -> "The server refused the connection. Check the address and port."
    e is javax.net.ssl.SSLException -> "Secure connection failed. Try http:// or check the certificate."
    e is kotlinx.serialization.SerializationException -> "That address isn't a Navidrome or Subsonic server."
    else -> "Couldn't connect to the server."
}
