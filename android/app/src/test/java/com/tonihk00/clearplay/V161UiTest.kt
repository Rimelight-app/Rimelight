package com.tonihk00.clearplay

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.pressKey
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.swipeDown
import androidx.navigation.compose.composable
import androidx.test.core.app.ApplicationProvider
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.player.PlayerConnection
import com.tonihk00.clearplay.ui.LocalActions
import com.tonihk00.clearplay.ui.UiActions
import com.tonihk00.clearplay.ui.components.LocalClient
import com.tonihk00.clearplay.ui.components.LocalFakeCovers
import com.tonihk00.clearplay.ui.components.LocalSheetHost
import com.tonihk00.clearplay.ui.components.SheetHost
import com.tonihk00.clearplay.ui.login.LoginScreen
import com.tonihk00.clearplay.ui.player.SleepSheet
import com.tonihk00.clearplay.ui.player.SongMenu
import com.tonihk00.clearplay.ui.settings.AboutDialog
import com.tonihk00.clearplay.ui.settings.AboutInfo
import com.tonihk00.clearplay.ui.settings.GITHUB_URL
import com.tonihk00.clearplay.ui.settings.debugInfo
import com.tonihk00.clearplay.ui.settings.readAppLicence
import com.tonihk00.clearplay.ui.theme.ClearPlayTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * 1.6.1: the name users see is Rimelight (login, About, licence), and the song menu / sleep timer
 * are GlassSheets that behave like the Material sheet they replace.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w400dp-h880dp-xxhdpi")
