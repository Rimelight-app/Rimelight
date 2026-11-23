package com.tonihk00.clearplay

import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.data.stats.StatsRepository
import com.tonihk00.clearplay.data.stats.StatsStore
import com.tonihk00.clearplay.data.stats.computeStats
import com.tonihk00.clearplay.data.stats.fetchAllSongs
import com.tonihk00.clearplay.data.stats.fmtBytes
import com.tonihk00.clearplay.data.stats.fmtHours
import com.tonihk00.clearplay.data.stats.fmtInt
import com.tonihk00.clearplay.player.Scrobbler
import com.tonihk00.clearplay.player.toMediaItem
import com.tonihk00.clearplay.ui.settings.AboutInfo
import com.tonihk00.clearplay.ui.settings.debugInfo
import com.tonihk00.clearplay.ui.settings.licenceSummary
import com.tonihk00.clearplay.ui.settings.serverLabel
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockEngineConfig
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.headersOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.lang.reflect.Proxy
import java.util.Collections

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
@OptIn(ExperimentalCoroutinesApi::class)
class V153Test {

    // 4. Statistics: the desktop formula ---------------------------------------------------

    /**
     * The fixture as the server sends it: "c" has no duration field, "b" was never played,
     * "d" has no genre or year. Expected values worked out by hand from the desktop's
     * computeStats / fmtHours (src/utils/libraryStats.ts).
     */
    private val fixture: List<Song> = Json { ignoreUnknownKeys = true }.decodeFromString(
        """[
        {"id":"a","title":"A","album":"Octane","albumId":"al1","artist":"R1","artistId":"ar1","duration":200,"playCount":3,"suffix":"flac","size":1000,"genre":"Rock","year":1994},
        {"id":"b","title":"B","album":"Octane","albumId":"al1","artist":"R1","artistId":"ar1","duration":100,"playCount":0,"suffix":"flac","size":500,"genre":"Rock","year":1994},
        {"id":"c","title":"C","album":"Other","albumId":"al2","artist":"R2","artistId":"ar2","playCount":5,"suffix":"mp3","size":300,"genre":"Pop","year":2021},
        {"id":"d","title":"D","album":"Other","albumId":"al2","artist":"R2","artistId":"ar2","duration":3600,"playCount":1,"suffix":"mp3","size":200}
        ]""",
    )

    @Test fun statsMatchTheDesktopFormula() {
        val s = computeStats(fixture)
        assertEquals(4, s.songs)
        assertEquals("plays = sum of playCount", 9, s.plays)
        assertEquals("duration × playCount per song; a missing duration counts 0", 200L * 3 + 0 * 5 + 3600 * 1, s.listenSeconds)
        assertEquals("1.2 h", fmtHours(s.listenSeconds)) // 4200 s = 1.1667 h
        assertEquals(3, s.songsPlayed)
        assertEquals("3 of 4 played", 75, s.discoveredPercent)
        assertEquals(3900L, s.librarySeconds)
        assertEquals("1.1 h", fmtHours(s.librarySeconds))
        assertEquals(2, s.albums)
        assertEquals(2, s.artists)
        assertEquals(2000L, s.libraryBytes)
        assertEquals(0.5f, s.losslessShare)
        assertEquals(listOf("FLAC" to 2, "MP3" to 2), s.formats)
        assertEquals("most plays first", listOf("al2" to 6, "al1" to 3), s.topAlbums.map { it.key to it.plays })
        assertEquals("longest listening first", listOf("ar2" to 3600L, "ar1" to 600L), s.topArtists.map { it.key to it.seconds })
        assertEquals(listOf("Rock", "Pop"), s.topGenres.map { it.key })
        assertEquals(listOf("1990s", "2020s"), s.decades.map { it.key })
        assertEquals(listOf("c", "a", "d"), s.topSongs.map { it.id })
    }

    @Test fun displayRoundingMatchesTheDesktop() {
        assertEquals("26 min", fmtHours(26 * 60))
        assertEquals("59 min", fmtHours(3540))
        assertEquals("1.0 h", fmtHours(3600))
        assertEquals("99.9 h", fmtHours(359_640))
        assertEquals("100 h", fmtHours(360_000))
        assertEquals("rounded, not cut (Android before 1.5.3 showed 141)", "142 h", fmtHours(141 * 3600 + 2700))
        assertEquals("1 234 h", fmtHours(1234L * 3600))
        assertEquals("1 234 567", fmtInt(1_234_567))
        assertEquals("1.5 GB", fmtBytes(1_610_612_736))
        assertEquals("300 MB", fmtBytes(300L * 1024 * 1024))
        // Discovered rounds to the nearest percent (Android before 1.5.3 cut it: 66 %, 12 %).
        assertEquals(67, computeStats(listOf(song("x", 1), song("y", 1), song("z", 0))).discoveredPercent)
        assertEquals(13, computeStats(List(8) { song("s$it", if (it == 0) 1 else 0) }).discoveredPercent)
    }

