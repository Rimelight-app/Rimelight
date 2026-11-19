package com.tonihk00.clearplay.data

import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import java.time.Instant

/**
 * Likes and ratings made in this session, applied on top of whatever a screen loaded.
 * The queue is never rebuilt for an edit, so liking the playing song cannot restart it.
 */
class SongEdits {
    data class Edit(val starred: Boolean? = null, val rating: Int? = null)

    private val _edits = MutableStateFlow<Map<String, Edit>>(emptyMap())
    val edits: StateFlow<Map<String, Edit>> = _edits

    fun apply(song: Song, map: Map<String, Edit> = _edits.value): Song {
        val e = map[song.id] ?: return song
        return song.copy(
            starred = when (e.starred) {
                null -> song.starred
                true -> song.starred ?: Instant.now().toString()
                false -> null
            },
            userRating = e.rating ?: song.userRating,
        )
    }

    /** Optimistic: updates at once, rolls back if the server refuses. */
    suspend fun toggleStar(client: SubsonicClient, song: Song) {
        val now = !apply(song).isStarred
        val before = _edits.value[song.id]
        _edits.update { it + (song.id to (it[song.id] ?: Edit()).copy(starred = now)) }
        runCatching { if (now) client.star(song.id) else client.unstar(song.id) }
            .onFailure { restore(song.id, before) }
    }

    /** Tapping the current rating again clears it, as on the desktop. */
    suspend fun rate(client: SubsonicClient, song: Song, stars: Int) {
        val current = apply(song).userRating
        val next = if (stars == current) 0 else stars
        val before = _edits.value[song.id]
        _edits.update { it + (song.id to (it[song.id] ?: Edit()).copy(rating = next)) }
        runCatching { client.setRating(song.id, next) }.onFailure { restore(song.id, before) }
    }

    private fun restore(id: String, before: Edit?) {
        _edits.update { if (before == null) it - id else it + (id to before) }
    }
}
