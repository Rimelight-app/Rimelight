package com.tonihk00.clearplay

import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.player.Handoff
import com.tonihk00.clearplay.player.QueueHandoff
import com.tonihk00.clearplay.player.QueueHandoff.SaveEvent
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockEngineConfig
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.forms.FormDataContent
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.headersOf
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Collections

/**
 * "Continue on other devices" at run time against a recording fake Navidrome (virtual time):
 * when saves happen, what they carry, the offer, Continue, and "Continued on".
 */
@OptIn(ExperimentalCoroutinesApi::class)
@org.junit.runner.RunWith(org.robolectric.RobolectricTestRunner::class)
@org.robolectric.annotation.Config(sdk = [35])
class HandoffTest {
    /** One recorded request: endpoint, method, URL parameters, form body. */
    private data class Req(val endpoint: String, val method: HttpMethod, val url: Map<String, List<String>>, val form: Map<String, List<String>>)

    /** A fake Navidrome 0.64 that records requests; [queue] / [nowPlaying] are what it answers. */
    private class Server(scope: TestScope, val indexBased: Boolean = true) {
        val calls: MutableList<Req> = Collections.synchronizedList(mutableListOf())
        var queue = ""
        var nowPlaying = ""
        /** getNowPlaying answers after this long (virtual time). */
        var nowPlayingDelayMs = 0L
        val client: SubsonicClient

        init {
            val config = MockEngineConfig().apply {
                dispatcher = StandardTestDispatcher(scope.testScheduler)
                addHandler { req ->
                    val endpoint = req.url.encodedPath.substringAfterLast('/')
                    val url = req.url.parameters.names().associateWith { req.url.parameters.getAll(it).orEmpty() }
                    val form = (req.body as? FormDataContent)?.formData?.let { f -> f.names().associateWith { f.getAll(it).orEmpty() } }.orEmpty()
                    calls += Req(endpoint, req.method, url, form)
                    if (endpoint == "getNowPlaying" && nowPlayingDelayMs > 0) kotlinx.coroutines.delay(nowPlayingDelayMs)
                    val ext = if (indexBased) """{"name":"indexBasedQueue","versions":[1]},{"name":"playbackReport","versions":[1]}""" else """{"name":"playbackReport","versions":[1]}"""
                    val body = when (endpoint) {
                        "getOpenSubsonicExtensions" -> ""","openSubsonicExtensions":[$ext]"""
                        "getPlayQueueByIndex" -> if (queue.isEmpty()) "" else ""","playQueueByIndex":$queue"""
                        "getPlayQueue" -> if (queue.isEmpty()) "" else ""","playQueue":$queue"""
                        "getNowPlaying" -> ""","nowPlaying":{"entry":[$nowPlaying]}"""
                        else -> ""
                    }
                    respond(
                        """{"subsonic-response":{"status":"ok","version":"1.16.1","type":"navidrome","serverVersion":"0.64.2","openSubsonic":true$body}}""",
                        headers = headersOf(HttpHeaders.ContentType, "application/json"),
                    )
                }
            }
            client = SubsonicClient(ServerConfig("http://fake.local", "toni", "t", "s"), HttpClient(MockEngine(config)))
        }

        fun saves() = calls.filter { it.endpoint.startsWith("savePlayQueue") }
    }

    /** The player as Handoff sees it. */
    private class FakePlayer : Handoff.Player {
        var queue: List<Song> = emptyList()
        var index = 0
        var position = 0L
        var playing = false
        var started: Triple<List<Song>, Int, Long>? = null
        var pauses = 0
        /** startQueueAt fails (the controller couldn't start the queue). */
        var failStart = false
        override fun songs() = queue
        override fun currentIndex() = index
        override fun positionMs() = position
        override fun isPlaying() = playing
        override suspend fun startQueueAt(songs: List<Song>, index: Int, positionMs: Long): Boolean {
            if (failStart) return false
            started = Triple(songs, index, positionMs)
            queue = songs; this.index = index; position = positionMs; playing = true
            return true
        }
        override fun pause() { pauses++; playing = false }
    }