    private fun song(id: String, plays: Int, duration: Int = 180, album: String = "al", artist: String = "ar") =
        Song(id = id, title = id, albumId = album, artistId = artist, duration = duration, playCount = plays, suffix = "flac", size = 10)

    @Test fun pagingCoversALibraryOver500AndDropsDuplicateIds() = runBlocking {
        // 1 203 songs: pages of 500, 500, 203. Song 700 repeats song 100's ID (keeps the first copy).
        val library = List(1203) { i ->
            song(if (i == 700) "s100" else "s$i", plays = i % 4, duration = if (i == 5) 0 else 180 + i % 60, album = "al${i / 10}", artist = "ar${i / 50}")
        }
        val asked = Collections.synchronizedList(mutableListOf<Int>())
        val progress = mutableListOf<Int>()
        val all = fetchAllSongs({ offset -> asked += offset; library.drop(offset).take(500) }, progress::add)
        assertEquals("four pages at once, then stop at the short one", listOf(0, 500, 1000, 1500), asked.sorted())
        assertEquals(listOf(1203), progress)
        assertEquals(1202, all.size)
        assertEquals(100 % 4, all.first { it.id == "s100" }.playCount)

        val s = computeStats(all)
        val unique = library.filterIndexed { i, _ -> i != 700 }
        assertEquals(1202, s.songs)
        assertEquals(unique.sumOf { it.playCount }, s.plays)
        assertEquals(unique.sumOf { it.duration.toLong() * it.playCount }, s.listenSeconds)
        assertEquals(unique.count { it.playCount > 0 }, s.songsPlayed)
        assertEquals(Math.round(unique.count { it.playCount > 0 } * 100.0 / 1202).toInt(), s.discoveredPercent)
        assertEquals(unique.sumOf { it.duration.toLong() }, s.librarySeconds)
        assertEquals(121, s.albums)
        assertEquals(25, s.artists)
    }

    // 1. Statistics offline: the saved snapshot ------------------------------------------

    private val server = ServerConfig("http://192.168.1.10:4533", "toni", "t", "s")

    @Test fun offlineShowsTheSavedSnapshotExactly() = runBlocking {
        val dir = File.createTempFile("stats", "").also { it.delete(); it.mkdirs(); it.deleteOnExit() }
        var clock = 1_700_000_000_000L
        val online = StatsRepository(StatsStore(dir), CoroutineScope(coroutineContext), now = { clock })
        val fetched = online.refresh(server) { offset -> if (offset == 0) fixture else emptyList() }.await()
        assertEquals(computeStats(fixture), fetched.stats)

        // App restarted offline: a fresh repository reads the file, nothing is fetched.
        clock += 3 * 3_600_000L
        val offline = StatsRepository(StatsStore(dir), CoroutineScope(coroutineContext), now = { clock })
        val shown = offline.saved(server)!!
        assertEquals("every tile and list, unchanged", fetched, shown)
        assertEquals(1_700_000_000_000L, shown.fetchedAt)
        assertTrue("old enough to refetch once online", offline.isStale(shown))

        // Next online load replaces the snapshot (no leftovers from the old one).
        val fewer = listOf(fixture[0])
        val replaced = offline.refresh(server) { offset -> if (offset == 0) fewer else emptyList() }.await()
        assertEquals(computeStats(fewer), StatsRepository(StatsStore(dir), CoroutineScope(coroutineContext)).saved(server)!!.stats)
        assertEquals(replaced, offline.saved(server))
        assertNull("other accounts have their own", offline.saved(server.copy(user = "someone")))
    }

    // 2. Now Playing through reportPlayback ----------------------------------------------

    /** A server that records every request; [extensions] decides what it says it supports. */
    private class RecordingServer(scope: TestScope, extensions: List<String>) {
        val calls = Collections.synchronizedList(mutableListOf<Pair<String, Map<String, String>>>())
        val client: SubsonicClient

