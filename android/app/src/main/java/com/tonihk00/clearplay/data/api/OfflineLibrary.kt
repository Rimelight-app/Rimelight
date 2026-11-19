package com.tonihk00.clearplay.data.api

/**
 * A library built from songs already on the phone: ClearPlay downloads and, with
 * permission, the phone's own music. Albums, artists, genres and search work the same
 * as with a server, so the screens don't change when the connection drops.
 */
class OfflineLibrary(private val all: List<Song>, private val lyricsOf: (String) -> Lyrics? = { null }) : MusicLibrary {
    override val isRemote = false

    private val byAlbum: Map<String, List<Song>> by lazy {
        all.groupBy { it.albumId ?: "song:${it.id}" }
            .mapValues { (_, s) -> s.sortedWith(compareBy({ it.discNumber ?: 0 }, { it.track ?: 0 }, { it.title.lowercase() })) }
    }

    private val albums: List<Album> by lazy {
        byAlbum.map { (id, songs) ->
            val first = songs.first()
            Album(
                id = id,
                name = first.album ?: first.title,
                artist = songs.mapNotNull { it.artist }.groupingBy { it }.eachCount().maxByOrNull { it.value }?.key,
                artistId = first.artistId,
                coverArt = songs.firstNotNullOfOrNull { it.coverArt },
                songCount = songs.size,
                duration = songs.sumOf { it.duration },
                year = songs.firstNotNullOfOrNull { it.year },
                genre = songs.firstNotNullOfOrNull { it.genre },
                song = songs,
            )
        }.sortedBy { it.name.lowercase() }
    }

    private fun artistKey(s: Song) = s.artistId ?: "name:${s.artist.orEmpty()}"

    override suspend fun albumList(type: String, size: Int, offset: Int, genre: String?): List<Album> {
        val list = albums.filter { genre == null || it.genre == genre }
        val ordered = when (type) {
            "newest", "recent" -> list.sortedByDescending { it.year ?: 0 }
            "random" -> list.shuffled()
            else -> list
        }
        return ordered.drop(offset).take(size).map { it.copy(song = emptyList()) }
    }

    override suspend fun album(id: String): Album = albums.firstOrNull { it.id == id } ?: throw SubsonicException(70, "Not available offline")

    override suspend fun artists(): List<Artist> =
        all.groupBy(::artistKey).map { (key, songs) ->
            Artist(
                id = key,
                name = songs.first().artist ?: "Unknown artist",
                albumCount = songs.mapNotNull { it.albumId }.distinct().size.coerceAtLeast(1),
                coverArt = songs.firstNotNullOfOrNull { it.coverArt },
            )
        }.sortedBy { it.name.lowercase() }

    override suspend fun artist(id: String): Artist {
        val songs = all.filter { artistKey(it) == id }
        if (songs.isEmpty()) throw SubsonicException(70, "Not available offline")
        val albumIds = songs.mapNotNull { it.albumId }.toSet()
        return Artist(
            id = id,
            name = songs.first().artist ?: "Unknown artist",
            albumCount = albumIds.size,
            coverArt = songs.firstNotNullOfOrNull { it.coverArt },
            album = albums.filter { it.id in albumIds }.map { it.copy(song = emptyList()) },
        )
    }

    override suspend fun search(query: String, songs: Int, albums: Int, artists: Int): SearchResult {
        val q = query.trim().lowercase()
        if (q.isEmpty()) return SearchResult()
        fun hit(vararg f: String?) = f.any { it?.lowercase()?.contains(q) == true }
        return SearchResult(
            artists = artists().filter { hit(it.name) }.take(artists),
            albums = this.albums.filter { hit(it.name, it.artist) }.take(albums).map { it.copy(song = emptyList()) },
            songs = all.filter { hit(it.title, it.artist, it.album) }.take(songs),
        )
    }

    override suspend fun songs(size: Int, offset: Int): List<Song> =
        all.sortedBy { it.title.lowercase() }.drop(offset).take(size)

    override suspend fun playlists(): List<Playlist> = emptyList()
    override suspend fun playlist(id: String): Playlist = throw SubsonicException(70, "Playlists need the server")

    override suspend fun starred(): Starred = Starred(songs = all.filter { it.isStarred })

    override suspend fun genres(): List<Genre> =
        all.filter { !it.genre.isNullOrBlank() }.groupBy { it.genre!! }
            .map { (g, s) -> Genre(g, s.size, s.mapNotNull { it.albumId }.distinct().size) }
            .sortedByDescending { it.songCount }

    override suspend fun songsByGenre(genre: String, count: Int, offset: Int): List<Song> =
        all.filter { it.genre == genre }.drop(offset).take(count)

    override suspend fun randomSongs(size: Int, genre: String?): List<Song> =
        all.filter { genre == null || it.genre == genre }.shuffled().take(size)

    override suspend fun lyrics(song: Song): Lyrics? = lyricsOf(song.id)

    override suspend fun allSongs(onProgress: (Int) -> Unit): List<Song> = all.also { onProgress(it.size) }
}
