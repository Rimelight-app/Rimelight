package com.tonihk00.clearplay

import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.data.api.activeLine
import com.tonihk00.clearplay.data.api.parseLrc
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LogicTest {
    @Test fun lrcParsesStampsFractionsAndRepeats() {
        val lines = parseLrc("[ar:Mira]\n[00:01.5]one\n[00:03.25][00:10.00]two\n[01:02:120]three")
        assertEquals(listOf(1500L, 3250L, 10_000L, 62_120L), lines.map { it.timeMs })
        assertEquals(listOf("one", "two", "two", "three"), lines.map { it.text })
    }

    @Test fun activeLineShowsLineSlightlyEarly() {
        val lines = parseLrc("[00:01.00]a\n[00:05.00]b")
        assertEquals(-1, activeLine(lines, 0))
        assertEquals(0, activeLine(lines, 900)) // 150 ms early
        assertEquals(0, activeLine(lines, 4_800))
        assertEquals(1, activeLine(lines, 4_900))
    }

    @Test fun tokenAuthNeverStoresPassword() {
        val c = ServerConfig.fromPassword("192.168.1.10:4533/", " me ", "secret")
        assertEquals("http://192.168.1.10:4533", c.baseUrl)
        assertEquals("me", c.user)
        assertEquals(ServerConfig.md5("secret" + c.salt), c.token)
        assertNotEquals("secret", c.token)
        assertTrue(!c.toString().contains("secret"))
    }

    @Test fun fakeServerRoundTrip() = runBlocking {
        val a = FakeServer.client.album("al1")
        assertEquals("Neon Tides", a.name)
        assertEquals(7, a.song.size)
        assertEquals(4, FakeServer.client.genres().size)
        val url = FakeServer.client.streamUrl("x", 320)
        assertTrue(url.contains("/rest/stream?") && url.contains("maxBitRate=320") && !url.contains("p="))
    }

    @Test fun errorsNeverShowTheTokenUrl() {
        val msg = com.tonihk00.clearplay.ui.login.friendlyError(
            io.ktor.client.network.sockets.ConnectTimeoutException("Connect timeout has expired [url=http://x/rest/ping?u=a&t=secret]"),
        )
        assertTrue(!msg.contains("t=") && !msg.contains("http"))
        assertEquals("Wrong username or password.", com.tonihk00.clearplay.ui.login.friendlyError(com.tonihk00.clearplay.data.api.SubsonicException(40, "Wrong username or password")))
    }

    @Test fun offlineLibraryBuildsAlbumsArtistsSearch() = runBlocking {
        val lib = com.tonihk00.clearplay.data.api.OfflineLibrary(FakeServer.songs)
        val albums = lib.albumList("alphabeticalByName", 60, 0, null)
        assertEquals(listOf("Field Notes", "Neon Tides", "Paper Moons", "Static Bloom"), albums.map { it.name })
        val neon = lib.album("al1")
        assertEquals((1..7).toList(), neon.song.map { it.track })
        assertEquals(4, lib.artists().size)
        assertTrue(lib.search("glass").songs.any { it.title == "Glass Harbour" })
        assertEquals("Electronic", lib.genres().first().value)
        assertTrue(!lib.isRemote)
    }
}
