package com.tonihk00.clearplay.data.api

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * A saved server. Only the Subsonic token (md5(password + salt)) and its salt are
 * kept, never the password itself.
 */
@kotlinx.serialization.Serializable
data class ServerConfig(
    val url: String,
    val user: String,
    val token: String,
    val salt: String,
    val name: String = "",
) {
    val baseUrl get() = url.trimEnd('/')

    companion object {
        fun fromPassword(url: String, user: String, password: String, name: String = ""): ServerConfig {
            val salt = randomSalt()
            return ServerConfig(normalizeUrl(url), user.trim(), md5(password + salt), salt, name)
        }

        fun normalizeUrl(raw: String): String {
            val u = raw.trim().trimEnd('/')
            return if (u.startsWith("http://") || u.startsWith("https://")) u else "http://$u"
        }

        private fun randomSalt(): String {
            val bytes = ByteArray(8).also { SecureRandom().nextBytes(it) }
            return bytes.joinToString("") { "%02x".format(it) }
        }

        fun md5(s: String): String =
            MessageDigest.getInstance("MD5").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
    }
}

/** OpenSubsonic client. All calls are suspend and throw [SubsonicException] on API errors. */
class SubsonicClient(val server: ServerConfig, private val http: HttpClient = defaultHttp) : MusicLibrary {
    override val isRemote = true

    private fun authQuery(): String =
        "u=${enc(server.user)}&t=${server.token}&s=${server.salt}&v=$API_VERSION&c=$CLIENT"

    /** URL usable outside Ktor (ExoPlayer, Coil). */
    fun url(endpoint: String, vararg params: Pair<String, Any?>): String {
        val extra = params.filter { it.second != null }
            .joinToString("") { "&${it.first}=${enc(it.second.toString())}" }
        return "${server.baseUrl}/rest/$endpoint?${authQuery()}$extra"
    }

    /**
     * [format] only applies with a bitrate cap: Navidrome transcodes songs above the cap.
     * Without a cap it asks for `format=raw`, so the server always sends the original file
     * (a per-player transcoding rule in Navidrome can't sneak in a conversion).
     */
    fun streamUrl(songId: String, maxBitRate: Int = 0, format: String? = null): String =
        if (maxBitRate > 0) url("stream", "id" to songId, "maxBitRate" to maxBitRate, "format" to format)
        else url("stream", "id" to songId, "format" to "raw")

    fun coverUrl(coverArt: String?, size: Int = 300): String? =
        coverArt?.let { url("getCoverArt", "id" to it, "size" to size) }

    private suspend fun call(endpoint: String, vararg params: Pair<String, Any?>): JsonObject {
        val text = http.get("${server.baseUrl}/rest/$endpoint") {
            parameter("u", server.user)
            parameter("t", server.token)
            parameter("s", server.salt)
            parameter("v", API_VERSION)
            parameter("c", CLIENT)
            parameter("f", "json")
            for ((k, v) in params) if (v != null) parameter(k, v)
        }.bodyAsText()
        val root = json.parseToJsonElement(text).jsonObject["subsonic-response"]?.jsonObject
            ?: throw SubsonicException(-1, "Not a Subsonic server")
        root["serverVersion"]?.jsonPrimitive?.contentOrNull?.let { serverVersion = it }
        root["type"]?.jsonPrimitive?.contentOrNull?.let { serverType = it }
        if (root["status"]?.jsonPrimitive?.contentOrNull != "ok") {
            val err = root["error"]?.jsonObject
            throw SubsonicException(
                err?.get("code")?.jsonPrimitive?.intOrNull ?: -1,
                err?.get("message")?.jsonPrimitive?.contentOrNull ?: "Server error",
            )
        }
        return root
    }

    private inline fun <reified T> JsonObject.list(vararg path: String): List<T> {
        var el: JsonElement? = this
        for (p in path) el = (el as? JsonObject)?.get(p)
        return when (el) {
            is JsonArray -> el.map { json.decodeFromJsonElement<T>(it) }
            is JsonObject -> listOf(json.decodeFromJsonElement<T>(el))
            else -> emptyList()
        }
    }

    private inline fun <reified T> JsonObject.obj(key: String): T =
        json.decodeFromJsonElement(this[key] ?: throw SubsonicException(70, "Not found"))

