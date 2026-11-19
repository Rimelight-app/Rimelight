package com.tonihk00.clearplay.data

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import com.tonihk00.clearplay.data.api.Song
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** Music files on the phone (MediaStore), as Songs with ids "local:<mediaId>". */
class PhoneMusic(private val context: Context, private val scope: CoroutineScope) {
    private val _songs = MutableStateFlow<List<Song>>(emptyList())
    val songs: StateFlow<List<Song>> = _songs

    val permission: String =
        if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE

    fun hasPermission() = ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    fun refresh() {
        if (!hasPermission()) {
            _songs.value = emptyList()
            return
        }
        scope.launch(Dispatchers.IO) { _songs.value = runCatching { query() }.getOrDefault(emptyList()) }
    }

    private fun query(): List<Song> {
        val cols = buildList {
            add(MediaStore.Audio.Media._ID); add(MediaStore.Audio.Media.TITLE); add(MediaStore.Audio.Media.ARTIST)
            add(MediaStore.Audio.Media.ARTIST_ID); add(MediaStore.Audio.Media.ALBUM); add(MediaStore.Audio.Media.ALBUM_ID)
            add(MediaStore.Audio.Media.DURATION); add(MediaStore.Audio.Media.TRACK); add(MediaStore.Audio.Media.YEAR)
            add(MediaStore.Audio.Media.DISPLAY_NAME); add(MediaStore.Audio.Media.SIZE); add(MediaStore.Audio.Media.MIME_TYPE)
            if (Build.VERSION.SDK_INT >= 30) { add(MediaStore.Audio.Media.GENRE); add(MediaStore.Audio.Media.BITRATE) }
        }.toTypedArray()
        val out = ArrayList<Song>()
        context.contentResolver.query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, cols,
            "${MediaStore.Audio.Media.IS_MUSIC} != 0", null, null,
        )?.use { c ->
            fun str(col: String) = c.getColumnIndex(col).takeIf { it >= 0 }?.let { c.getString(it) }
            fun long(col: String) = c.getColumnIndex(col).takeIf { it >= 0 && !c.isNull(it) }?.let { c.getLong(it) }
            while (c.moveToNext()) {
                val id = long(MediaStore.Audio.Media._ID) ?: continue
                val albumId = long(MediaStore.Audio.Media.ALBUM_ID)
                val artist = str(MediaStore.Audio.Media.ARTIST)?.takeUnless { it == "<unknown>" }
                val name = str(MediaStore.Audio.Media.DISPLAY_NAME).orEmpty()
                val trackRaw = long(MediaStore.Audio.Media.TRACK)?.toInt()
                out += Song(
                    id = "${Song.LOCAL_PREFIX}$id",
                    title = str(MediaStore.Audio.Media.TITLE) ?: name.substringBeforeLast('.'),
                    artist = artist,
                    artistId = long(MediaStore.Audio.Media.ARTIST_ID)?.let { "local-artist:$it" },
                    album = str(MediaStore.Audio.Media.ALBUM),
                    albumId = albumId?.let { "local-album:$it" },
                    coverArt = "${Song.LOCAL_PREFIX}$id",
                    duration = ((long(MediaStore.Audio.Media.DURATION) ?: 0L) / 1000).toInt(),
                    // MediaStore packs the disc into the thousands: 2005 = disc 2, track 5.
                    track = trackRaw?.let { it % 1000 }?.takeIf { it > 0 },
                    discNumber = trackRaw?.let { it / 1000 }?.takeIf { it > 0 },
                    year = long(MediaStore.Audio.Media.YEAR)?.toInt()?.takeIf { it > 0 },
                    genre = str(MediaStore.Audio.Media.GENRE),
                    suffix = name.substringAfterLast('.', "").lowercase().ifEmpty { null },
                    bitRate = long(MediaStore.Audio.Media.BITRATE)?.let { (it / 1000).toInt() }?.takeIf { it > 0 },
                    size = long(MediaStore.Audio.Media.SIZE) ?: 0L,
                    contentType = str(MediaStore.Audio.Media.MIME_TYPE),
                )
            }
        }
        return out
    }

    companion object {
        fun uriOf(songId: String): Uri =
            ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, songId.removePrefix(Song.LOCAL_PREFIX).toLong())
    }
}