    private class Handled : Handoff.HandledStore {
        val map = HashMap<String, String>()
        override fun get(key: String) = map[key]
        override fun set(key: String, value: String) { map[key] = value }
    }

    private val songs = (1..12).map { Song(id = "s$it", title = "Song $it") }
    private val handledStore = Handled()

    private fun TestScope.setup(
        enabled: Boolean = true,
        online: Boolean = true,
        indexBased: Boolean = true,
        now: () -> Long = { 1_800_000_000_000L },
    ): Triple<Server, FakePlayer, Handoff> {
        val server = Server(this, indexBased)
        val player = FakePlayer().apply { queue = songs; index = 3; position = 42_000; playing = true }
        var on = online
        val h = Handoff(backgroundScope, { server.client }, { on }, { enabled }, player, handledStore, now)
        return Triple(server, player, h)
    }

    // ---------------------------------------------------------------- publish

    @Test fun fiveFastSkipsMakeOneSaveFourSecondsAfterTheLast() = runTest {
        val (server, player, h) = setup()
        repeat(5) { i ->
            player.index = 3 + i
            h.songChanged(natural = false)
            runCurrent()
            advanceTimeBy(300)
        }
        // Last skip at 1 200 ms; nothing before 1 200 + 4 000.
        advanceTimeBy(3_500); runCurrent()
        assertEquals(0, server.saves().size)
        advanceTimeBy(1_000); runCurrent()
        assertEquals(1, server.saves().size)
        assertEquals("7", server.saves()[0].form["currentIndex"]!!.single())
    }

    @Test fun pauseSavesOnceAfterHalfASecond() = runTest {
        val (server, player, h) = setup()
        player.playing = false
        h.paused(songChanged = false)
        advanceTimeBy(400); runCurrent()
        assertEquals(0, server.saves().size)
        advanceTimeBy(200); runCurrent()
        assertEquals(1, server.saves().size)
        assertEquals("42000", server.saves()[0].form["position"]!!.single())
    }

    @Test fun offlineSavesNothing() = runTest {
        val (server, _, h) = setup(online = false)
        h.paused(songChanged = false)
        h.songChanged(natural = false)
        advanceTimeBy(10_000); runCurrent()
        assertEquals(0, server.saves().size)
        assertNull("not queued for later either", h.saveNow(SaveEvent.lock)?.also { advanceTimeBy(1_000); runCurrent() }?.let { server.saves().firstOrNull() })
    }

    @Test fun emptyQueueSavesNothing() = runTest {
        val (server, player, h) = setup()
        player.queue = emptyList(); player.index = -1
        h.paused(songChanged = false)
        advanceTimeBy(5_000); runCurrent()
        h.saveNow(SaveEvent.lock); advanceTimeBy(1_000); runCurrent()
        assertEquals(0, server.saves().size)
    }

    @Test fun localCurrentSongSavesNothing() = runTest {
        val (server, player, h) = setup()
        player.queue = songs.take(3) + Song(id = "local:42", title = "Phone song") + songs.drop(3)
        player.index = 3
        h.paused(songChanged = false)
        advanceTimeBy(5_000); runCurrent()
        assertEquals(0, server.saves().size)
    }

    @Test fun settingOffSavesNothing() = runTest {
        val (server, _, h) = setup(enabled = false)
        h.paused(songChanged = false)
        advanceTimeBy(5_000); runCurrent()
        assertEquals(0, server.saves().size)
    }

    @Test fun postBodyCarriesEveryIdAndNoneAreInTheUrl() = runTest {
        val (server, player, h) = setup()
        // 2 500 songs with local ones mixed in, current at 1 510 (end-to-end case 10, on the JVM).
        val big = (0 until 2500).map { i -> if (i % 7 == 6) Song(id = "local:$i") else Song(id = "id-$i-0123456789abcdef0123456789abcdef") }
        player.queue = big; player.index = 1510
        h.saveNow(SaveEvent.lock)
        runCurrent()
        val save = server.saves().single()
        assertEquals(HttpMethod.Post, save.method)
        assertEquals("savePlayQueueByIndex", save.endpoint)
        val expected = QueueHandoff.saveWindow(big.map { QueueHandoff.QueueSong(it.id, it.isLocal) }, 1510)!!
        // 1 000 songs at most: 100 before the current one, the rest after, no filling up from
        // before (here 948, because every 7th song is a phone song and is left out).
        assertEquals(expected.ids, save.form["id"])
        assertEquals(948, save.form["id"]!!.size)
        assertEquals("100", save.form["currentIndex"]!!.single())
        assertTrue(save.form["id"]!!.none { it.startsWith("local:") })
        assertTrue("no ids in the URL", save.url.isEmpty() || "id" !in save.url)
        assertTrue("nothing at all in the URL (login in the body too)", save.url.isEmpty())
        assertEquals("Rimelight-Android", save.form["c"]!!.single())
    }

