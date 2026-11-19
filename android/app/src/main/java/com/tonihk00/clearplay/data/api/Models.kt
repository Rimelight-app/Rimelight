package com.tonihk00.clearplay.data.api

import kotlinx.serialization.Serializable

@Serializable
data class Song(
    val id: String,
    val title: String = "",
    val artist: String? = null,
    val artistId: String? = null,
    val album: String? = null,
    val albumId: String? = null,
    val coverArt: String? = null,
    val duration: Int = 0,
    val track: Int? = null,
    val discNumber: Int? = null,
    val year: Int? = null,
    val genre: String? = null,
    val starred: String? = null,
    val userRating: Int = 0,
    val suffix: String? = null,
    val bitRate: Int? = null,
    val samplingRate: Int? = null,
    val bitDepth: Int? = null,
    val playCount: Int = 0,
    val size: Long = 0,
    val contentType: String? = null,
    /** Server the song came from; kept with downloads so covers resolve offline. */
    val server: String? = null,
) {
    val isStarred get() = starred != null

    /** On this phone (MediaStore), not from a server. */
    val isLocal get() = id.startsWith(LOCAL_PREFIX)

    companion object {
        const val LOCAL_PREFIX = "local:"
    }
}

@Serializable
data class Album(
    val id: String,
    val name: String = "",
    val artist: String? = null,
    val artistId: String? = null,
    val coverArt: String? = null,
    val songCount: Int = 0,
    val duration: Int = 0,
    val year: Int? = null,
    val genre: String? = null,
    val starred: String? = null,
    val song: List<Song> = emptyList(),
)

@Serializable
data class Artist(
    val id: String,
    val name: String = "",
    val albumCount: Int = 0,
    val coverArt: String? = null,
    val starred: String? = null,
    val album: List<Album> = emptyList(),
)

@Serializable
data class Playlist(
    val id: String,
    val name: String = "",
    val songCount: Int = 0,
    val duration: Int = 0,
    val coverArt: String? = null,
    val owner: String? = null,
    val entry: List<Song> = emptyList(),
)

@Serializable
data class Genre(
    val value: String = "",
    val songCount: Int = 0,
    val albumCount: Int = 0,
)

data class SearchResult(
    val artists: List<Artist> = emptyList(),
    val albums: List<Album> = emptyList(),
    val songs: List<Song> = emptyList(),
)

data class Starred(
    val artists: List<Artist> = emptyList(),
    val albums: List<Album> = emptyList(),
    val songs: List<Song> = emptyList(),
)

/** One lyrics line; [timeMs] is null for unsynced lyrics. */
@Serializable
data class LyricLine(val timeMs: Long?, val text: String)

@Serializable
data class Lyrics(val lines: List<LyricLine>) {
    val synced get() = lines.isNotEmpty() && lines.all { it.timeMs != null }
}

class SubsonicException(val code: Int, override val message: String) : Exception(message)