        init {
            val ext = extensions.joinToString(",") { """{"name":"$it","versions":[1]}""" }
            val config = MockEngineConfig().apply {
                dispatcher = StandardTestDispatcher(scope.testScheduler)
                addHandler { req ->
                    val endpoint = req.url.encodedPath.substringAfterLast('/')
                    val p = req.url.parameters.names().associateWith { req.url.parameters[it].orEmpty() }
                    calls += endpoint to p
                    val extra = if (endpoint == "getOpenSubsonicExtensions") ""","openSubsonicExtensions":[$ext]""" else ""
                    respond(
                        """{"subsonic-response":{"status":"ok","version":"1.16.1","type":"navidrome","serverVersion":"0.64.2 (test)","openSubsonic":true$extra}}""",
                        headers = headersOf(HttpHeaders.ContentType, "application/json"),
                    )
                }
            }
            client = SubsonicClient(ServerConfig("http://fake.local", "demo", "t", "s"), HttpClient(MockEngine(config)))
        }

        fun reports() = calls.filter { it.first == "reportPlayback" }.map { it.second }
        fun states() = reports().map { it["state"] }
        fun scrobbles(submission: Boolean) = calls.count { it.first == "scrobble" && it.second["submission"] == submission.toString() }
    }

    /** Just enough of a Media3 player for the scrobbler: state the test sets by hand. */
    private class FakePlayer {
        var playing = false
        var state = Player.STATE_READY
        var playWhenReady = false
        var position = 0L
        val player: Player = Proxy.newProxyInstance(Player::class.java.classLoader, arrayOf(Player::class.java)) { _, m, _ ->
            when (m.name) {
                "isPlaying" -> playing
                "getPlaybackState" -> state
                "getPlayWhenReady" -> playWhenReady
                "getPlaybackSuppressionReason" -> Player.PLAYBACK_SUPPRESSION_REASON_NONE
                "getCurrentPosition" -> position
                "getDuration" -> 200_000L
                "getPlaybackParameters" -> PlaybackParameters.DEFAULT
                "hashCode" -> 1
                "equals" -> false
                else -> when (m.returnType) {
                    java.lang.Boolean.TYPE -> false
                    Integer.TYPE -> 0
                    java.lang.Long.TYPE -> 0L
                    java.lang.Float.TYPE -> 0f
                    else -> null
                }
            }
        } as Player
    }

    private fun TestScope.scrobbler(server: RecordingServer, fake: FakePlayer, online: () -> Boolean = { true }) =
        Scrobbler(
            fake.player, backgroundScope, client = { server.client },
            enabled = { true }, online = online,
            // The real queue sends at once when online; here straight to the fake server.
            submit = { id, at, _ -> backgroundScope.launch { server.client.scrobble(id, submission = true, timeMs = at) } },
            shutdownScope = { backgroundScope },
        )

    private val item = Song(id = "s1", title = "Song", duration = 200).toMediaItem(null)

    /** Start → play → pause (reported twice by Android) → resume → play to the end. */
    private fun TestScope.playOneSong(s: Scrobbler, fake: FakePlayer) {
        s.onMediaItemTransition(item, Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED)
        fake.playWhenReady = true; fake.playing = true
        s.onIsPlayingChanged(true)
        advanceTimeBy(65_000); runCurrent()
        fake.position = 65_000; fake.playWhenReady = false; fake.playing = false
        s.onIsPlayingChanged(false)
        s.onIsPlayingChanged(false) // e.g. lock screen + audio focus: still one "paused"
        advanceTimeBy(10_000); runCurrent()
        fake.playWhenReady = true; fake.playing = true
        s.onIsPlayingChanged(true)
        advanceTimeBy(140_000); runCurrent()
        fake.position = 200_000; fake.state = Player.STATE_ENDED; fake.playing = false
        s.onPlaybackStateChanged(Player.STATE_ENDED)
        s.onIsPlayingChanged(false)
        runCurrent()
    }