    @Test fun withoutIndexBasedQueueTheCurrentSongIdIsSent() = runTest {
        val (server, _, h) = setup(indexBased = false)
        h.saveNow(SaveEvent.lock); runCurrent()
        val save = server.saves().single()
        assertEquals("savePlayQueue", save.endpoint)
        assertEquals("s4", save.form["current"]!!.single())
        assertEquals(songs.map { it.id }, save.form["id"])
    }

    @Test fun goingToTheBackgroundSavesAtOnce() = runTest {
        val (server, _, h) = setup()
        h.played(); runCurrent()
        h.saveNow(SaveEvent.lock)
        runCurrent()
        assertEquals(1, server.saves().size)
    }

    @Test fun backgroundWithNothingNewHereDoesntOverwriteTheServer() = runTest {
        val (server, player, h) = setup()
        player.playing = false
        assertNull(h.saveNow(SaveEvent.lock))
        runCurrent()
        assertEquals(0, server.saves().size)
    }

    @Test fun clearingTheQueueDoesntSave() = runTest {
        // QueueWatcher doesn't report a clear as an edit (isQueueCleared); the rule itself:
        assertTrue(QueueHandoff.isQueueCleared(listOf("a", "b", "c"), listOf("b"), "b"))
    }

    // ---------------------------------------------------------------- look, offer, Continue

    private fun queueJson(by: String, changed: String, index: Int = 1, position: Long = 61_000, ids: List<String> = listOf("a", "b", "c", "b", "d")) =
        """{"entry":[${ids.joinToString(",") { """{"id":"$it","title":"Title $it"}""" }}],"currentIndex":$index,"position":$position,"changed":"$changed","changedBy":"$by","username":"toni"}"""

    @Test fun pausedDesktopIsOfferedAndContinueSavesStraightBack() = runTest {
        val (server, player, h) = setup()
        player.playing = false
        server.queue = queueJson("Rimelight", "2026-11-24T18:05:00.250Z", index = 3)
        server.nowPlaying = """{"id":"b","title":"Title b","username":"toni","playerName":"Rimelight","state":"paused","positionMs":90500}"""
        h.look(); runCurrent()
        val offer = h.offer.value
        assertNotNull(offer)
        assertEquals(QueueHandoff.Kind.paused, offer!!.offer.kind)
        assertEquals("Rimelight desktop", offer.offer.device)
        assertEquals("the second copy of b", 3, offer.offer.index)
        assertEquals(90_500L, offer.offer.positionMs)

        assertTrue(h.continueOffer())
        runCurrent()
        assertEquals(Triple(listOf("a", "b", "c", "b", "d"), 3, 90_500L), player.started!!.let { Triple(it.first.map(Song::id), it.second, it.third) })
        val save = server.saves().single()
        assertEquals("3", save.form["currentIndex"]!!.single())
        assertNull(h.offer.value)

        // The server now says Rimelight-Android saved last: nothing offered again.
        server.queue = queueJson("Rimelight-Android", "2026-11-24T18:06:00Z", index = 3)
        player.playing = false
        h.look(); runCurrent()
        assertNull(h.offer.value)
    }

