package com.tonihk00.clearplay

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.tonihk00.clearplay.data.api.Album
import com.tonihk00.clearplay.data.api.LyricLine
import com.tonihk00.clearplay.data.api.Lyrics
import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicClient
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.headersOf

/** Canned OpenSubsonic answers shaped like the dev-rig demo library. Nothing touches a real server. */
object FakeServer {
    private data class A(val id: String, val name: String, val artist: String, val year: Int, val genre: String, val songs: List<String>)

    private val albums = listOf(
        A("al1", "Neon Tides", "Mira Vale", 2024, "Synthpop", listOf("Opening", "Afterglow", "Glass Harbour", "Night Bus", "Small Hours", "Lantern", "Tides")),
        A("al2", "Paper Moons", "The Quiet Hours", 2022, "Indie", listOf("Paper Moons", "Weathervane", "Slow Rivers", "Kites", "Low Light", "Hollow")),
        A("al3", "Field Notes", "Oda Lind", 2021, "Folk", listOf("Morning Field", "Ash & Oak", "Northern", "Small Fires", "Home Again")),
        A("al4", "Static Bloom", "Kairo", 2025, "Electronic", listOf("Bloom", "Signal", "Undertow", "Prism", "Static", "Afterimage", "Drift", "Echo Park", "Halo", "Fade Out", "Low Orbit")),
    )

    val songs: List<Song> = albums.flatMap { a ->
        a.songs.mapIndexed { i, t ->
            Song(
                id = "${a.id}-s${i + 1}", title = t, artist = a.artist, artistId = "ar-${a.artist.hashCode()}",
                album = a.name, albumId = a.id, coverArt = a.id, duration = 54 + (i * 37) % 180, track = i + 1,
                year = a.year, genre = a.genre,
                suffix = if (a.id == "al3") "flac" else "mp3", bitRate = if (a.id == "al3") 1411 else 320,
                samplingRate = if (a.id == "al3") 96_000 else 44_100, bitDepth = if (a.id == "al3") 24 else null,
                playCount = (a.songs.size - i) * 7 + a.year % 13, size = 6_000_000L,
                starred = if (i % 3 == 1) "2026-11-01T00:00:00Z" else null, userRating = if (i == 1) 4 else 0,
            )
        }
    }

    val playing: Song = songs[1] // Afterglow

    fun album(id: String): Album {
        val a = albums.first { it.id == id }
        val s = songs.filter { it.albumId == id }
        return Album(a.id, a.name, a.artist, "ar-${a.artist.hashCode()}", a.id, s.size, s.sumOf { it.duration }, a.year, a.genre, null, s)
    }

    val lyrics = Lyrics(
        listOf(
            0L to "Hold the moment, let it linger",
            6_000L to "Нека песента остане тук",
            12_000L to "Neon on the water, slow",
            18_000L to "Every light is coming home",
            24_000L to "Hold the moment, let it linger",
            30_000L to "",
            36_000L to "Afterglow, afterglow",
            42_000L to "Counting colours in the dark",
            48_000L to "Lights are fading on the bay",
            54_000L to "Нека песента остане тук",
            60_000L to "We were dancing in the rain",
            66_000L to "Every signal finds its way",
            72_000L to "Until the morning comes",
            78_000L to "Hold the moment, let it linger",
            84_000L to "Afterglow",
            90_000L to "Afterglow",
        ).map { LyricLine(it.first, it.second) },
    )

