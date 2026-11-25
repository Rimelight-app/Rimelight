package com.tonihk00.clearplay

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.tonihk00.clearplay.player.QueueHandoff
import com.tonihk00.clearplay.ui.AppRoot
import com.tonihk00.clearplay.ui.theme.ClearPlayTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        ClearPlayApp.instance.player.connect()
        // A launcher shortcut (not when the activity is only recreated, e.g. after rotation).
        if (savedInstanceState == null) shortcut(intent)
        setContent {
            ClearPlayTheme { AppRoot() }
        }
    }

    /** singleTop: a shortcut used while the app is open arrives here. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        shortcut(intent)
    }

    private fun shortcut(intent: Intent?) {
        val action = intent?.action ?: return
        if (action !in Shortcuts.ACTIONS) return
        val app = ClearPlayApp.instance
        app.shortcuts.used(action)
        app.shortcutRequests.tryEmit(action)
    }

    override fun onStart() {
        super.onStart()
        // Continue on other devices: look at the server's queue (at most once per 30 s).
        ClearPlayApp.instance.handoff.lookOnForeground()
    }

    override fun onStop() {
        super.onStop()
        // Going to the background (not a rotation): save the queue and position right away.
        if (!isChangingConfigurations) ClearPlayApp.instance.handoff.saveNow(QueueHandoff.SaveEvent.lock)
    }
}
