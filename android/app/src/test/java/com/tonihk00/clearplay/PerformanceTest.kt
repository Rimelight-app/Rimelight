package com.tonihk00.clearplay

import com.tonihk00.clearplay.data.LibraryCache
import com.tonihk00.clearplay.data.api.Album
import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.data.api.SubsonicException
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.headersOf
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.builtins.ListSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.lang.management.ManagementFactory
import java.nio.file.Files

/** Section E: the library cache on disk and one-pass JSON decoding. */
class PerformanceTest {
    private val dir = Files.createTempDirectory("library").toFile()
    private val a = ServerConfig("http://home:4533", "toni", "t", "s")
    private val b = ServerConfig("http://home:4533", "guest", "t", "s")
    private val albums = FakeServer.songs.groupBy { it.albumId }.keys.map { FakeServer.album(it!!).copy(song = emptyList()) }
    private val ser = ListSerializer(Album.serializer())

    // ---------------------------------------------------------------- LibraryCache

    @Test fun libraryCacheRoundTrip() {
        val cache = LibraryCache(dir)
        cache.write(a, "albums-alphabeticalByName", ser, albums, "0.64.2 (10114574)")
        assertEquals(albums, cache.read(a, "albums-alphabeticalByName", ser, "0.64.2 (10114574)"))
        assertEquals("version not known yet (before the first answer): still shown", albums, cache.read(a, "albums-alphabeticalByName", ser, null))
        assertNull(cache.read(a, "artists", ser, null))
    }

    @Test fun libraryCacheIsPerServerAccount() {
        val cache = LibraryCache(dir)
        cache.write(a, "albums", ser, albums, "0.64.2")
        assertNull(cache.read(b, "albums", ser, "0.64.2"))
        assertNull(cache.read(a.copy(url = "http://elsewhere:4533"), "albums", ser, "0.64.2"))
        cache.write(b, "albums", ser, albums.take(1), "0.64.2")
        assertEquals(albums, cache.read(a, "albums", ser, "0.64.2"))
        assertEquals(albums.take(1), cache.read(b, "albums", ser, "0.64.2"))
    }

    @Test fun libraryCacheClearedOnSignOutAndClearCache() {
        val cache = LibraryCache(dir)
        cache.write(a, "albums", ser, albums, "0.64.2")
        cache.write(b, "albums", ser, albums, "0.64.2")
        cache.clear(a) // sign-out / server switch: that account's lists go
        assertNull(cache.read(a, "albums", ser, "0.64.2"))
        assertEquals(albums, cache.read(b, "albums", ser, "0.64.2"))
        cache.clearAll() // Settings → Clear cache
        assertNull(cache.read(b, "albums", ser, "0.64.2"))
        assertEquals(0L, cache.size())
    }

    @Test fun libraryCacheIgnoredAfterServerVersionChange() {
        val cache = LibraryCache(dir)
        cache.write(a, "albums", ser, albums, "0.63.1 (abc)")
        // Navidrome 0.64 gave everything new 128-bit ids: the old lists must not show.
        assertNull(cache.read(a, "albums", ser, "0.64.2 (10114574)"))
        assertNull("and they are gone for good", cache.read(a, "albums", ser, null))
        cache.write(a, "albums", ser, albums.take(2), "0.64.2 (10114574)")
        assertEquals(albums.take(2), cache.read(a, "albums", ser, "0.64.2 (10114574)"))
    }

    @Test fun libraryCacheStaysSmall() {
        val cache = LibraryCache(dir, maxBytes = 20_000)
        val big = (0 until 60).map { Album(id = "al$it", name = "A long album name number $it".repeat(3), artist = "Artist $it") }
        repeat(10) { cache.write(a, "list$it", ser, big, "v") }
        assertTrue(cache.size() <= 20_000 + 200)
        assertEquals("the newest list is kept", big, cache.read(a, "list9", ser, "v"))
    }

    // ---------------------------------------------------------------- typed decoding

    private fun legacy(c: SubsonicClient) = c.also { it.typedDecoding = false }
    private fun typed(c: SubsonicClient) = c.also { it.typedDecoding = true }

    @Test fun typedDecodingGivesTheSameObjectsAsTheGenericPath() = runBlocking {
        val c = FakeServer.client
        try {
            val generic = legacy(c).let { listOf(it.albumList(), it.album("al3"), it.search("x"), it.songs(500, 0), it.starred()) }
            val oneShot = typed(c).let { listOf(it.albumList(), it.album("al3"), it.search("x"), it.songs(500, 0), it.starred()) }
            assertEquals(generic, oneShot)
            assertTrue((oneShot[0] as List<*>).isNotEmpty() && (oneShot[3] as List<*>).isNotEmpty())
        } finally {
            c.typedDecoding = true
        }
    }

    @Test fun typedDecodingThrowsTheSameErrorForStatusFailed() = runBlocking {
        val c = FakeServer.client
        fun errorOf(block: suspend () -> Unit): Pair<Int, String> = try {
            runBlocking { block() }; fail("expected a SubsonicException"); error("")
        } catch (e: SubsonicException) {
            e.code to e.message
        }
        try {
            // getPlaylist isn't faked: the fake server answers status="failed", code 0.
            val generic = errorOf { legacy(c).playlist("p1") }
            val oneShot = errorOf { typed(c).playlist("p1") }
            assertEquals(generic, oneShot)
            assertEquals(0 to "not faked: getPlaylist", oneShot)
        } finally {
            c.typedDecoding = true
        }
    }