    @Test fun continueHereStartsAtTheLiveSecondOfTheTap() = runTest {
        val (server, player, h) = setup()
        player.playing = false
        server.queue = queueJson("Rimelight", "2026-11-24T18:05:00Z", index = 1)
        server.nowPlaying = """{"id":"b","title":"Title b","username":"toni","playerName":"Rimelight","state":"playing","positionMs":15000}"""
        h.look(); runCurrent()
        assertEquals(QueueHandoff.Kind.playing, h.offer.value!!.offer.kind)
        assertEquals(15_000L, h.offer.value!!.offer.positionMs)
        // The pill stays on screen for a while; the desktop keeps playing.
        server.nowPlaying = """{"id":"b","title":"Title b","username":"toni","playerName":"Rimelight","state":"playing","positionMs":26000}"""
        assertTrue(h.continueOffer())
        assertEquals(1, player.started!!.second)
        assertEquals(26_000L, player.started!!.third)
    }

    @Test fun desktopStillOnClearPlay061IsOfferedAndContinueWorks() = runTest {
        val (server, player, h) = setup()
        player.playing = false
        // A computer not updated yet: ClearPlay desktop 0.6.1 sends c=ClearPlay.
        server.queue = queueJson("ClearPlay", "2026-11-26T18:05:00.250Z", index = 3)
        server.nowPlaying = """{"id":"b","title":"Title b","username":"toni","playerName":"ClearPlay","state":"paused","positionMs":90500}"""
        h.look(); runCurrent()
        val offer = h.offer.value!!.offer
        assertEquals(QueueHandoff.Kind.paused, offer.kind)
        assertEquals("ClearPlay desktop", offer.device)
        assertTrue(
            com.tonihk00.clearplay.ui.player.offerText(offer, System.currentTimeMillis()).text,
            com.tonihk00.clearplay.ui.player.offerText(offer, System.currentTimeMillis()).text.startsWith("Paused on ClearPlay desktop · Title b · "),
        )
        assertEquals("the second copy of b, at the paused second", 3 to 90_500L, offer.index to offer.positionMs)

        assertTrue(h.continueOffer())
        runCurrent()
        assertEquals(Triple(listOf("a", "b", "c", "b", "d"), 3, 90_500L), player.started!!.let { Triple(it.first.map(Song::id), it.second, it.third) })
        val save = server.saves().single()
        assertEquals("the phone saves under its new name", "Rimelight-Android", save.form["c"]!!.single())
        assertEquals("3", save.form["currentIndex"]!!.single())
        assertNull(h.offer.value)
    }

    @Test fun queueThisPhoneSavedAsClearPlayAndroidBeforeTheUpdateIsNotOffered() = runTest {
        val (server, player, h) = setup()
        player.playing = false
        // Saved by this phone on 1.6.0 (c=ClearPlay-Android), read after updating to 1.6.1.
        server.queue = queueJson("ClearPlay-Android", "2026-11-26T18:05:00Z", index = 2)
        server.nowPlaying = """{"id":"c","title":"Title c","username":"toni","playerName":"ClearPlay-Android","state":"paused","positionMs":3000}"""
        h.look(); runCurrent()
        assertNull("its own queue, under its old name: no offer", h.offer.value)
    }

    @Test fun dismissHidesUntilTheServerQueueChanges() = runTest {
        val (server, player, h) = setup()
        player.playing = false
        server.queue = queueJson("Symfonium", "2026-11-24T18:05:00Z")
        h.look(); runCurrent()
        assertEquals(QueueHandoff.Kind.saved, h.offer.value!!.offer.kind)
        h.dismissOffer()
        h.look(); runCurrent()
        assertNull("same changed: still hidden", h.offer.value)
        server.queue = queueJson("Symfonium", "2026-11-24T18:09:00Z")
        h.look(); runCurrent()
        assertNotNull("changed moved on: offered again", h.offer.value)
    }

    @Test fun playingHereHidesTheOfferForGood() = runTest {
        val (server, player, h) = setup()
        player.playing = false
        server.queue = queueJson("Rimelight", "2026-11-24T18:05:00Z")
        h.look(); runCurrent()
        assertNotNull(h.offer.value)
        h.played()
        assertNull(h.offer.value)
        player.playing = false
        h.look(); runCurrent()
        assertNull("handled: not offered again", h.offer.value)
    }

    // ---------------------------------------------------------------- left behind

