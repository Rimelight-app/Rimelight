package com.tonihk00.clearplay.data.api

/**
 * What the library screens read. The server client implements it directly; offline
 * (downloads) and phone music use [OfflineLibrary], so every screen looks the same.
 */
interface MusicLibrary {
    /** False for downloads/phone music: no playlists, ratings or scrobbles. */
    val isRemote: Boolean

    suspend fun albumList(type: String = "alphabeticalByName", size: Int = 60, offset: Int = 0, genre: String? = null): List<Album>
    suspend fun album(id: String): Album
    suspend fun artists(): List<Artist>
    suspend fun artist(id: String): Artist
    suspend fun search(query: String, songs: Int = 60, albums: Int = 18, artists: Int = 12): SearchResult
    suspend fun songs(size: Int = 200, offset: Int = 0): List<Song>
    suspend fun playlists(): List<Playlist>
    suspend fun playlist(id: String): Playlist
    suspend fun starred(): Starred
    suspend fun genres(): List<Genre>
    suspend fun songsByGenre(genre: String, count: Int = 200, offset: Int = 0): List<Song>
    suspend fun randomSongs(size: Int = 100, genre: String? = null): List<Song>
    suspend fun lyrics(song: Song): Lyrics?

    /** Every song with its play count, for Statistics. */
    suspend fun allSongs(onProgress: (Int) -> Unit = {}): List<Song>
}