    @Test fun singleObjectInsteadOfAListFallsBackToTheGenericPath() = runBlocking {
        // Old Subsonic JSON: one album as an object, not a list.
        val engine = MockEngine {
            respond(
                """{"subsonic-response":{"status":"ok","albumList2":{"album":{"id":"x","name":"Only one"}}}}""",
                headers = headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val c = SubsonicClient(a, HttpClient(engine))
        assertEquals(listOf(Album(id = "x", name = "Only one")), c.albumList())
    }

    /**
     * Statistics reads every song in pages of 500 (search3). Time and memory allocated to decode
     * pages shaped like Navidrome 0.64's (every field it sends), generic path vs one pass.
     * Printed for the changelog; the one-pass path must not allocate more.
     */
    @Test fun statisticsPageDecodeCost() = runBlocking {
        val page = navidromePage(500)
        val engine = MockEngine { respond(page, headers = headersOf(HttpHeaders.ContentType, "application/json")) }
        val c = SubsonicClient(a, HttpClient(engine))
        val threads = ManagementFactory.getThreadMXBean() as com.sun.management.ThreadMXBean
        suspend fun measure(typedOn: Boolean, rounds: Int): Pair<Double, Double> {
            c.typedDecoding = typedOn
            repeat(5) { c.songs(500, 0) } // warm up
            val t0 = System.nanoTime()
            // Allocations of every thread (the one-pass decode runs on an IO thread).
            fun allocated(): Long {
                val ids = threads.allThreadIds
                return threads.getThreadAllocatedBytes(ids).filter { it > 0 }.sum()
            }
            var bytes = 0L
            repeat(rounds) {
                val before = allocated()
                val songs = c.songs(500, 0)
                bytes += allocated() - before
                check(songs.size == 500)
            }
            return (System.nanoTime() - t0) / 1e6 / rounds to bytes / 1024.0 / 1024.0 / rounds
        }
        val generic = measure(false, 30)
        val oneShot = measure(true, 30)
        println("Statistics page (500 songs, ${page.length / 1024} KB JSON): generic %.1f ms, %.2f MB allocated; one pass %.1f ms, %.2f MB".format(generic.first, generic.second, oneShot.first, oneShot.second))
        println("A 25 000-song library (50 pages): generic ≈ %.0f ms / %.0f MB, one pass ≈ %.0f ms / %.0f MB".format(generic.first * 50, generic.second * 50, oneShot.first * 50, oneShot.second * 50))
        assertTrue("one pass must not allocate more", oneShot.second <= generic.second)
    }

    private fun navidromePage(n: Int) = buildString {
        append("""{"subsonic-response":{"status":"ok","version":"1.16.1","type":"navidrome","serverVersion":"0.64.2 (10114574)","openSubsonic":true,"searchResult3":{"song":[""")
        for (i in 0 until n) {
            if (i > 0) append(',')
            append(
                """{"id":"4f8GZz9zWcszLyxVyDGO${i.toString().padStart(4, '0')}","parent":"3l3es2B9O7Ri9w8tMEEqg3","isDir":false,"title":"Song number $i","album":"Album ${i / 12}","artist":"Artist ${i / 40}",""" +
                    """"track":${i % 12 + 1},"year":20${10 + i % 15},"genre":"Rock","coverArt":"al-3l3es2B9O7Ri9w8tMEEqg3_1706e04b101abb5b","size":${8_000_000 + i},"contentType":"audio/flac","suffix":"flac",""" +
                    """"duration":${180 + i % 120},"bitRate":${900 + i % 100},"path":"Artist/Album/Song $i.flac","playCount":${i % 9},"played":"2026-11-20T10:00:00Z","created":"2026-11-24T23:00:26.971504972Z",""" +
                    """"albumId":"3l3es2B9O7Ri9w8tMEEqg3","artistId":"4wNOpkO5NPQ56CJTJ878n1","type":"music","bpm":0,"comment":"","sortName":"song number $i","mediaType":"song","musicBrainzId":"",""" +
                    """"isrc":[],"genres":[{"name":"Rock"}],"replayGain":{"trackGain":-6.5,"albumGain":-7.1,"trackPeak":0.98,"albumPeak":0.99},"channelCount":2,"samplingRate":44100,"bitDepth":16,"moods":[],""" +
                    """"artists":[{"id":"4wNOpkO5NPQ56CJTJ878n1","name":"Artist ${i / 40}"}],"displayArtist":"Artist ${i / 40}","albumArtists":[{"id":"4wNOpkO5NPQ56CJTJ878n1","name":"Artist ${i / 40}"}],""" +
                    """"displayAlbumArtist":"Artist ${i / 40}","contributors":[],"displayComposer":"","explicitStatus":"","groupings":[],"works":[],"movements":[]}""",
            )
        }
        append("]}}}")
    }
}
