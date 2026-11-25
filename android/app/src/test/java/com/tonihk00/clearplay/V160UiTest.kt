package com.tonihk00.clearplay

import android.content.Intent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.core.content.pm.ShortcutManagerCompat
import com.github.takahirom.roborazzi.captureRoboImage
import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.data.stats.StatsSnapshot
import com.tonihk00.clearplay.data.stats.StatsStore
import com.tonihk00.clearplay.data.stats.computeStats
import com.tonihk00.clearplay.player.QueueHandoff
import com.tonihk00.clearplay.ui.LocalActions
import com.tonihk00.clearplay.ui.LocalOnline
import com.tonihk00.clearplay.ui.LocalToast
import com.tonihk00.clearplay.ui.NoActions
import com.tonihk00.clearplay.ui.components.BackdropLayer
import com.tonihk00.clearplay.ui.components.LocalClient
import com.tonihk00.clearplay.ui.components.LocalFakeCovers
import com.tonihk00.clearplay.ui.library.LibraryScreen
import com.tonihk00.clearplay.ui.player.HandoffPill
import com.tonihk00.clearplay.ui.player.leftBehindText
import com.tonihk00.clearplay.ui.player.offerText
import com.tonihk00.clearplay.ui.stats.StatsHeader
import com.tonihk00.clearplay.ui.stats.StatsRefresh
import com.tonihk00.clearplay.ui.stats.StatsScreen
import com.tonihk00.clearplay.ui.theme.ClearPlayTheme
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.headersOf
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.util.concurrent.atomic.AtomicInteger