    @Test fun leftBehindShowsOnceAndBlocksSaves() = runTest {
        val (server, player, h) = setup()
        server.nowPlaying = """{"id":"s5","title":"Song 5","username":"toni","playerName":"Rimelight","state":"playing","positionMs":5000}"""
        server.queue = queueJson("Rimelight", "2026-11-24T18:05:00Z", ids = songs.map { it.id })
        // A song ending by itself: the check runs before that change's save.
        player.index = 4
        h.songChanged(natural = true)
        runCurrent()
        assertEquals("Continued on Rimelight desktop", h.leftBehind.value?.let { "Continued on ${it.device}" })
        advanceTimeBy(6_000); runCurrent()
        assertEquals("no save while the pill shows", 0, server.saves().size)
        // A natural song change doesn't close it, and still doesn't save.
        player.index = 5
        h.songChanged(natural = true); runCurrent()
        advanceTimeBy(6_000); runCurrent()
        assertNotNull(h.leftBehind.value)
        assertEquals(0, server.saves().size)
        // Pause here: pauses, no save.
        h.pauseHere()
        h.paused(songChanged = false)
        advanceTimeBy(2_000); runCurrent()
        assertEquals(1, player.pauses)
        assertEquals(0, server.saves().size)
        assertNull(h.leftBehind.value)
    }

    @Test fun theDeviceThatTookOverSeesNoPill() = runTest {
        val (server, player, h) = setup()
        // The desktop still plays, but this phone saved last (it continued).
        server.nowPlaying = """{"id":"s5","title":"Song 5","username":"toni","playerName":"Rimelight","state":"playing","positionMs":5000}"""
        server.queue = queueJson("Rimelight-Android", "2026-11-24T18:05:00Z", ids = songs.map { it.id })
        h.songChanged(natural = false); runCurrent()
        assertNull(h.leftBehind.value)
        advanceTimeBy(5_000); runCurrent()
        assertEquals(1, server.saves().size)
    }

    @Test fun skipClosesThePillAndSavingResumes() = runTest {
        val (server, player, h) = setup()
        server.nowPlaying = """{"id":"s5","title":"Song 5","username":"toni","playerName":"Rimelight","state":"playing","positionMs":5000}"""
        server.queue = queueJson("Rimelight", "2026-11-24T18:05:00Z", ids = songs.map { it.id })
        h.songChanged(natural = true); runCurrent()
        assertNotNull(h.leftBehind.value)
        // The user skips here.
        server.nowPlaying = ""
        h.songChanged(natural = false); runCurrent()
        assertNull(h.leftBehind.value)
        advanceTimeBy(4_500); runCurrent()
        assertEquals(1, server.saves().size)
    }

    @Test fun neverPausesByItself() = runTest {
        val (server, player, h) = setup()
        server.nowPlaying = """{"id":"s5","title":"Song 5","username":"toni","playerName":"Rimelight","state":"playing","positionMs":5000}"""
        server.queue = queueJson("Rimelight", "2026-11-24T18:05:00Z", ids = songs.map { it.id })
        h.playingChanged(true)
        advanceTimeBy(61_000); runCurrent()
        assertNotNull("the 60 s check found it", h.leftBehind.value)
        advanceTimeBy(300_000); runCurrent()
        assertEquals(0, player.pauses)
        assertTrue(player.playing)
        h.playingChanged(false)
    }

    @Test fun lookAtMostOncePer30sOnForeground() = runTest {
        var clock = 1_000_000L
        val (server, player, h) = setup(now = { clock })
        player.playing = false
        h.lookOnForeground(); runCurrent()
        clock += 10_000
        h.lookOnForeground(); runCurrent()
        assertEquals(1, server.calls.count { it.endpoint == "getPlayQueueByIndex" })
        clock += 25_000
        h.lookOnForeground(); runCurrent()
        assertEquals(2, server.calls.count { it.endpoint == "getPlayQueueByIndex" })
        assertEquals("queue and Now Playing read together", 2, server.calls.count { it.endpoint == "getNowPlaying" })
    }

    // ---------------------------------------------------------------- 1.6.1 section H