class V161UiTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    // ---------------------------------------------------------------- 1. the name

    @Test fun loginTitleSaysRimelight() {
        rule.setContent { ClearPlayTheme(reduceMotion = true) { LoginScreen(onLoggedIn = {}, onUsePhone = {}) } }
        rule.onNodeWithText("Rimelight").assertExists()
        assertTrue(rule.onAllNodes(SemanticsMatcher("any ClearPlay text") { n ->
            n.config.getOrElseNullable(SemanticsProperties.Text) { null }?.any { "ClearPlay" in it.text } == true
        }).fetchSemanticsNodes().isEmpty())
    }

    @Test fun aboutTitleVersionLineAndLicenceSayRimelight() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val licence = readAppLicence(context)
        assertEquals("the app's licence asset loads", "MIT licence · Copyright (c) 2026 Victor Alves", licence)
        assertTrue(context.assets.list("licenses")!!.contains("Rimelight-MIT.txt"))
        assertFalse(context.assets.list("licenses")!!.any { it.startsWith("ClearPlay-") })
        assertEquals("https://github.com/Rimelight-app/Rimelight", GITHUB_URL)
        val about = AboutInfo("1.6.1", 70, "Navidrome 0.64.2 (10114574)", licence)
        assertEquals("Rimelight 1.6.1 (build 70)", debugInfo(about, "17", 37, "Google", "sdk").lines().first())
        rule.setContent { ClearPlayTheme(reduceMotion = true) { AboutDialog(about) {} } }
        rule.onNodeWithText("Rimelight").assertExists()
        rule.onNodeWithText("Version 1.6.1 · build 70").assertExists()
        rule.onNodeWithText("MIT licence · Copyright (c) 2026 Victor Alves").assertExists()
    }

    @Test fun appNameIsRimelightButTheAppIdIsUnchanged() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        assertEquals("Rimelight", context.getString(R.string.app_name))
        // Updating over 1.6.0 needs the same application ID (debug adds .debug).
        assertEquals("com.tonihk00.clearplay", context.packageName.removeSuffix(".debug"))
        assertEquals("com.tonihk00.clearplay.action.SHUFFLE", Shortcuts.ACTION_SHUFFLE)
        assertEquals("Rimelight-Android", com.tonihk00.clearplay.data.api.SubsonicClient.CLIENT)
    }

    // ---------------------------------------------------------------- 3. song menu

    private val song = FakeServer.playing.copy(starred = null, userRating = 0)

    private class Recorder : UiActions {
        val calls = ArrayList<String>()
        override fun playNext(songs: List<Song>) { calls += "playNext ${songs.map { it.id }}" }
        override fun addToQueue(songs: List<Song>) { calls += "addToQueue ${songs.map { it.id }}" }
        override fun toggleLike(song: Song) { calls += "toggleLike ${song.id}" }
        override fun rate(song: Song, stars: Int) { calls += "rate ${song.id} $stars" }
        override fun download(songs: List<Song>) { calls += "download ${songs.map { it.id }}" }
        override fun openAlbum(id: String) { calls += "openAlbum $id" }
        override fun openArtist(id: String) { calls += "openArtist $id" }
    }

    private var open by mutableStateOf(true)
    private var dismissed = 0

    /** The menu as the app shows it: through a SheetHost above the page, with something behind. */
    private fun showMenu(actions: UiActions = Recorder(), host: SheetHost? = SheetHost()) {
        rule.setContent {
            ClearPlayTheme(reduceMotion = false) {
                CompositionLocalProvider(
                    LocalActions provides actions, LocalSheetHost provides host,
                    LocalClient provides FakeServer.client, LocalFakeCovers provides FakeServer::cover,
                ) {
                    Box(Modifier.fillMaxSize()) {
                        Text("Page behind")
                        if (open) SongMenu(song) { open = false; dismissed++ }
                        host?.Overlay()
                    }
                }
            }
        }
        rule.mainClock.advanceTimeBy(1_000)
        rule.waitForIdle()
    }

    private fun assertClosed() {
        rule.mainClock.advanceTimeBy(1_000)
        rule.waitForIdle()
        assertFalse("menu still open", open)
        assertEquals(1, dismissed)
        rule.onNodeWithText("Play next").assertDoesNotExist()
    }

    @Test fun tapOnTheScrimCloses() {
        showMenu()
        rule.onNodeWithText("Play next").assertExists()
        rule.onNodeWithTag("sheetScrim").performTouchInput { click(Offset(centerX, 60f)) }
        assertClosed()
    }

    @Test fun tapOnTheSheetItselfDoesNotClose() {
        showMenu()
        rule.onNodeWithText(song.title).performClick()
        rule.mainClock.advanceTimeBy(1_000)
        assertTrue(open)
        assertEquals(0, dismissed)
    }

    @Test fun backCloses() {
        showMenu()
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        assertClosed()
    }

    @Test fun backKeyClosesWhileTheSheetHasFocus() {
        // A focused node gets key events before the back dispatcher: the sheet must take Back itself.
        showMenu()
        rule.onNodeWithTag("sheet").assertIsFocused().performKeyInput { pressKey(Key.Back) }
        assertClosed()
    }

    /**
     * Regression (emulator, 1.6.1 development): on a page the NavHost could pop, Back went to the
     * NavHost instead of the sheet. The app's layering: NavHost page, sheet above it via the host.
     */
    @Test fun backOnAPushedPageClosesOnlyTheSheet() {
        val host = SheetHost()
        lateinit var nav: androidx.navigation.NavHostController
        rule.setContent {
            nav = androidx.navigation.compose.rememberNavController()
            ClearPlayTheme(reduceMotion = false) {
                CompositionLocalProvider(
                    LocalActions provides Recorder(), LocalSheetHost provides host,
                    LocalClient provides FakeServer.client, LocalFakeCovers provides FakeServer::cover,
                ) {
                    Box(Modifier.fillMaxSize()) {
                        androidx.navigation.compose.NavHost(nav, "root") {
                            composable("root") { Text("Root page") }
                            composable("album") { Text("Album page") }
                        }
                        if (open) SongMenu(song) { open = false; dismissed++ }
                        host.Overlay()
                    }
                }
            }
        }
        rule.runOnUiThread { nav.navigate("album") }
        rule.mainClock.advanceTimeBy(2_000)
        rule.waitForIdle()
        rule.onNodeWithText("Play next").assertExists()
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        assertClosed()
        assertEquals("the page stays", "album", nav.currentBackStackEntry?.destination?.route)
    }

    @Test fun backKeyOnAPushedPageClosesOnlyTheSheet() {
        val host = SheetHost()
        lateinit var nav: androidx.navigation.NavHostController
        rule.setContent {
            nav = androidx.navigation.compose.rememberNavController()
            ClearPlayTheme(reduceMotion = false) {
                CompositionLocalProvider(
                    LocalActions provides Recorder(), LocalSheetHost provides host,
                    LocalClient provides FakeServer.client, LocalFakeCovers provides FakeServer::cover,
                ) {
                    Box(Modifier.fillMaxSize()) {
                        androidx.navigation.compose.NavHost(nav, "root") {
                            composable("root") { Text("Root page") }
                            composable("album") { Text("Album page") }
                        }
                        if (open) SongMenu(song) { open = false; dismissed++ }
                        host.Overlay()
                    }
                }
            }
        }
        rule.runOnUiThread { nav.navigate("album") }
        rule.mainClock.advanceTimeBy(2_000)
        rule.waitForIdle()
        // The key goes through the view system, as `input keyevent BACK` does on a device.
        rule.runOnUiThread {
            val v = rule.activity.window.decorView
            v.dispatchKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, android.view.KeyEvent.KEYCODE_BACK))
            v.dispatchKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, android.view.KeyEvent.KEYCODE_BACK))
        }
        assertClosed()
        assertEquals("the page stays", "album", nav.currentBackStackEntry?.destination?.route)
    }

    /**
     * Regression (emulator, 1.6.1): a normal-priority Back handler registered after the sheet opened
     * (the full player's or the page stack's, registering again) took Back before the sheet.
     */
    @Test fun backClosesTheSheetBeforeAHandlerRegisteredAfterIt() {
        var late by mutableStateOf(false)
        var lateBacks = 0
        rule.setContent {
            ClearPlayTheme(reduceMotion = false) {
                CompositionLocalProvider(
                    LocalActions provides Recorder(), LocalSheetHost provides SheetHost().also { h -> sheetHostForLate = h },
                    LocalClient provides FakeServer.client, LocalFakeCovers provides FakeServer::cover,
                ) {
                    Box(Modifier.fillMaxSize()) {
                        Text("Page behind")
                        if (open) SongMenu(song) { open = false; dismissed++ }
                        sheetHostForLate?.Overlay()
                        if (late) androidx.activity.compose.BackHandler { lateBacks++ }
                    }
                }
            }
        }
        rule.mainClock.advanceTimeBy(1_000)
        rule.waitForIdle()
        rule.onNodeWithText("Play next").assertExists()
        late = true
        rule.waitForIdle()
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        assertClosed()
        assertEquals("the later handler must not take Back", 0, lateBacks)
    }

    private var sheetHostForLate: SheetHost? = null

    @Test fun dragDownCloses() {
        showMenu()
        rule.onNodeWithTag("sheet").performTouchInput { swipeDown(startY = top + 20f, endY = bottom, durationMillis = 300) }
        assertClosed()
    }

    @Test fun shortDragSnapsBack() {
        showMenu()
        rule.onNodeWithTag("sheet").performTouchInput { swipeDown(startY = top + 20f, endY = top + 60f, durationMillis = 600) }
        rule.mainClock.advanceTimeBy(1_000)
        assertTrue(open)
        rule.onNodeWithText("Play next").assertExists()
    }

    private fun action(label: String, expect: String, closes: Boolean) {
        val rec = Recorder()
        showMenu(rec)
        if (label.endsWith("stars")) rule.onNodeWithContentDescription(label).performClick() else rule.onNodeWithText(label).performClick()
        rule.mainClock.advanceTimeBy(1_000)
        rule.waitForIdle()
        assertEquals(label, listOf(expect), rec.calls)
        assertEquals("$label closes the menu", closes, !open)
    }

    @Test fun playNext() = action("Play next", "playNext [${song.id}]", closes = true)
    @Test fun addToQueue() = action("Add to queue", "addToQueue [${song.id}]", closes = true)
    @Test fun favourite() = action("Add to favourites", "toggleLike ${song.id}", closes = false)
    @Test fun download() = action("Download", "download [${song.id}]", closes = true)
    @Test fun stars() = action("4 stars", "rate ${song.id} 4", closes = false)
    @Test fun goToAlbum() = action("Go to album", "openAlbum ${song.albumId}", closes = true)
    @Test fun goToArtist() = action("Go to artist", "openArtist ${song.artistId}", closes = true)

    @Test fun talkBackReadsItAsADialogAndFocusMovesIntoIt() {
        showMenu()
        rule.onNodeWithTag("sheet")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, "Song menu"))
            .assert(SemanticsMatcher.keyIsDefined(SemanticsProperties.IsDialog))
            .assertIsFocused()
        // The scrim is announced as a way out, after the sheet.
        rule.onNodeWithContentDescription("Close sheet").assertExists()
    }

    @Test fun withoutAHostItDrawsInPlace() {
        showMenu(host = null)
        rule.onNodeWithText("Play next").assertExists()
        rule.onNodeWithTag("sheetScrim").performTouchInput { click(Offset(centerX, 60f)) }
        assertClosed()
    }

    @Test fun hostShowsOneSheetAndClearsWhenTheCallerLeaves() {
        val host = SheetHost()
        showMenu(host = host)
        assertTrue(host.showing)
        rule.runOnUiThread { open = false }
        rule.waitForIdle()
        assertFalse(host.showing)
        rule.onNodeWithText("Play next").assertDoesNotExist()
    }

    // ---------------------------------------------------------------- sleep timer

    @Test fun sleepSheetIsAGlassSheetAndItsChoicesWork() {
        val set = ArrayList<Pair<Int?, Boolean>>()
        var sleepOpen by mutableStateOf(true)
        val host = SheetHost()
        rule.setContent {
            ClearPlayTheme(reduceMotion = false) {
                CompositionLocalProvider(LocalSheetHost provides host) {
                    Box(Modifier.fillMaxSize()) {
                        if (sleepOpen) SleepSheet(PlayerConnection.Sleep(System.currentTimeMillis() + 20 * 60_000L, false), { m, e -> set += m to e }) { sleepOpen = false }
                        host.Overlay()
                    }
                }
            }
        }
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithTag("sheet").assert(SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, "Sleep timer")).assertIsFocused()
        rule.onNodeWithText("30 minutes").performClick()
        rule.mainClock.advanceTimeBy(1_000)
        assertEquals(listOf<Pair<Int?, Boolean>>(30 to false), set)
        assertFalse(sleepOpen)
        sleepOpen = true
        rule.mainClock.advanceTimeBy(1_000)
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.mainClock.advanceTimeBy(1_000)
        assertFalse("back closes the sleep timer", sleepOpen)
        assertEquals(1, set.size)
    }
}
