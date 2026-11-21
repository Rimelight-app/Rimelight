package com.tonihk00.clearplay

import com.tonihk00.clearplay.data.PendingScrobble
import com.tonihk00.clearplay.data.PlaybackSource
import com.tonihk00.clearplay.data.ScrobbleQueue
import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.data.api.SubsonicException
import com.tonihk00.clearplay.data.api.msUntilNextLine
import com.tonihk00.clearplay.data.api.parseLrc
import com.tonihk00.clearplay.player.SourceRouter
import com.tonihk00.clearplay.ui.player.moved
import com.tonihk00.clearplay.ui.player.queueEntries
import androidx.media3.datasource.DataSource
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.io.IOException

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class V14LogicTest {
    // Playback source ------------------------------------------------------------------

    @Test fun playbackSourceRules() {
        val auto = PlaybackSource.Auto
        assertFalse("auto + online streams", auto.useDownload(downloaded = true, online = true, hasServer = true))
        assertTrue("auto + offline uses the download", auto.useDownload(downloaded = true, online = false, hasServer = true))
        assertFalse("always server, online", PlaybackSource.Server.useDownload(true, true, true))
        assertFalse("always server, even offline", PlaybackSource.Server.useDownload(true, false, true))
        assertTrue("always downloads, online", PlaybackSource.Downloads.useDownload(true, true, true))
        for (s in PlaybackSource.entries) {
            assertFalse("not downloaded always streams ($s)", s.useDownload(false, false, true))
            assertTrue("no server: the download is all there is ($s)", s.useDownload(true, true, false))
        }
    }

    @Test fun routerDecidesAtSongStartAndKeepsItForSeeks() {
        var useDownload = false
        val noop = DataSource.Factory { throw IOException("unused") }
        val r = SourceRouter(noop, noop, { useDownload }, { 1000L })
        assertFalse(r.choose("song:a", 0))
        useDownload = true // e.g. went offline mid-song
        assertFalse("a seek in the same song keeps its source", r.choose("song:a", 50_000))
        assertTrue("the next song decides afresh", r.choose("song:b", 0))
        assertTrue("so does this song started again", r.choose("song:a", 0))
    }

    // Scrobble queue -------------------------------------------------------------------

    private val home = ServerConfig("http://192.168.1.10:4533", "toni", "t", "s")
    private val tailscale = ServerConfig("http://100.64.0.2:4533", "toni", "t", "s")
    private val other = ServerConfig("http://music.example", "someone", "t", "s")

    private fun tmp() = File.createTempFile("scrobbles", ".json").also { it.delete(); it.deleteOnExit() }

    @Test fun queuedListensSurviveARestartAndGoOutOldestFirst() = runBlocking {
        val file = tmp()
        val now = 1_800_000_000_000L
        ScrobbleQueue(file) { now }.apply {
            add(PendingScrobble("s1", now - 3000, home.baseUrl, "toni"))
            add(PendingScrobble("s2", now - 2000, home.baseUrl, "toni"))
        }
        val reopened = ScrobbleQueue(file) { now }
        assertEquals(2, reopened.size)
        val sent = mutableListOf<String>()
        assertEquals(2, reopened.flush(home) { sent += it.id })
        assertEquals(listOf("s1", "s2"), sent)
        assertEquals(0, ScrobbleQueue(file) { now }.size)
    }

    @Test fun sameAccountUnderAnotherAddressGetsTheListens() = runBlocking {
        val q = ScrobbleQueue(tmp())
        q.add(PendingScrobble("s1", 1, home.baseUrl, "toni"))
        q.add(PendingScrobble("x1", 2, other.baseUrl, "someone"))
        val sent = mutableListOf<String>()
        q.flush(tailscale) { sent += it.id }
        assertEquals(listOf("s1"), sent)
        assertEquals(listOf("x1"), q.snapshot().map { it.id })
    }

    @Test fun stopsAtAConnectionErrorAndKeepsTheRest() = runBlocking {
        val q = ScrobbleQueue(tmp())
        listOf("a", "b", "c").forEachIndexed { i, id -> q.add(PendingScrobble(id, i.toLong(), home.baseUrl, "toni")) }
        val sent = q.flush(home) { if (it.id == "b") throw IOException("offline") }
        assertEquals(1, sent)
        assertEquals(listOf("b", "c"), q.snapshot().map { it.id })
    }

    @Test fun aListenTheServerRejectsIsDroppedOnlyAtItsOwnAddress() = runBlocking {
        val q = ScrobbleQueue(tmp())
        q.add(PendingScrobble("gone", 1, home.baseUrl, "toni"))
        q.add(PendingScrobble("elsewhere", 2, other.baseUrl, "toni"))
        q.flush(home) { throw SubsonicException(70, "Not found") }
        assertEquals("rejected at its own address: dropped; other server's: kept", listOf("elsewhere"), q.snapshot().map { it.id })
    }

    @Test fun veryOldListensAreForgotten() {
        val file = tmp()
        val now = 1_800_000_000_000L
        ScrobbleQueue(file) { now }.add(PendingScrobble("old", now - 61L * 24 * 3600 * 1000, home.baseUrl))
        assertEquals(0, ScrobbleQueue(file) { now }.size)
    }

    // Queue reordering -----------------------------------------------------------------

    @Test fun queueKeysStayUniqueWithDuplicatesAndMovesWork() {
        val songs = FakeServer.songs.take(3)
        val q = songs + songs[0]
        val e = queueEntries(q)
        assertEquals(4, e.map { it.key }.toSet().size)
        assertEquals(listOf(0, 1, 2, 3), e.map { it.index })
        val m = e.moved(0, 2)
        assertEquals(listOf(e[1], e[2], e[0], e[3]), m)
        assertEquals(e, e.moved(1, 1))
        assertEquals(e, e.moved(0, 9))
    }

    // Lyrics ---------------------------------------------------------------------------

    @Test fun timeUntilNextLineChange() {
        val lines = parseLrc("[00:01.00]a\n[00:05.00]b")
        assertEquals(850L, msUntilNextLine(lines, 0)) // "a" shows 150 ms early, at 850
        assertEquals(4_850L - 2_000L, msUntilNextLine(lines, 2_000))
        assertNull(msUntilNextLine(lines, 6_000))
    }
}