    /** The desktop plays s5 from this phone's queue and saved the server's queue last. */
    private fun Server.desktopTookOver() {
        nowPlaying = """{"id":"s5","title":"Song 5","username":"toni","playerName":"Rimelight","state":"playing","positionMs":5000}"""
        queue = queueJson("Rimelight", "2026-11-27T18:05:00Z", ids = songs.map { it.id })
    }

    @Test fun h1LeftBehindThenPauseHereThenBackgroundSendsNothing() = runTest {
        val (server, player, h) = setup()
        h.played() // something happened here: dirty
        server.desktopTookOver()
        player.index = 4
        h.songChanged(natural = true)
        runCurrent()
        assertNotNull("left behind", h.leftBehind.value)
        h.pauseHere()
        assertEquals(1, player.pauses)
        // The app goes to the background right after.
        h.saveNow(SaveEvent.lock)
        advanceTimeBy(10_000); runCurrent()
        assertEquals("the stale queue must not overwrite the device that took over", 0, server.saves().size)
    }

    @Test fun h2PlayingDesktopTookOverNoCheckYetBackgroundSendsNothing() = runTest {
        val (server, player, h) = setup()
        h.played()
        server.desktopTookOver()
        // No left-behind check has run yet (the regular one is every 60 s).
        h.saveNow(SaveEvent.lock)
        advanceTimeBy(10_000); runCurrent()
        assertEquals("checked first: left behind, so nothing is sent", 0, server.saves().size)
        assertEquals("Rimelight desktop", h.leftBehind.value?.device)
        assertTrue(player.playing)
    }

    @Test fun h2CheckSlowerThanTheBudgetSendsNothing() = runTest {
        val (server, player, h) = setup()
        h.played()
        server.desktopTookOver()
        server.nowPlayingDelayMs = Handoff.CHECK_BUDGET_MS + 1_000
        h.saveNow(SaveEvent.lock)
        advanceTimeBy(Handoff.CHECK_BUDGET_MS + 5_000); runCurrent()
        assertEquals("no answer within the budget: no save (the safe side)", 0, server.saves().size)
    }

    @Test fun h2PlayingNobodyTookOverBackgroundSavesOnce() = runTest {
        val (server, player, h) = setup()
        h.played()
        server.nowPlaying = """{"id":"x9","title":"Other","username":"toni","playerName":"Rimelight","state":"playing","positionMs":5000}"""
        server.queue = queueJson("Rimelight-Android", "2026-11-27T18:05:00Z", ids = songs.map { it.id })
        h.saveNow(SaveEvent.lock)
        advanceTimeBy(10_000); runCurrent()
        assertEquals(1, server.saves().size)
        assertNull(h.leftBehind.value)
    }

    @Test fun h3ContinueThatFailsKeepsTheOfferAndSaysTryAgain() = runTest {
        val (server, player, h) = setup()
        player.playing = false
        server.queue = queueJson("Rimelight", "2026-11-27T18:05:00Z", index = 1)
        server.nowPlaying = """{"id":"b","title":"Title b","username":"toni","playerName":"Rimelight","state":"paused","positionMs":9000}"""
        h.look(); runCurrent()
        val offered = h.offer.value
        assertNotNull(offered)
        player.failStart = true
        assertFalse(h.continueOffer())
        runCurrent()
        assertEquals("the offer stays, so Continue can be pressed again", offered, h.offer.value)
        assertTrue("not marked handled", handledStore.map.isEmpty())
        assertEquals(0, server.saves().size)
        assertEquals("Couldn't continue. Try again.", com.tonihk00.clearplay.ui.player.CONTINUE_FAILED)
        // Pressed again, and it works now.
        player.failStart = false
        assertTrue(h.continueOffer())
        runCurrent()
        assertNull(h.offer.value)
        assertEquals(1, server.saves().size)
    }

    @Test fun nanosecondChangedIsComparedAsAnInstant() {
        assertFalse(QueueHandoff.isLater("2026-11-24T23:00:35.363346236Z", "2026-11-24T23:00:35.363Z"))
        assertTrue(QueueHandoff.isLater("2026-11-24T23:00:35.364Z", "2026-11-24T23:00:35.363346236Z"))
        assertFalse(QueueHandoff.isLater("2026-11-24T20:05:00.25+02:00", "2026-11-24T18:05:00.250Z"))
    }
}