    /** Navidrome's version from the last answer (`serverVersion`, e.g. "0.64.2 (10114574)"), or null before any. */
    @Volatile var serverVersion: String? = null
        private set

    /** OpenSubsonic `type` from the last answer, e.g. "navidrome". */
    @Volatile var serverType: String? = null
        private set

    suspend fun ping() { call("ping") }

    @Volatile private var playbackReportSupport: Boolean? = null

    /**
     * Whether the server takes [reportPlayback] (OpenSubsonic `playbackReport`, Navidrome 0.62+).
     * Asked once per server (this client is per server) and cached; a failed check is asked again later.
     */
    suspend fun supportsPlaybackReport(): Boolean {
        playbackReportSupport?.let { return it }
        val r = runCatching { call("getOpenSubsonicExtensions") }.getOrNull() ?: return false
        val names = (r["openSubsonicExtensions"] as? JsonArray)
            ?.mapNotNull { (it as? JsonObject)?.get("name")?.jsonPrimitive?.contentOrNull }.orEmpty()
        return ("playbackReport" in names).also { playbackReportSupport = it }
    }

    /** Cached answer of [supportsPlaybackReport], or null if not asked yet. */
    val playbackReportKnown: Boolean? get() = playbackReportSupport


    override suspend fun albumList(type: String, size: Int, offset: Int, genre: String?) =
        call("getAlbumList2", "type" to type, "size" to size, "offset" to offset, "genre" to genre)
            .list<Album>("albumList2", "album")

    override suspend fun album(id: String): Album = call("getAlbum", "id" to id).obj("album")

    override suspend fun artists(): List<Artist> {
        val idx = call("getArtists")["artists"]?.jsonObject?.get("index")?.jsonArray ?: return emptyList()
        return idx.flatMap { i ->
            (i.jsonObject["artist"] as? JsonArray)?.map { json.decodeFromJsonElement<Artist>(it) } ?: emptyList()
        }
    }

    override suspend fun artist(id: String): Artist = call("getArtist", "id" to id).obj("artist")

    override suspend fun search(query: String, songs: Int, albums: Int, artists: Int): SearchResult {
        val r = call("search3", "query" to query, "songCount" to songs, "albumCount" to albums, "artistCount" to artists)
        return SearchResult(
            artists = r.list("searchResult3", "artist"),
            albums = r.list("searchResult3", "album"),
            songs = r.list("searchResult3", "song"),
        )
    }

    /** Songs list for the library: an empty search3 query returns every song on Navidrome. */
    override suspend fun songs(size: Int, offset: Int): List<Song> =
        call("search3", "query" to "", "songCount" to size, "songOffset" to offset, "albumCount" to 0, "artistCount" to 0)
            .list("searchResult3", "song")

    override suspend fun playlists(): List<Playlist> = call("getPlaylists").list("playlists", "playlist")

    override suspend fun playlist(id: String): Playlist = call("getPlaylist", "id" to id).obj("playlist")

    override suspend fun starred(): Starred {
        val r = call("getStarred2")
        return Starred(r.list("starred2", "artist"), r.list("starred2", "album"), r.list("starred2", "song"))
    }

    override suspend fun genres(): List<Genre> =
        call("getGenres").list<Genre>("genres", "genre").sortedByDescending { it.songCount }

    override suspend fun songsByGenre(genre: String, count: Int, offset: Int): List<Song> =
        call("getSongsByGenre", "genre" to genre, "count" to count, "offset" to offset).list("songsByGenre", "song")

    override suspend fun randomSongs(size: Int, genre: String?): List<Song> =
        call("getRandomSongs", "size" to size, "genre" to genre).list("randomSongs", "song")

    override suspend fun albumsByYear(from: Int, to: Int): List<Album> =
        call("getAlbumList2", "type" to "byYear", "fromYear" to from, "toYear" to to, "size" to 500).list("albumList2", "album")

    /** All songs in pages of 500, four requests at a time (the desktop's getAllSongs, shared with Statistics). */
    override suspend fun allSongs(onProgress: (Int) -> Unit): List<Song> =
        com.tonihk00.clearplay.data.stats.fetchAllSongs({ offset -> songs(com.tonihk00.clearplay.data.stats.STATS_PAGE, offset) }, onProgress)

