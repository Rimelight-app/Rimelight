package com.tonihk00.clearplay

import android.os.Looper
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.tonihk00.clearplay.data.ConnectionMonitor
import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicException
import com.tonihk00.clearplay.data.stats.StatsRepository
import com.tonihk00.clearplay.data.stats.StatsStore
import com.tonihk00.clearplay.data.stats.fetchAllSongs
import com.tonihk00.clearplay.player.PlaybackErrorRules
import com.tonihk00.clearplay.player.PlaybackErrorRules.Decision
import com.tonihk00.clearplay.player.PlaybackErrors
import com.tonihk00.clearplay.player.stopOnLastSong
import com.tonihk00.clearplay.ui.LocalLogInAgain
import com.tonihk00.clearplay.ui.PageError
import com.tonihk00.clearplay.ui.classifyPageError
import com.tonihk00.clearplay.ui.components.LocalClient
import com.tonihk00.clearplay.ui.components.LocalFakeCovers
import com.tonihk00.clearplay.ui.library.AlbumScreen
import com.tonihk00.clearplay.ui.theme.ClearPlayTheme
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.size
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/** 1.6.1 audit fixes: failing songs, end of the queue, Statistics, backup rules, page errors, pings. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w400dp-h880dp-xxhdpi")
class V161FixesTest {
    @get:Rule val rule = createComposeRule()

    // ---------------------------------------------------------------- A. a song that fails

    private fun situation(reachable: Boolean = true, retries: Int = 0, inARow: Int = 0, hasNext: Boolean = true) =
        PlaybackErrorRules.Situation(reachable, retries, inARow, hasNext)

    @Test fun errorRulesMatchTheDesktop() {
        assertEquals(Decision.offline, PlaybackErrorRules.decide(situation(reachable = false)))
        assertEquals("unreachable wins over everything", Decision.offline, PlaybackErrorRules.decide(situation(reachable = false, retries = 1, inARow = 2, hasNext = false)))
        assertEquals(Decision.retry, PlaybackErrorRules.decide(situation()))
        assertEquals("a retry comes first, even for the last song", Decision.retry, PlaybackErrorRules.decide(situation(hasNext = false)))
        assertEquals(Decision.skip, PlaybackErrorRules.decide(situation(retries = 1)))
        assertEquals(Decision.skip, PlaybackErrorRules.decide(situation(retries = 1, inARow = 1)))
        assertEquals("the third in a row stops", Decision.stopLimit, PlaybackErrorRules.decide(situation(retries = 1, inARow = 2)))
        assertEquals(Decision.stopAtEnd, PlaybackErrorRules.decide(situation(retries = 1, hasNext = false)))
        assertEquals(Decision.stopLimit, PlaybackErrorRules.decide(situation(retries = 1, inARow = 2, hasNext = false)))
        assertEquals("Couldn't play Fault Song 3", PlaybackErrorRules.couldNotPlay("Fault Song 3"))
        assertEquals("Couldn't play 3 songs in a row. Playback stopped.", PlaybackErrorRules.stoppedInARow)
    }

    private fun player(count: Int, at: Int): ExoPlayer {
        val p = ExoPlayer.Builder(RuntimeEnvironment.getApplication()).setLooper(Looper.getMainLooper()).build()
        p.setMediaItems(
            (1..count).map { MediaItem.Builder().setMediaId("s$it").setUri("http://nowhere.invalid/$it").setMediaMetadata(MediaMetadata.Builder().setTitle("Song $it").build()).build() },
            at, 0,
        )
        p.playWhenReady = true
        return p
    }

    private class Recorded {
        val messages = ArrayList<String>()
        var unreachable = 0
    }

    private fun CoroutineScope.errors(p: Player, reachable: Boolean = true, local: Boolean = false, rec: Recorded) = PlaybackErrors(
        p, this,
        isLocalItem = { local },
        serverAnswers = { reachable },
        songGone = { false },
        markUnreachable = { rec.unreachable++ },
        message = { rec.messages += it },
    )

    private val failure = PlaybackException("404", null, PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS)

    private suspend fun settle() = delay(200)

    @Test fun aFailingSongIsRetriedOnceThenSkippedWithAMessage() = runBlocking {
        val p = player(5, 2)
        val rec = Recorded()
        val e = errors(p, rec = rec)
        e.onPlayerError(failure); settle()
        assertEquals("retried: still on song 3", 2, p.currentMediaItemIndex)
        assertTrue(p.playWhenReady)
        assertEquals(emptyList<String>(), rec.messages)
        e.onPlayerError(failure); settle()
        assertEquals("then the next song", 3, p.currentMediaItemIndex)
        assertTrue(p.playWhenReady)
        assertEquals(listOf("Couldn't play Song 3"), rec.messages)
        p.release()
    }

    @Test fun threeFailedSongsInARowStopPlayback() = runBlocking {
        val p = player(6, 1)
        val rec = Recorded()
        val e = errors(p, rec = rec)
        repeat(3) { e.onPlayerError(failure); settle(); e.onPlayerError(failure); settle() }
        assertFalse("stopped", p.playWhenReady)
        assertEquals("on the third failed song (song 4), the queue kept", 3, p.currentMediaItemIndex)
        assertEquals(6, p.mediaItemCount)
        assertEquals(listOf("Couldn't play Song 2", "Couldn't play Song 3", "Couldn't play 3 songs in a row. Playback stopped."), rec.messages)
        p.release()
    }

    @Test fun aSongThatPlaysEndsTheStreak() = runBlocking {
        val p = player(6, 1)
        val rec = Recorded()
        val e = errors(p, rec = rec)
        repeat(2) { e.onPlayerError(failure); settle(); e.onPlayerError(failure); settle() }
        e.onIsPlayingChanged(true) // song 4 plays
        e.onPlayerError(failure); settle(); e.onPlayerError(failure); settle()
        assertTrue("two, a song that played, one more: not 3 in a row", p.playWhenReady)
        assertEquals(4, p.currentMediaItemIndex)
        p.release()
    }

    @Test fun theLastSongFailingStopsThereWithTheQueueKept() = runBlocking {
        val p = player(5, 4)
        val rec = Recorded()
        val e = errors(p, rec = rec)
        e.onPlayerError(failure); settle(); e.onPlayerError(failure); settle()
        assertFalse(p.playWhenReady)
        assertEquals(4, p.currentMediaItemIndex)
        assertEquals(5, p.mediaItemCount)
        assertEquals(listOf("Couldn't play Song 5"), rec.messages)
        p.release()
    }

    @Test fun serverUnreachablePausesOnTheSongWithoutSkipping() = runBlocking {
        val p = player(5, 1)
        val rec = Recorded()
        val e = errors(p, reachable = false, rec = rec)
        repeat(3) { e.onPlayerError(failure); settle() }
        assertFalse("paused", p.playWhenReady)
        assertEquals("stays on the song, never skips", 1, p.currentMediaItemIndex)
        assertEquals(3, rec.unreachable)
        assertTrue(rec.messages.all { it == PlaybackErrorRules.unreachable })
        p.release()
    }

    @Test fun aDownloadOrPhoneFileThatFailsIsRetriedThenSkippedEvenOffline() = runBlocking {
        val p = player(3, 0)
        val rec = Recorded()
        val e = errors(p, reachable = false, local = true, rec = rec)
        e.onPlayerError(failure); settle(); e.onPlayerError(failure); settle()
        assertEquals("a corrupt local file is a broken song, not an unreachable server", 1, p.currentMediaItemIndex)
        assertEquals(0, rec.unreachable)
        p.release()
    }

    // ---------------------------------------------------------------- C. end of the queue

    @Test fun theQueueEndingStopsOnTheLastSongAtItsStart() {
        val p = player(4, 3)
        p.seekTo(3, 19_500)
        stopOnLastSong(p)
        assertFalse(p.playWhenReady)
        assertEquals(3, p.currentMediaItemIndex)
        assertEquals(0L, p.currentPosition)
        assertEquals("queue kept", 4, p.mediaItemCount)
        p.release()
    }

    @Test fun repeatingQueuesAreLeftAlone() {
        val p = player(4, 3)
        p.repeatMode = Player.REPEAT_MODE_ALL
        p.seekTo(3, 19_500)
        stopOnLastSong(p)
        assertTrue(p.playWhenReady)
        assertEquals(19_500L, p.currentPosition)
        p.release()
    }

    // ---------------------------------------------------------------- B. Statistics

    private val server = ServerConfig("http://192.168.1.10:4533", "toni", "t", "s")

    @Test fun aFailedPageThrowsInsteadOfEndingTheLoop() = runBlocking {
        val pages = ArrayList<Int>()
        try {
            fetchAllSongs({ offset ->
                pages += offset
                if (offset == 1000) throw java.io.IOException("dropped")
                List(500) { Song(id = "s${offset + it}") }
            })
            fail("a failed page must fail the load, not end it like a short page")
        } catch (e: java.io.IOException) {
            // expected
        }
        assertTrue(1000 in pages)
    }

    @Test fun aFailedLoadLeavesTheSnapshotUnchanged() = runBlocking {
        val dir = File.createTempFile("stats", "").also { it.delete(); it.mkdirs(); it.deleteOnExit() }
        // A SupervisorJob like the app's scope: a failed refresh fails only its own job.
        val repo = StatsRepository(StatsStore(dir), CoroutineScope(coroutineContext + kotlinx.coroutines.SupervisorJob()))
        repo.refresh(server) { offset -> if (offset == 0) List(3) { Song(id = "a$it", playCount = 1) } else emptyList() }.await()
        val file = dir.listFiles()!!.single()
        val before = file.readBytes()
        val failed = runCatching {
            repo.refresh(server) { offset -> if (offset >= 500) throw java.io.IOException("dropped") else List(500) { Song(id = "b${offset + it}") } }.await()
        }
        assertTrue(failed.isFailure)
        assertTrue("snapshot unchanged", before.contentEquals(file.readBytes()))
        assertEquals(3, repo.saved(server)!!.stats.songs)
    }

    @Test fun leavingStatisticsForGoodCancelsTheLoad() = runBlocking {
        val dir = File.createTempFile("stats", "").also { it.delete(); it.mkdirs(); it.deleteOnExit() }
        val repo = StatsRepository(StatsStore(dir), CoroutineScope(coroutineContext))
        val asked = java.util.concurrent.atomic.AtomicInteger()
        val gate = CompletableDeferred<Unit>()
        val job = repo.refresh(server) { offset ->
            asked.incrementAndGet()
            if (offset >= 2000) gate.await() // the second batch hangs, like a slow server
            List(500) { Song(id = "s${offset + it}") }
        }
        withTimeout(5_000) { while (asked.get() < 8) delay(10) }
        repo.cancel(server)
        withTimeout(5_000) { while (job.isActive) delay(10) }
        assertTrue(job.isCancelled)
        delay(200)
        assertEquals("no more pages after cancelling", 8, asked.get())
        assertNull("nothing saved", repo.saved(server))
        assertEquals(0, dir.listFiles()!!.size)
    }

    // ---------------------------------------------------------------- D. backup rules

    @Test fun theLoginIsExcludedFromCloudBackupAndDeviceTransfer() {
        val manifest = File("src/main/AndroidManifest.xml").readText()
        assertTrue(manifest.contains("""android:dataExtractionRules="@xml/data_extraction_rules""""))
        assertTrue("cloud backup stays off", manifest.contains("""android:allowBackup="false""""))
        val doc = javax.xml.parsers.DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File("src/main/res/xml/data_extraction_rules.xml"))
        fun excludes(section: String) = (0 until doc.getElementsByTagName(section).item(0).childNodes.length)
            .map { doc.getElementsByTagName(section).item(0).childNodes.item(it) }
            .filter { it.nodeName == "exclude" }
            .map { it.attributes.getNamedItem("domain").nodeValue to it.attributes.getNamedItem("path").nodeValue }
        // The DataStore file of preferencesDataStore("clearplay") (data/ServerStore.kt).
        assertTrue(excludes("device-transfer").contains("file" to "datastore/clearplay.preferences_pb"))
        assertTrue(excludes("cloud-backup").contains("root" to "."))
        assertTrue(excludes("cloud-backup").contains("file" to "."))
    }

    // ---------------------------------------------------------------- F. errors on a page

    @Test fun pageErrorsAreClassifiedLikeTheDesktop() {
        assertEquals(PageError.NotFound, classifyPageError(SubsonicException(70, "data not found")))
        for (code in listOf(40, 41, 44)) assertEquals(PageError.Auth, classifyPageError(SubsonicException(code, "x")))
        assertEquals(PageError.Server, classifyPageError(SubsonicException(0, "generic")))
        assertEquals(PageError.Server, classifyPageError(SubsonicException(-1, "Not a Subsonic server")))
        assertEquals(PageError.Server, classifyPageError(kotlinx.serialization.SerializationException("bad json")))
        assertEquals(PageError.Server, classifyPageError(java.io.IOException("reset")))
        assertEquals(PageError.Server, classifyPageError(java.net.SocketTimeoutException("timeout")))
    }

    private fun album(client: com.tonihk00.clearplay.data.api.SubsonicClient, logIn: () -> Unit = {}) {
        rule.setContent {
            ClearPlayTheme(reduceMotion = true) {
                CompositionLocalProvider(LocalClient provides client, LocalFakeCovers provides FakeServer::cover, LocalLogInAgain provides logIn) {
                    AlbumScreen("al1", 170.dp, null) {}
                }
            }
        }
    }

    private fun waitForText(text: String) = rule.waitUntil(10_000) {
        rule.onAllNodes(androidx.compose.ui.test.hasText(text)).fetchSemanticsNodes().isNotEmpty()
    }

    @Test fun aServerErrorOnAPageOffersRetryAndRetryLoadsIt() {
        // HTTP 500 with a body that isn't JSON. The client already tries a call that didn't decode
        // once more on its generic path, so the first two answers fail; Retry's works.
        album(FakeServer.faultyClient { endpoint, n -> if (endpoint == "getAlbum" && n < 2) 500 to "<html>oops</html>" else null })
        waitForText("Couldn't load this page")
        rule.onNodeWithText("Retry").performClick()
        waitForText("Opening")
        rule.onNodeWithText("Neon Tides").assertExists()
    }

    @Test fun badJsonIsAServerErrorNotAWrongAddress() {
        album(FakeServer.faultyClient { endpoint, _ -> if (endpoint == "getAlbum") 200 to "this is not json" else null })
        waitForText("Couldn't load this page")
        rule.onNodeWithText("Retry").assertExists()
        assertTrue(rule.onAllNodes(androidx.compose.ui.test.hasText("That address isn't a Navidrome or Subsonic server.")).fetchSemanticsNodes().isEmpty())
    }

    @Test fun notFoundIsOnlyError70() {
        album(FakeServer.faultyClient { endpoint, _ ->
            if (endpoint == "getAlbum") 200 to """{"subsonic-response":{"status":"failed","version":"1.16.1","error":{"code":70,"message":"The requested data was not found."}}}""" else null
        })
        waitForText("The requested data was not found.")
        assertTrue("no Retry for not found", rule.onAllNodes(androidx.compose.ui.test.hasText("Retry")).fetchSemanticsNodes().isEmpty())
    }

    @Test fun error40OffersToLogInAgain() {
        var asked = 0
        album(
            FakeServer.faultyClient { endpoint, _ ->
                if (endpoint == "getAlbum") 200 to """{"subsonic-response":{"status":"failed","version":"1.16.1","error":{"code":40,"message":"Wrong username or password"}}}""" else null
            },
            logIn = { asked++ },
        )
        waitForText("The server rejected your login")
        rule.onNodeWithText("Log in again").performClick()
        assertEquals(1, asked)
    }

    @Test fun aFailedSearchOffersRetry() {
        val client = FakeServer.faultyClient { endpoint, n -> if (endpoint == "search3" && n < 2) 500 to "<html>oops</html>" else null }
        rule.setContent {
            ClearPlayTheme(reduceMotion = true) {
                CompositionLocalProvider(LocalClient provides client, LocalFakeCovers provides FakeServer::cover) {
                    com.tonihk00.clearplay.ui.search.SearchScreen(170.dp, null, autoFocus = false, initialQuery = "a")
                }
            }
        }
        waitForText("Search failed")
        rule.onNodeWithText("Retry").performClick()
        waitForText("Glass Harbour")
    }

    /** A failed search must not stay on screen over results already found for another query. */
    @Test fun searchFailureDoesNotStickToFoundResults() {
        var fail = false
        val faulty = FakeServer.faultyClient { endpoint, _ -> if (endpoint == "search3" && fail) 500 to "<html>oops</html>" else null }
        rule.setContent {
            ClearPlayTheme(reduceMotion = true) {
                CompositionLocalProvider(LocalClient provides faulty, LocalFakeCovers provides FakeServer::cover) {
                    com.tonihk00.clearplay.ui.search.SearchScreen(170.dp, null, autoFocus = false, initialQuery = "a")
                }
            }
        }
        waitForText("Glass Harbour")
        // The field: type another query that fails, then back to the first one.
        fail = true
        rule.onNode(androidx.compose.ui.test.hasSetTextAction()).performTextReplacement("zz")
        waitForText("Search failed")
        fail = false
        rule.onNode(androidx.compose.ui.test.hasSetTextAction()).performTextReplacement("a")
        waitForText("Glass Harbour")
        assertTrue(rule.onAllNodes(androidx.compose.ui.test.hasText("Search failed")).fetchSemanticsNodes().isEmpty())
    }

    /** Start-up's "fully drawn" waits for every visible cover; one without art must count too. */
    @Test fun aTileWithoutCoverCountsAsDrawn() {
        var loaded = 0
        rule.setContent {
            ClearPlayTheme(reduceMotion = true) {
                CompositionLocalProvider(com.tonihk00.clearplay.ui.components.LocalCoverLoaded provides { loaded++ }) {
                    com.tonihk00.clearplay.ui.components.Cover(null, androidx.compose.ui.Modifier.size(40.dp))
                }
            }
        }
        rule.waitForIdle()
        assertEquals(1, loaded)
    }

    @Test fun oneSongIsOneSong() {
        assertEquals("1 song", com.tonihk00.clearplay.ui.components.countOf(1, "song"))
        assertEquals("7 songs", com.tonihk00.clearplay.ui.components.countOf(7, "song"))
        assertEquals("0 albums", com.tonihk00.clearplay.ui.components.countOf(0, "album"))
    }

    /** At the largest font size the tab labels stay on one line ("Settings" wrapped letter by letter). */
    @Config(sdk = [35], qualifiers = "w400dp-h880dp-xxhdpi", fontScale = 2.0f)
    @Test fun tabLabelsStayOnOneLineAtFontScale2() {
        rule.setContent {
            ClearPlayTheme(reduceMotion = true) {
                com.tonihk00.clearplay.ui.DockPreview(com.tonihk00.clearplay.player.PlayerState(), 3)
            }
        }
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screens/v161-dock-font200.png")
        val h = listOf("Library", "Search", "Stats", "Settings").associateWith { rule.onNodeWithText(it).fetchSemanticsNode().boundsInRoot.height }
        println("tab label heights at 2.0x: $h")
        val oneLine = h.getValue("Library")
        assertTrue("Settings no taller than one line ($h)", h.getValue("Settings") <= oneLine + 1f)
    }

    /**
     * At start the saved login is still being read (no client yet). That isn't "offline": it made
     * the first check look like coming back online, and every cold start fetched every song again
     * for Statistics (104 pages on a 50 000-song library, measured).
     */
    @Test fun noClientYetIsNotOffline() = runBlocking {
        val context = RuntimeEnvironment.getApplication()
        val cm = context.getSystemService(android.net.ConnectivityManager::class.java)
        val caps = org.robolectric.shadows.ShadowNetworkCapabilities.newInstance()
        org.robolectric.Shadows.shadowOf(caps).addCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
        org.robolectric.Shadows.shadowOf(cm).setNetworkCapabilities(cm.activeNetwork, caps)
        val seen = java.util.Collections.synchronizedList(mutableListOf<Boolean>())
        val scope = CoroutineScope(coroutineContext + kotlinx.coroutines.SupervisorJob())
        val monitor = ConnectionMonitor(context, scope) { null }
        val watcher = scope.launch { monitor.online.collect { seen += it } }
        monitor.recheck()
        delay(300)
        watcher.cancel()
        assertEquals("starts online (a network is there) and stays so", listOf(true), seen.distinct())
        scope.coroutineContext[kotlinx.coroutines.Job]!!.cancel()
    }

    // ---------------------------------------------------------------- P. pings

    @Test fun onlyChangesThatMatterAskTheServerAgain() {
        val wifi = ConnectionMonitor.NetKey("100", internet = true, validated = true, transports = setOf(1))
        assertTrue("first callback", ConnectionMonitor.shouldRecheck(null, wifi))
        assertFalse("signal strength / bandwidth only", ConnectionMonitor.shouldRecheck(wifi, wifi.copy()))
        assertTrue("lost validation", ConnectionMonitor.shouldRecheck(wifi, wifi.copy(validated = false)))
        assertTrue("another network", ConnectionMonitor.shouldRecheck(wifi, wifi.copy(network = "101")))
        assertTrue("a VPN came up", ConnectionMonitor.shouldRecheck(wifi, wifi.copy(transports = setOf(1, 4))))
    }
}
