package com.tonihk00.clearplay

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.media3.common.Player
import com.github.takahirom.roborazzi.captureRoboImage
import com.tonihk00.clearplay.player.PlayerState
import com.tonihk00.clearplay.ui.DockPreview
import com.tonihk00.clearplay.ui.LocalActions
import com.tonihk00.clearplay.ui.NoActions
import com.tonihk00.clearplay.ui.components.BackdropLayer
import com.tonihk00.clearplay.ui.components.LocalClient
import com.tonihk00.clearplay.ui.components.LocalFakeCovers
import com.tonihk00.clearplay.ui.components.blurOnce
import com.tonihk00.clearplay.ui.library.AlbumScreen
import com.tonihk00.clearplay.ui.library.LibraryScreen
import com.tonihk00.clearplay.ui.login.LoginScreen
import com.tonihk00.clearplay.ui.player.FullPlayer
import com.tonihk00.clearplay.ui.player.LyricsState
import com.tonihk00.clearplay.ui.player.Panel
import com.tonihk00.clearplay.ui.player.PlayerControls
import com.tonihk00.clearplay.ui.player.SongMenuContent
import com.tonihk00.clearplay.ui.search.SearchScreen
import com.tonihk00.clearplay.ui.theme.ClearPlayTheme
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Renders the main screens on the JVM (Robolectric + Roborazzi) with a fake server and
 * gradient covers. PNGs land in app/build/screens/.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w400dp-h880dp-xxhdpi")
class ScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private val queue = FakeServer.songs.take(7)
    private val state = PlayerState(
        current = FakeServer.playing, isPlaying = true, durationMs = 70_000,
        queue = queue, index = 1, repeat = Player.REPEAT_MODE_OFF,
    )
    private val controls = object : PlayerControls {
        override fun position() = 39_000L
    }

    /** The cover blurred once, exactly like the app does it. */
    private fun fakeBlur(): androidx.compose.ui.graphics.ImageBitmap {
        val src = Bitmap.createBitmap(150, 150, Bitmap.Config.ARGB_8888)
        val c = Canvas(src)
        c.drawRect(0f, 0f, 150f, 150f, Paint().apply {
            shader = LinearGradient(0f, 0f, 150f, 150f, intArrayOf(0xFF6D3BD8.toInt(), 0xFFE0479E.toInt(), 0xFFF25AA8.toInt()), null, Shader.TileMode.CLAMP)
        })
        c.drawCircle(105f, 110f, 45f, Paint().apply {
            shader = RadialGradient(105f, 110f, 45f, 0xFFF55AA8.toInt(), 0x00F55AA8, Shader.TileMode.CLAMP)
        })
        return blurOnce(src).asImageBitmap()
    }

    private fun shoot(name: String, waitFor: String? = null, content: @Composable () -> Unit) {
        val blur = fakeBlur()
        rule.setContent {
            ClearPlayTheme(reduceMotion = true) {
                CompositionLocalProvider(
                    LocalClient provides FakeServer.client,
                    LocalFakeCovers provides FakeServer::cover,
                    LocalActions provides NoActions,
                ) {
                    Box(Modifier.fillMaxSize()) {
                        BackdropLayer(blur)
                        content()
                    }
                }
            }
        }
        if (waitFor != null) {
            rule.waitUntil(10_000) { rule.onAllNodesWithText(waitFor, substring = true).fetchSemanticsNodes().isNotEmpty() }
        }
        rule.mainClock.advanceTimeBy(1_500)
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screens/$name.png")
    }

    @Composable
    private fun WithDock(tab: Int, content: @Composable () -> Unit) {
        Box(Modifier.fillMaxSize()) {
            content()
            Box(Modifier.align(Alignment.BottomCenter)) { DockPreview(state, tab) }
        }
    }

    @Test fun libraryAlbums() = shoot("01-library-albums", "Static Bloom") {
        WithDock(0) { LibraryScreen(170.dp, FakeServer.playing.id, initialTab = 0) }
    }

    @Test fun libraryFavorites() = shoot("02-library-favorites", "Small Hours") {
        WithDock(0) { LibraryScreen(170.dp, FakeServer.playing.id, initialTab = 4) }
    }

    @Test fun album() = shoot("03-album", "Opening") {
        WithDock(0) { AlbumScreen("al1", 170.dp, FakeServer.playing.id) {} }
    }

    @Test fun search() = shoot("04-search", "Glass Harbour") {
        WithDock(1) { SearchScreen(170.dp, FakeServer.playing.id, autoFocus = false, initialQuery = "a") }
    }

    @Test fun fullPlayer() = shoot("05-player") {
        FullPlayer(state, controls, LyricsState.Ready(FakeServer.lyrics), {}, backdrop = { BackdropLayer(fakeBlur(), dim = 0.05f) })
    }

    @Test fun fullPlayerLyrics() = shoot("06-player-lyrics") {
        FullPlayer(
            state, controls, LyricsState.Ready(FakeServer.lyrics), {},
            initialPanel = Panel.Lyrics, fixedPositionMs = 61_000,
            backdrop = { BackdropLayer(fakeBlur(), dim = 0.05f) },
        )
    }

    @Test fun fullPlayerQueue() = shoot("07-player-queue") {
        FullPlayer(state, controls, LyricsState.None, {}, initialPanel = Panel.Queue, backdrop = { BackdropLayer(fakeBlur(), dim = 0.05f) })
    }

    @Test fun songMenu() = shoot("08-song-menu") {
        Column(Modifier.fillMaxSize()) {
            Spacer(Modifier.weight(1f))
            Box(Modifier.fillMaxWidth().background(Color(0xFF16161C).copy(alpha = 0.97f), RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))) {
                SongMenuContent(FakeServer.playing) {}
            }
        }
    }

    @Test fun settings() = shoot("10-settings") {
        WithDock(3) {
            com.tonihk00.clearplay.ui.settings.SettingsScreen(
                com.tonihk00.clearplay.ui.settings.SettingsUi(
                    servers = listOf(
                        com.tonihk00.clearplay.data.api.ServerConfig("http://192.168.1.10:4533", "toni", "t", "s"),
                        com.tonihk00.clearplay.data.api.ServerConfig("http://music.tailnet.ts.net:4533", "toni", "t", "s"),
                    ),
                    active = com.tonihk00.clearplay.data.api.ServerConfig("http://192.168.1.10:4533", "toni", "t", "s"),
                    latency = mapOf("http://192.168.1.10:4533" to 12L, "http://music.tailnet.ts.net:4533" to 48L),
                    settings = com.tonihk00.clearplay.data.Settings(mobileBitrate = 192),
                    downloadCount = 18, downloadBytes = 142L shl 20, imageCacheBytes = 23L shl 20, version = "1.1.0",
                ),
                object : com.tonihk00.clearplay.ui.settings.SettingsActions {},
                170.dp,
            )
        }
    }

    @Test fun downloads() = shoot("11-downloads", "Neon Tides") {
        val songs = FakeServer.songs.take(9)
        CompositionLocalProvider(
            com.tonihk00.clearplay.ui.LocalDownloadedSongs provides songs,
            com.tonihk00.clearplay.ui.LocalDownloadStates provides (
                songs.associate { it.id to com.tonihk00.clearplay.data.DownloadState(androidx.media3.exoplayer.offline.Download.STATE_COMPLETED, 100f) } +
                    (FakeServer.songs[9].id to com.tonihk00.clearplay.data.DownloadState(androidx.media3.exoplayer.offline.Download.STATE_DOWNLOADING, 40f))
                ),
        ) {
            WithDock(0) { LibraryScreen(170.dp, FakeServer.playing.id, initialTab = 6) }
        }
    }

    @Test fun stats() = shoot("12-stats") {
        WithDock(2) {
            com.tonihk00.clearplay.ui.stats.StatsScreen(170.dp, preset = com.tonihk00.clearplay.data.stats.computeStats(FakeServer.songs))
        }
    }

    /** Offline: the saved snapshot with "Last synced" under the tiles. */
    @Test fun statsOffline() = shoot("12b-stats-offline", waitFor = "Last synced") {
        WithDock(2) {
            com.tonihk00.clearplay.ui.stats.StatsScreen(
                170.dp, preset = com.tonihk00.clearplay.data.stats.computeStats(FakeServer.songs),
                presetSyncedAt = System.currentTimeMillis() - 2 * 3_600_000L,
            )
        }
    }

    private fun shootAbout(name: String) {
        rule.setContent {
            ClearPlayTheme(reduceMotion = true) {
                Box(Modifier.fillMaxSize()) {
                    BackdropLayer(fakeBlur())
                    com.tonihk00.clearplay.ui.settings.AboutDialog(
                        com.tonihk00.clearplay.ui.settings.AboutInfo("1.5.3", 58, "Navidrome 0.64.2 (10114574)", "MIT licence · Copyright (c) 2026 Victor Alves"),
                    ) {}
                }
            }
        }
        rule.waitUntil(10_000) { rule.onAllNodesWithText("Copy debug info").fetchSemanticsNodes().isNotEmpty() }
        rule.mainClock.advanceTimeBy(1_500)
        rule.waitForIdle()
        com.github.takahirom.roborazzi.captureScreenRoboImage("build/screens/$name.png")
    }

    @Test fun about() = shootAbout("13-about")

    @Config(sdk = [35], qualifiers = "w880dp-h400dp-land-xxhdpi")
    @Test fun aboutLandscape() = shootAbout("13b-about-landscape")

    @Config(sdk = [35], qualifiers = "w400dp-h880dp-xxhdpi", fontScale = 2.0f)
    @Test fun aboutLargestFont() = shootAbout("13c-about-font-200")

    /** Regression: switching library tabs must never show (or crash on) another tab's cached data. */
    @Test fun libraryTabsKeepTheirOwnData() {
        rule.setContent {
            ClearPlayTheme(reduceMotion = true) {
                CompositionLocalProvider(LocalClient provides FakeServer.client, LocalFakeCovers provides FakeServer::cover) {
                    LibraryScreen(170.dp, null, initialTab = 1)
                }
            }
        }
        fun waitFor(t: String) = rule.waitUntil(10_000) { rule.onAllNodesWithText(t).fetchSemanticsNodes().isNotEmpty() }
        waitFor("Mira Vale")
        rule.onAllNodesWithText("Playlists")[0].performClick()
        waitFor("Late drive")
        rule.onAllNodesWithText("Favorites")[0].performClick()
        waitFor("Small Hours")
        rule.onAllNodesWithText("Playlists")[0].performClick()
        waitFor("Sunday")
    }

    @Test fun login() = shoot("09-login") {
        LoginScreen(onLoggedIn = {}, onUsePhone = {})
    }
}