    /** Starts a library scan (Navidrome: admin accounts only). */
    suspend fun startScan(full: Boolean = false): ScanStatus = scanStatusOf(call("startScan", "fullScan" to full.takeIf { it }))

    suspend fun scanStatus(): ScanStatus = scanStatusOf(call("getScanStatus"))

    private fun scanStatusOf(r: JsonObject): ScanStatus {
        val o = r["scanStatus"]?.jsonObject
        return ScanStatus(
            scanning = o?.get("scanning")?.jsonPrimitive?.contentOrNull == "true",
            count = o?.get("count")?.jsonPrimitive?.intOrNull ?: 0,
            lastScan = o?.get("lastScan")?.jsonPrimitive?.contentOrNull,
        )
    }

    suspend fun star(id: String) { call("star", "id" to id) }
    suspend fun unstar(id: String) { call("unstar", "id" to id) }

    /** 0 clears the rating. */
    suspend fun setRating(id: String, rating: Int) { call("setRating", "id" to id, "rating" to rating.coerceIn(0, 5)) }

    suspend fun scrobble(id: String, submission: Boolean, timeMs: Long = System.currentTimeMillis()) {
        call("scrobble", "id" to id, "submission" to submission, "time" to timeMs)
    }

    /**
     * OpenSubsonic reportPlayback: the live player state for the server's Now Playing.
     * Always sent with ignoreScrobble=true: plays are counted only by [scrobble] with
     * submission=true (Navidrome would otherwise also count a play on "stopped" past half the song).
     */
    suspend fun reportPlayback(id: String, state: String, positionMs: Long, playbackRate: Float = 1f) {
        call(
            "reportPlayback",
            "mediaId" to id, "mediaType" to "song", "positionMs" to positionMs.coerceAtLeast(0),
            "state" to state, "playbackRate" to playbackRate, "ignoreScrobble" to true,
        )
    }

    /**
     * Synced lyrics first (OpenSubsonic getLyricsBySongId, which Navidrome fills from
     * embedded tags and .lrc files), then the legacy getLyrics text, parsed as LRC when it
     * carries timestamps.
     */
    override suspend fun lyrics(song: Song): Lyrics? {
        runCatching {
            val list = call("getLyricsBySongId", "id" to song.id)["lyricsList"]?.jsonObject
                ?.get("structuredLyrics") as? JsonArray
            val entries = list?.map { it.jsonObject }.orEmpty()
            val best = entries.firstOrNull { it["synced"]?.jsonPrimitive?.contentOrNull == "true" } ?: entries.firstOrNull()
            val lines = (best?.get("line") as? JsonArray)?.map {
                val o = it.jsonObject
                LyricLine(o["start"]?.jsonPrimitive?.longOrNull, o["value"]?.jsonPrimitive?.contentOrNull.orEmpty())
            }.orEmpty()
            if (lines.isNotEmpty()) {
                val synced = best?.get("synced")?.jsonPrimitive?.contentOrNull == "true"
                return Lyrics(if (synced) lines else lines.map { it.copy(timeMs = null) })
            }
        }
        val artist = song.artist ?: return null
        val text = runCatching {
            call("getLyrics", "artist" to artist, "title" to song.title)["lyrics"]?.jsonObject
                ?.get("value")?.jsonPrimitive?.contentOrNull
        }.getOrNull()?.takeIf { it.isNotBlank() } ?: return null
        val lrc = parseLrc(text)
        return if (lrc.isNotEmpty()) Lyrics(lrc) else Lyrics(text.lines().map { LyricLine(null, it.trim()) })
    }

    companion object {
        const val API_VERSION = "1.16.1"
        const val CLIENT = "ClearPlay-Android"

        val json = Json {
            ignoreUnknownKeys = true
            coerceInputValues = true
            isLenient = true
        }

        val defaultHttp: HttpClient by lazy {
            HttpClient(OkHttp) {
                install(HttpTimeout) {
                    connectTimeoutMillis = 8_000
                    requestTimeoutMillis = 20_000
                }
                expectSuccess = false
            }
        }

        private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
    }
}