    @Test fun pauseAndResumeReachNowPlayingAndOnePlayIsCounted() = runTest {
        val server = RecordingServer(this, listOf("songLyrics", "playbackReport"))
        val fake = FakePlayer()
        playOneSong(scrobbler(server, fake), fake)

        val states = server.states()
        assertEquals("starting", states.first())
        assertEquals("paused is sent once", 1, states.count { it == "paused" })
        val paused = states.indexOf("paused")
        assertEquals("resume sends playing", "playing", states[paused + 1])
        assertEquals("stopped at the end, once", "stopped", states.last())
        assertEquals(1, states.count { it == "stopped" })
        assertTrue("position updates every 30 s while playing", states.count { it == "playing" } >= 4)
        assertEquals("65000", server.reports()[paused]["positionMs"])
        server.reports().forEach {
            assertEquals("never counts a play", "true", it["ignoreScrobble"])
            assertEquals("song", it["mediaType"])
            assertEquals("s1", it["mediaId"])
            assertEquals("1.0", it["playbackRate"])
        }
        assertEquals("one finished song = one play", 1, server.scrobbles(submission = true))
        assertEquals("no old-style now playing when reportPlayback works", 0, server.scrobbles(submission = false))
    }

    @Test fun seekReportsTheNewPosition() = runTest {
        val server = RecordingServer(this, listOf("playbackReport"))
        val fake = FakePlayer()
        val s = scrobbler(server, fake)
        s.onMediaItemTransition(item, Player.MEDIA_ITEM_TRANSITION_REASON_AUTO)
        fake.playWhenReady = true; fake.playing = true
        s.onIsPlayingChanged(true)
        runCurrent()
        val before = server.reports().size
        fun pos(ms: Long) = Player.PositionInfo(null, 0, null, null, 0, ms, ms, -1, -1)
        s.onPositionDiscontinuity(pos(10_000), pos(90_000), Player.DISCONTINUITY_REASON_SEEK)
        runCurrent()
        val after = server.reports().drop(before)
        assertEquals(listOf("playing" to "90000"), after.map { it["state"] to it["positionMs"] })
        // Back to the start of the same song: a new session.
        s.onPositionDiscontinuity(pos(90_000), pos(0), Player.DISCONTINUITY_REASON_SEEK)
        runCurrent()
        assertEquals(listOf("starting", "playing"), server.states().takeLast(2))
    }

    @Test fun olderServersKeepTheOldNowPlaying() = runTest {
        val server = RecordingServer(this, listOf("songLyrics"))
        val fake = FakePlayer()
        playOneSong(scrobbler(server, fake), fake)
        assertTrue(server.reports().isEmpty())
        assertEquals("now playing once, as before", 1, server.scrobbles(submission = false))
        assertEquals(1, server.scrobbles(submission = true))
    }

    @Test fun offlineSendsNoPlaybackReports() = runTest {
        val server = RecordingServer(this, listOf("playbackReport"))
        val fake = FakePlayer()
        playOneSong(scrobbler(server, fake, online = { false }), fake)
        assertTrue("nothing live is sent or queued", server.reports().isEmpty())
        assertEquals(0, server.scrobbles(submission = false))
        // The finished listen itself still goes to the scrobble queue (unchanged behaviour).
        assertEquals(1, server.scrobbles(submission = true))
    }

    @Test fun serviceShutdownEndsTheSession() = runTest {
        val server = RecordingServer(this, listOf("playbackReport"))
        val fake = FakePlayer()
        val s = scrobbler(server, fake)
        s.onMediaItemTransition(item, Player.MEDIA_ITEM_TRANSITION_REASON_AUTO)
        fake.playWhenReady = true; fake.playing = true
        s.onIsPlayingChanged(true)
        runCurrent()
        fake.position = 42_000
        s.release()
        runCurrent()
        assertEquals("stopped" to "42000", server.reports().last().let { it["state"] to it["positionMs"] })
    }

    // 3. About ---------------------------------------------------------------------------

    @Test fun aboutTexts() {
        assertEquals("Navidrome 0.64.2 (10114574)", serverLabel("navidrome", "0.64.2 (10114574)"))
        assertNull(serverLabel("navidrome", null))
        val licenceFile = File("src/main/assets/licenses").listFiles()!!.single { it.name.startsWith("ClearPlay-") }
        assertEquals("MIT licence · Copyright (c) 2026 Victor Alves", licenceSummary(licenceFile.name, licenceFile.readText()))
        val info = debugInfo(AboutInfo("1.5.3", 58, "Navidrome 0.64.2 (x)", null), "15", 35, "samsung", "SM-S921B")
        assertEquals("ClearPlay 1.5.3 (build 58)\nAndroid 15 (API 35)\nDevice: samsung SM-S921B\nServer: Navidrome 0.64.2 (x)", info)
        assertFalse(info.contains("http") || info.contains("toni"))
        assertTrue(debugInfo(AboutInfo("1.5.3", 58, null, null), "15", 35, "g", "p").endsWith("Server: offline"))
    }
}