/** 1.6.0 screens: the Continue pills, the Statistics refresh button, and app shortcuts. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w400dp-h880dp-xxhdpi")
class V160UiTest {
    @get:Rule val rule = createComposeRule()

    private fun shot(name: String, content: @Composable () -> Unit) {
        rule.setContent {
            ClearPlayTheme(reduceMotion = true) {
                CompositionLocalProvider(LocalFakeCovers provides FakeServer::cover, LocalActions provides NoActions) {
                    Box(Modifier.fillMaxSize()) {
                        BackdropLayer(null)
                        content()
                    }
                }
            }
        }
        rule.mainClock.advanceTimeBy(1_000)
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screens/$name.png")
    }

    // ---------------------------------------------------------------- B: pills

    private val now = 1_795_543_200_000L + 5 * 60_000 // 5 min after 2026-11-24T18:00:00Z
    private val song = Song(id = "b", title = "Way Bigger")
    private fun offer(kind: QueueHandoff.Kind, device: String) =
        QueueHandoff.Offer(kind, device, song, 3, 61_000, "2026-11-24T18:00:00Z")

    private fun pill(name: String, text: com.tonihk00.clearplay.ui.player.HandoffPillText, expectText: String, expectButton: String) {
        var acted = 0
        var dismissed = 0
        shot("pill-$name") {
            Column(Modifier.fillMaxWidth().padding(10.dp)) {
                HandoffPill(text, onAction = { acted++ }, onDismiss = { dismissed++ }, haze = null)
            }
        }
        rule.onNodeWithText(expectText).assertExists()
        rule.onNodeWithText(expectButton).performClick()
        rule.onNodeWithContentDescription("Dismiss").performClick()
        assertEquals(1, acted)
        assertEquals(1, dismissed)
    }

    @Test fun pillPlaying() {
        val t = offerText(offer(QueueHandoff.Kind.playing, "ClearPlay desktop"), now)
        assertEquals("Playing on ClearPlay desktop · Way Bigger", t.text)
        pill("playing", t, "Playing on ClearPlay desktop · Way Bigger", "Continue here")
    }

    @Test fun pillPaused() {
        val t = offerText(offer(QueueHandoff.Kind.paused, "ClearPlay desktop"), now)
        assertEquals("Paused on ClearPlay desktop · Way Bigger · 5 min ago", t.text)
        pill("paused", t, "Paused on ClearPlay desktop · Way Bigger · 5 min ago", "Continue")
    }

    @Test fun pillSaved() {
        val t = offerText(offer(QueueHandoff.Kind.saved, "Symfonium"), now)
        assertEquals("Saved by Symfonium · Way Bigger · 5 min ago", t.text)
        pill("saved", t, "Saved by Symfonium · Way Bigger · 5 min ago", "Continue")
    }

    @Test fun pillLeftBehind() {
        val t = leftBehindText("ClearPlay desktop")
        pill("left-behind", t, "Continued on ClearPlay desktop", "Pause here")
    }

    @Test fun ageWords() {
        val changed = "2026-11-24T18:00:00Z"
        val at = 1_795_543_200_000L
        fun age(ms: Long) = com.tonihk00.clearplay.ui.player.ageLabel(QueueHandoff.ageText(changed, at + ms), at + ms, java.time.ZoneOffset.UTC)
        assertEquals("just now", age(-600_000))
        assertEquals("just now", age(59_999))
        assertEquals("10 min ago", age(600_000))
        assertEquals("3 h ago", age(3 * 3_600_000L))
        assertEquals("yesterday", age(30 * 3_600_000L))
        assertEquals("24 Nov", age(72 * 3_600_000L))
        assertEquals("24 Nov 2026", com.tonihk00.clearplay.ui.player.ageLabel(QueueHandoff.Age.Date(changed), at + 400L * 86_400_000, java.time.ZoneOffset.UTC))
    }

    // ---------------------------------------------------------------- D: Statistics refresh

    @Test fun headerIdle() = shot("stats-header-idle") {
        StatsHeader("Your listening, from Navidrome's play counts", StatsRefresh(enabled = true, running = false) {})
    }.also { rule.onNodeWithContentDescription("Refresh statistics").assertIsEnabled() }

    @Test fun headerRefreshing() = shot("stats-header-refreshing") {
        StatsHeader("Your listening, from Navidrome's play counts", StatsRefresh(enabled = true, running = true) {})
    }.also { rule.onNodeWithContentDescription("Refresh statistics").assertIsNotEnabled() }

    @Test fun headerOffline() = shot("stats-header-offline") {
        StatsHeader("Saved from Navidrome · you're offline", StatsRefresh(enabled = false, running = false) {})
    }.also { rule.onNodeWithContentDescription("Refresh statistics").assertIsNotEnabled() }

    /** A server whose search3 waits for [gate] (so a refresh can be caught running) and counts fetches. */
    private class StatsServer(val fail: Boolean = false) {
        val search3 = AtomicInteger()
        var gate = CompletableDeferred<Unit>()
        val client = SubsonicClient(
            ServerConfig("http://stats.local", "toni-${System.nanoTime()}", "t", "s"),
            HttpClient(
                MockEngine { req ->
                    val endpoint = req.url.encodedPath.substringAfterLast('/')
                    if (endpoint == "search3") {
                        // A fetch reads four pages at a time; it starts with the page at offset 0.
                        if (req.url.parameters["songOffset"] == "0") search3.incrementAndGet()
                        gate.await()
                    }
                    val body = when {
                        fail -> """{"subsonic-response":{"status":"failed","error":{"code":0,"message":"boom"}}}"""
                        endpoint == "search3" -> """{"subsonic-response":{"status":"ok","searchResult3":{"song":[{"id":"n1","title":"New","duration":3600,"playCount":5}]}}}"""
                        else -> """{"subsonic-response":{"status":"ok"}}"""
                    }
                    respond(body, headers = headersOf(HttpHeaders.ContentType, "application/json"))
                },
            ),
        )
    }

    /** A snapshot fetched a minute ago (fresh: the page wouldn't refetch by itself). */
    private fun freshSnapshot(server: ServerConfig) {
        val app = RuntimeEnvironment.getApplication() as ClearPlayApp
        StatsStore(app.filesDir.resolve("stats")).save(
            StatsStore.keyOf(server),
            StatsSnapshot(computeStats(FakeServer.songs), System.currentTimeMillis() - 60_000),
        )
    }

    private fun statsPage(server: StatsServer, online: Boolean, toasts: MutableList<String> = mutableListOf()) {
        rule.setContent {
            ClearPlayTheme(reduceMotion = true) {
                CompositionLocalProvider(
                    LocalClient provides server.client,
                    LocalOnline provides online,
                    LocalToast provides { toasts += it },
                    LocalActions provides NoActions,
                ) { StatsScreen(0.dp) }
            }
        }
        idleUntil { rule.onAllNodesWithText("Hours listened", substring = true, ignoreCase = true).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Hours listened", ignoreCase = true).assertExists()
    }

    @Test fun refreshButtonIsOnStatisticsNotOnLibrary() {
        val s = StatsServer().also { it.gate.complete(Unit) }
        freshSnapshot(s.client.server)
        statsPage(s, online = true)
        rule.onNodeWithContentDescription("Refresh statistics").assertExists()
    }

    @Test fun libraryKeepsShuffleAndHasNoRefresh() {
        rule.setContent {
            ClearPlayTheme(reduceMotion = true) {
                CompositionLocalProvider(LocalClient provides FakeServer.client, LocalFakeCovers provides FakeServer::cover) {
                    LibraryScreen(0.dp, null)
                }
            }
        }
        rule.waitForIdle()
        rule.onNodeWithContentDescription("Shuffle library").assertExists()
        assertTrue(rule.onAllNodesWithContentDescription("Refresh statistics").fetchSemanticsNodes().isEmpty())
    }

    @Test fun tapWithAFreshSnapshotFetchesOnceEvenWhenTappedTwice() {
        val s = StatsServer()
        freshSnapshot(s.client.server)
        statsPage(s, online = true)
        rule.waitForIdle()
        assertEquals("fresh snapshot: no fetch on open", 0, s.search3.get())
        rule.onNodeWithContentDescription("Refresh statistics").assertIsEnabled()
        rule.onNodeWithContentDescription("Refresh statistics").performClick()
        idleUntil { s.search3.get() >= 1 }
        assertEquals("one fetch started by the tap", 1, s.search3.get())
        rule.waitForIdle()
        // Running: the button is disabled and a second tap starts nothing.
        rule.onNodeWithContentDescription("Refresh statistics").assertIsNotEnabled()
        rule.onNodeWithContentDescription("Refresh statistics").performClick()
        rule.onNodeWithText("updating…", substring = true).assertExists()
        s.gate.complete(Unit)
        idleUntil { rule.onAllNodesWithText("1 of 1 songs played", substring = true).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("1 of 1 songs played", substring = true).assertExists()
        assertEquals(1, s.search3.get())
        rule.onNodeWithContentDescription("Refresh statistics").assertIsEnabled()
    }

    @Test fun offlineTheButtonIsDisabled() {
        val s = StatsServer().also { it.gate.complete(Unit) }
        freshSnapshot(s.client.server)
        statsPage(s, online = false)
        rule.onNodeWithContentDescription("Refresh statistics").assertIsNotEnabled()
        rule.onNodeWithContentDescription("Refresh statistics").performClick()
        rule.waitForIdle()
        assertEquals(0, s.search3.get())
    }

    @Test fun failureKeepsTheOldNumbersAndSaysSo() {
        val s = StatsServer(fail = true).also { it.gate.complete(Unit) }
        freshSnapshot(s.client.server)
        val toasts = mutableListOf<String>()
        statsPage(s, online = true, toasts)
        val plays = com.tonihk00.clearplay.data.stats.fmtInt(computeStats(FakeServer.songs).plays)
        assertTrue(rule.onAllNodesWithText(plays).fetchSemanticsNodes().isNotEmpty())
        rule.onNodeWithContentDescription("Refresh statistics").assertIsEnabled()
        rule.onNodeWithContentDescription("Refresh statistics").performClick()
        idleUntil { toasts.isNotEmpty() }
        rule.waitForIdle()
        assertEquals(listOf("Couldn't refresh statistics"), toasts)
        rule.onNodeWithText("Hours listened", ignoreCase = true).assertExists()
        assertTrue("the old numbers stay", rule.onAllNodesWithText(plays).fetchSemanticsNodes().isNotEmpty())
    }

    /**
     * Runs the main looper until [cond] or 10 s. The app's work resumes on the main thread from
     * IO threads; Robolectric's paused looper only runs those posts when idled, which Compose's
     * waitUntil doesn't always do.
     */
    private fun idleUntil(cond: () -> Boolean) {
        val end = System.currentTimeMillis() + 10_000
        while (!cond() && System.currentTimeMillis() < end) {
            org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle()
            Thread.sleep(10)
        }
        rule.waitForIdle()
    }

    // ---------------------------------------------------------------- C: shortcuts

    /** A player connection that connects only when told to (cold start). */
    private class LateConnection {
        val waiting = mutableListOf<() -> Unit>()
        var connected = false
        fun whenConnected(block: () -> Unit) { if (connected) block() else waiting += block }
        fun connect() { connected = true; waiting.toList().forEach { it() }; waiting.clear() }
    }

    @Test fun eachShortcutDoesItsThingAfterADelayedConnect() {
        val calls = mutableListOf<String>()
        val c = LateConnection()
        val actions = ShortcutActions(
            signedIn = { true },
            whenConnected = c::whenConnected,
            shuffleLibrary = { calls += "shuffle" },
            resume = { calls += "resume"; true },
            openDownloads = { calls += "downloads" },
        )
        assertTrue(actions.handle(Shortcuts.ACTION_SHUFFLE))
        assertTrue(actions.handle(Shortcuts.ACTION_RESUME))
        assertTrue(actions.handle(Shortcuts.ACTION_DOWNLOADS))
        assertEquals("only Downloads (no player needed) before the player connects", listOf("downloads"), calls)
        c.connect()
        assertEquals(listOf("downloads", "shuffle", "resume"), calls)
        assertFalse(actions.handle("android.intent.action.MAIN"))
    }

    @Test fun resumeWithNothingSavedSaysSo() {
        val calls = mutableListOf<String>()
        val actions = ShortcutActions({ true }, { it() }, {}, resume = { false }, openDownloads = {}, onNothingToResume = { calls += "nothing" })
        actions.handle(Shortcuts.ACTION_RESUME)
        assertEquals(listOf("nothing"), calls)
    }

    @Test fun signedOutDoesNothing() {
        val calls = mutableListOf<String>()
        val actions = ShortcutActions(
            signedIn = { false }, whenConnected = { calls += "connect"; it() },
            shuffleLibrary = { calls += "shuffle" }, resume = { calls += "resume"; true }, openDownloads = { calls += "downloads" },
        )
        Shortcuts.ACTIONS.forEach { assertFalse(actions.handle(it)) }
        assertEquals(emptyList<String>(), calls)
    }

    @Test fun mainActivityPassesTheShortcutOnInOnCreateAndOnNewIntent() {
        val app = RuntimeEnvironment.getApplication() as ClearPlayApp
        app.shortcutRequests.resetReplayCache()
        val controller = Robolectric.buildActivity(MainActivity::class.java, Intent(Shortcuts.ACTION_RESUME)).create()
        assertEquals(listOf(Shortcuts.ACTION_RESUME), app.shortcutRequests.replayCache)
        controller.newIntent(Intent(Shortcuts.ACTION_DOWNLOADS))
        assertEquals(listOf(Shortcuts.ACTION_DOWNLOADS), app.shortcutRequests.replayCache)
        controller.destroy()
    }

    @Test fun dynamicShortcutsWithTheResumeLabel() = runBlocking {
        val app = RuntimeEnvironment.getApplication() as ClearPlayApp
        val shortcuts = Shortcuts(app, kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined))
        shortcuts.publish(Song(id = "x", title = "Way Bigger"))
        waitFor { ShortcutManagerCompat.getDynamicShortcuts(app).size == 3 }
        val list = ShortcutManagerCompat.getDynamicShortcuts(app).sortedBy { it.rank }
        assertEquals(listOf("Shuffle library", "Resume · Way Bigger", "Downloads"), list.map { it.shortLabel.toString() })
        assertEquals(listOf(Shortcuts.ACTION_SHUFFLE, Shortcuts.ACTION_RESUME, Shortcuts.ACTION_DOWNLOADS), list.map { it.intent.action })
        assertTrue(list.all { it.intent.component?.packageName == app.packageName })
        // Nothing saved: Resume goes.
        shortcuts.publish(null)
        waitFor { ShortcutManagerCompat.getDynamicShortcuts(app).size == 2 }
        assertTrue(ShortcutManagerCompat.getDynamicShortcuts(app).none { it.id == Shortcuts.RESUME })
    }

    private suspend fun waitFor(cond: () -> Boolean) {
        val end = System.currentTimeMillis() + 5_000
        while (!cond() && System.currentTimeMillis() < end) kotlinx.coroutines.delay(20)
        assertTrue(cond())
    }
}
