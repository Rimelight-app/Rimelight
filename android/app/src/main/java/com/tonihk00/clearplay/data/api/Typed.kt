package com.tonihk00.clearplay.data.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Typed envelopes for the heavy calls (search3 songs, getAlbumList2, getAlbum, getPlaylist,
 * getStarred2): decoded in one pass straight from the response bytes into these classes,
 * without first reading the whole body into a String and a JsonElement tree. Other calls keep
 * the generic path.
 */
@Serializable
internal class TypedRoot(@SerialName("subsonic-response") val response: TypedResponse? = null)

@Serializable
internal class TypedResponse(
    val status: String? = null,
    val type: String? = null,
    val serverVersion: String? = null,
    val error: TypedError? = null,
    val albumList2: TypedAlbumList? = null,
    val album: Album? = null,
    val playlist: Playlist? = null,
    val starred2: TypedStarred? = null,
    val searchResult3: TypedSearch? = null,
)

@Serializable
internal class TypedError(val code: Int = -1, val message: String? = null)

@Serializable
internal class TypedAlbumList(val album: List<Album> = emptyList())

@Serializable
internal class TypedStarred(
    val artist: List<Artist> = emptyList(),
    val album: List<Album> = emptyList(),
    val song: List<Song> = emptyList(),
)

@Serializable
internal class TypedSearch(
    val artist: List<Artist> = emptyList(),
    val album: List<Album> = emptyList(),
    val song: List<Song> = emptyList(),
)
