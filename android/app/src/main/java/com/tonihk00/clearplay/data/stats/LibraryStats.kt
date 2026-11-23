package com.tonihk00.clearplay.data.stats

import com.tonihk00.clearplay.data.api.Song
import kotlinx.coroutines.async
import kotlinx.serialization.Serializable
import java.math.BigDecimal
import java.math.RoundingMode

/*
 * Statistics, ported 1:1 from the desktop (src/utils/libraryStats.ts and the getAllSongs
 * paging in src/service/stats.ts). Pure Kotlin, no Android types, so it runs in plain unit
 * tests. If you change a formula here, change the desktop too: both apps must show the same
 * numbers for the same server.
 */

@Serializable
data class Ranked(
    val key: String,
    val label: String,
    val sublabel: String? = null,
    val coverArt: String? = null,
    val id: String? = null,
    val plays: Int,
    val seconds: Long,
)

@Serializable
data class LibraryStats(
    val songs: Int,
    val albums: Int,
    val artists: Int,
    val librarySeconds: Long,
    val libraryBytes: Long,
    val plays: Int,
    val listenSeconds: Long,
    val songsPlayed: Int,
    val losslessShare: Float,
    val formats: List<Pair<String, Int>>,
    val topSongs: List<Song>,
    val topArtists: List<Ranked>,
    val topAlbums: List<Ranked>,
    val topGenres: List<Ranked>,
    val decades: List<Ranked>,
) {
    /** Desktop: `Math.round(songsPlayed / songs * 100)`. */
    val discoveredPercent: Int get() = if (songs == 0) 0 else Math.round(songsPlayed * 100.0 / songs).toInt()
}

private val LOSSLESS = setOf("flac", "alac", "wav", "aiff", "aif", "ape", "wv", "dsf", "dff")

const val STATS_PAGE = 500
private const val STATS_PARALLEL = 4
private const val STATS_MAX_OFFSET = 400_000

/**
 * Every song in the library, like the desktop's getAllSongs: search3 pages of 500
 * (query "", no artists/albums), four pages at a time, until a page comes back short.
 * Duplicate song IDs (pages shifting while the library changes) keep their first copy.
 * A failed page throws, so a partial library is never mistaken for the whole one.
 */
suspend fun fetchAllSongs(page: suspend (offset: Int) -> List<Song>, onProgress: (Int) -> Unit = {}): List<Song> =
    kotlinx.coroutines.coroutineScope {
        val all = ArrayList<Song>()
        var offset = 0
        var done = false
        while (!done) {
            val batch = (0 until STATS_PARALLEL).map { i -> async { page(offset + i * STATS_PAGE) } }.map { it.await() }
            for (songs in batch) {
                all += songs
                if (songs.size < STATS_PAGE) done = true
            }
            offset += STATS_PARALLEL * STATS_PAGE
            onProgress(all.size)
            if (offset > STATS_MAX_OFFSET) break
        }
        all.distinctBy { it.id }
    }

/** Aggregates per-song play counts into listening statistics (desktop computeStats). */
fun computeStats(songs: List<Song>): LibraryStats {
    val albums = HashSet<String>()
    val artists = HashSet<String>()
    // Insertion-ordered like JS Maps, so ties sort the same way as on the desktop.
    val formats = LinkedHashMap<String, Int>()
    val artistMap = LinkedHashMap<String, Ranked>()
    val albumMap = LinkedHashMap<String, Ranked>()
    val genreMap = LinkedHashMap<String, Ranked>()
    val decadeMap = LinkedHashMap<String, Ranked>()
    fun bump(map: MutableMap<String, Ranked>, init: Ranked, plays: Int, secs: Long) {
        val e = map[init.key] ?: init
        map[init.key] = e.copy(plays = e.plays + plays, seconds = e.seconds + secs)
    }

    var librarySeconds = 0L
    var libraryBytes = 0L
    var plays = 0
    var listenSeconds = 0L
    var songsPlayed = 0
    var lossless = 0

    for (s in songs) {
        val count = s.playCount
        val secs = s.duration.toLong() * count // per song: duration × its own play count
        librarySeconds += s.duration
        libraryBytes += s.size
        s.albumId?.let(albums::add)
        s.artistId?.let(artists::add)
        val fmt = (s.suffix ?: "?").uppercase()
        formats[fmt] = (formats[fmt] ?: 0) + 1
        if ((s.suffix ?: "").lowercase() in LOSSLESS) lossless++
        if (count == 0) continue

        plays += count
        listenSeconds += secs
        songsPlayed++
        val ak = s.artistId ?: s.artist.orEmpty()
        bump(artistMap, Ranked(ak, s.artist ?: "Unknown artist", id = s.artistId, plays = 0, seconds = 0), count, secs)
        val alk = s.albumId.orEmpty()
        bump(albumMap, Ranked(alk, s.album.orEmpty(), s.artist, s.coverArt, s.albumId, 0, 0), count, secs)
        s.genre?.takeIf { it.isNotEmpty() }?.let { bump(genreMap, Ranked(it, it, plays = 0, seconds = 0), count, secs) }
        s.year?.takeIf { it != 0 }?.let { y ->
            val d = "${Math.floorDiv(y, 10) * 10}s"
            bump(decadeMap, Ranked(d, d, plays = 0, seconds = 0), count, secs)
        }
    }

    fun top(m: Map<String, Ranked>, n: Int, byPlays: Boolean = false) =
        m.values.filter { it.plays > 0 }
            .sortedByDescending { if (byPlays) it.plays.toLong() else it.seconds }
            .take(n)

    return LibraryStats(
        songs = songs.size,
        albums = albums.size,
        artists = artists.size,
        librarySeconds = librarySeconds,
        libraryBytes = libraryBytes,
        plays = plays,
        listenSeconds = listenSeconds,
        songsPlayed = songsPlayed,
        losslessShare = if (songs.isEmpty()) 0f else lossless.toFloat() / songs.size,
        formats = formats.entries.sortedByDescending { it.value }.map { it.key to it.value },
        topSongs = songs.filter { it.playCount > 0 }.sortedByDescending { it.playCount }.take(10),
        topArtists = top(artistMap, 8),
        topAlbums = top(albumMap, 6, byPlays = true),
        topGenres = top(genreMap, 8),
        decades = decadeMap.values.sortedBy { it.label },
    )
}

/** "12 345": JS Math.round, then a space as thousands separator (desktop fmtInt). */
fun fmtInt(n: Number): String {
    val r = if (n is Double || n is Float) Math.round(n.toDouble()) else n.toLong()
    return "%,d".format(java.util.Locale.ROOT, r).replace(',', ' ')
}

/** "26 min" under an hour, "1.8 h" up to 99.9 h, "142 h" from 100 h (desktop fmtHours). */
fun fmtHours(seconds: Long): String {
    val h = seconds / 3600.0
    return when {
        h >= 100 -> "${fmtInt(h)} h"
        // JS toFixed(1) rounds the exact binary value half-up; BigDecimal(double) does the same.
        h >= 1 -> "${BigDecimal(h).setScale(1, RoundingMode.HALF_UP).toPlainString()} h"
        else -> "${Math.round(seconds / 60.0)} min"
    }
}

/** "1.8 GB", or "312 MB" under a gigabyte (desktop fmtBytes, binary units). */
fun fmtBytes(bytes: Long): String {
    val gb = bytes / 1024.0 / 1024.0 / 1024.0
    return if (gb >= 1) "${BigDecimal(gb).setScale(1, RoundingMode.HALF_UP).toPlainString()} GB"
    else "${Math.round(bytes / 1024.0 / 1024.0)} MB"
}
