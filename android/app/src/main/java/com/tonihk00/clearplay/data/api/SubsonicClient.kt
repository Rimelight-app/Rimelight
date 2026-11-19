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
class SubsonicClient(val server: ServerConfig, private val http: HttpClient = defaultHttp) {

    private fun authQuery(): String =
        "u=${enc(server.user)}&t=${server.token}&s=${server.salt}&v=$API_VERSION&c=$CLIENT"

    /** URL usable outside Ktor (ExoPlayer, Coil). */
    fun url(endpoint: String, vararg params: Pair<String, Any?>): String {
        val extra = params.filter { it.second != null }
            .joinToString("") { "&${it.first}=${enc(it.second.toString())}" }
        return "${server.baseUrl}/rest/$endpoint?${authQuery()}$extra"
    }

    /** [format] only applies with a bitrate cap: Navidrome transcodes songs above the cap. */
    fun streamUrl(songId: String, maxBitRate: Int = 0, format: String? = null): String =
        url("stream", "id" to songId, "maxBitRate" to maxBitRate.takeIf { it > 0 }, "format" to format.takeIf { maxBitRate > 0 })

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

    suspend fun ping() { call("ping") }

    suspend fun albumList(type: String = "alphabeticalByName", size: Int = 60, offset: Int = 0, genre: String? = null) =
        call("getAlbumList2", "type" to type, "size" to size, "offset" to offset, "genre" to genre)
            .list<Album>("albumList2", "album")

    suspend fun album(id: String): Album = call("getAlbum", "id" to id).obj("album")

    suspend fun artists(): List<Artist> {
        val idx = call("getArtists")["artists"]?.jsonObject?.get("index")?.jsonArray ?: return emptyList()
        return idx.flatMap { i ->
            (i.jsonObject["artist"] as? JsonArray)?.map { json.decodeFromJsonElement<Artist>(it) } ?: emptyList()
        }
    }

    suspend fun artist(id: String): Artist = call("getArtist", "id" to id).obj("artist")

    suspend fun search(query: String, songs: Int = 60, albums: Int = 18, artists: Int = 12): SearchResult {
        val r = call("search3", "query" to query, "songCount" to songs, "albumCount" to albums, "artistCount" to artists)
        return SearchResult(
            artists = r.list("searchResult3", "artist"),
            albums = r.list("searchResult3", "album"),
            songs = r.list("searchResult3", "song"),
        )
    }

    /** Songs list for the library: an empty search3 query returns every song on Navidrome. */
    suspend fun songs(size: Int = 200, offset: Int = 0): List<Song> =
        call("search3", "query" to "", "songCount" to size, "songOffset" to offset, "albumCount" to 0, "artistCount" to 0)
            .list("searchResult3", "song")

    suspend fun playlists(): List<Playlist> = call("getPlaylists").list("playlists", "playlist")

    suspend fun playlist(id: String): Playlist = call("getPlaylist", "id" to id).obj("playlist")

    suspend fun starred(): Starred {
        val r = call("getStarred2")
        return Starred(r.list("starred2", "artist"), r.list("starred2", "album"), r.list("starred2", "song"))
    }

    suspend fun genres(): List<Genre> =
        call("getGenres").list<Genre>("genres", "genre").sortedByDescending { it.songCount }

    suspend fun songsByGenre(genre: String, count: Int = 200, offset: Int = 0): List<Song> =
        call("getSongsByGenre", "genre" to genre, "count" to count, "offset" to offset).list("songsByGenre", "song")

    suspend fun randomSongs(size: Int = 100, genre: String? = null): List<Song> =
        call("getRandomSongs", "size" to size, "genre" to genre).list("randomSongs", "song")

    suspend fun star(id: String) { call("star", "id" to id) }
    suspend fun unstar(id: String) { call("unstar", "id" to id) }

    /** 0 clears the rating. */
    suspend fun setRating(id: String, rating: Int) { call("setRating", "id" to id, "rating" to rating.coerceIn(0, 5)) }

    suspend fun scrobble(id: String, submission: Boolean, timeMs: Long = System.currentTimeMillis()) {
        call("scrobble", "id" to id, "submission" to submission, "time" to timeMs)
    }

    /**
     * Synced lyrics first (OpenSubsonic getLyricsBySongId, which Navidrome fills from
     * embedded tags and .lrc files), then the legacy getLyrics text, parsed as LRC when it
     * carries timestamps.
     */
    suspend fun lyrics(song: Song): Lyrics? {
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