    private fun songJson(s: Song) = buildString {
        append("""{"id":"${s.id}","title":"${s.title}","artist":"${s.artist}","artistId":"${s.artistId}","album":"${s.album}","albumId":"${s.albumId}",""")
        append(""""coverArt":"${s.coverArt}","duration":${s.duration},"track":${s.track},"year":${s.year},"genre":"${s.genre}","userRating":${s.userRating}""")
        if (s.starred != null) append(""","starred":"${s.starred}"""")
        append("}")
    }

    private fun albumJson(id: String, withSongs: Boolean): String {
        val a = album(id)
        val base = """"id":"${a.id}","name":"${a.name}","artist":"${a.artist}","artistId":"${a.artistId}","coverArt":"${a.coverArt}","songCount":${a.songCount},"duration":${a.duration},"year":${a.year},"genre":"${a.genre}""""
        return if (withSongs) "{$base,\"song\":[${a.song.joinToString(",") { songJson(it) }}]}" else "{$base}"
    }

    private fun ok(body: String) = """{"subsonic-response":{"status":"ok","version":"1.16.1","openSubsonic":true$body}}"""

    private fun answer(endpoint: String, params: Map<String, String>): String = when (endpoint) {
        "ping" -> ok("")
        "getAlbumList2" -> ok(""","albumList2":{"album":[${albums.joinToString(",") { albumJson(it.id, false) }}]}""")
        "getAlbum" -> ok(""","album":${albumJson(params["id"] ?: "al1", true)}""")
        "getArtists" -> ok(
            ""","artists":{"index":[{"name":"#","artist":[${albums.joinToString(",") { """{"id":"ar-${it.artist.hashCode()}","name":"${it.artist}","albumCount":1,"coverArt":"${it.id}"}""" }}]}]}""",
        )
        "search3" -> ok(
            ""","searchResult3":{"artist":[{"id":"ar-1","name":"Mira Vale","albumCount":1,"coverArt":"al1"}],"album":[${albumJson("al1", false)},${albumJson("al4", false)}],"song":[${songs.take(9).joinToString(",") { songJson(it) }}]}""",
        )
        "getStarred2" -> ok(""","starred2":{"album":[${albumJson("al2", false)}],"song":[${songs.filter { it.starred != null }.joinToString(",") { songJson(it) }}]}""")
        "getPlaylists" -> ok(""","playlists":{"playlist":[{"id":"p1","name":"Late drive","songCount":24,"duration":5400,"coverArt":"al4"},{"id":"p2","name":"Sunday","songCount":12,"duration":2700,"coverArt":"al3"}]}""")
        "getGenres" -> ok(""","genres":{"genre":[{"value":"Electronic","songCount":11,"albumCount":1},{"value":"Synthpop","songCount":7,"albumCount":1},{"value":"Indie","songCount":6,"albumCount":1},{"value":"Folk","songCount":5,"albumCount":1}]}""")
        else -> """{"subsonic-response":{"status":"failed","error":{"code":0,"message":"not faked: $endpoint"}}}"""
    }

    val client: SubsonicClient by lazy {
        val engine = MockEngine { req ->
            val endpoint = req.url.encodedPath.substringAfterLast('/')
            val params = req.url.parameters.names().associateWith { req.url.parameters[it].orEmpty() }
            respond(answer(endpoint, params), headers = headersOf(HttpHeaders.ContentType, "application/json"))
        }
        SubsonicClient(ServerConfig("http://demo.local", "demo", "t", "s"), HttpClient(engine))
    }

    /**
     * Like [client], but [fault] may answer a request instead: given the endpoint and how many
     * times it was asked before (0 the first time), an HTTP status and body, or null for the
     * normal answer.
     */
    fun faultyClient(fault: (endpoint: String, n: Int) -> Pair<Int, String>?): SubsonicClient {
        val asked = HashMap<String, Int>()
        val engine = MockEngine { req ->
            val endpoint = req.url.encodedPath.substringAfterLast('/')
            val params = req.url.parameters.names().associateWith { req.url.parameters[it].orEmpty() }
            val n = synchronized(asked) { asked.getOrDefault(endpoint, 0).also { asked[endpoint] = it + 1 } }
            val f = fault(endpoint, n)
            if (f != null) {
                respond(f.second, io.ktor.http.HttpStatusCode.fromValue(f.first), headersOf(HttpHeaders.ContentType, "application/json"))
            } else {
                respond(answer(endpoint, params), headers = headersOf(HttpHeaders.ContentType, "application/json"))
            }
        }
        return SubsonicClient(ServerConfig("http://demo.local", "demo", "t", "s"), HttpClient(engine))
    }

    /** Gradient "covers" in the demo library's colours. */
    fun cover(id: String): Brush = when (id.take(3)) {
        "al1" -> Brush.linearGradient(listOf(Color(0xFF6D3BD8), Color(0xFFE0479E), Color(0xFFF25AA8)))
        "al2" -> Brush.linearGradient(listOf(Color(0xFF1F3B73), Color(0xFF3E7CB1), Color(0xFFA3C4DC)))
        "al3" -> Brush.linearGradient(listOf(Color(0xFF3C5A3A), Color(0xFF8DA36B), Color(0xFFE3D9B0)))
        else -> Brush.linearGradient(listOf(Color(0xFF0E1B2C), Color(0xFF1B8A8F), Color(0xFFF2B33D)))
    }
}
