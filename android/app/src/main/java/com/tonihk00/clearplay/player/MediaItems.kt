package com.tonihk00.clearplay.player

import android.net.Uri
import android.os.Bundle
import androidx.core.net.toUri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.tonihk00.clearplay.data.Downloads
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicClient

private const val EXTRA_SONG = "cp.song"

/**
 * Builds a queue item. The cache key is the song id, so a downloaded song plays from
 * storage whatever bitrate the URL asks for. The stream URL travels in requestMetadata.mediaUri because Media3
 * strips localConfiguration when items cross from the controller to the session; the
 * service puts it back in onAddMediaItems.
 */
fun Song.toMediaItem(client: SubsonicClient, maxBitRate: Int = 0, format: String? = null): MediaItem {
    val stream = client.streamUrl(id, maxBitRate, format).toUri()
    return MediaItem.Builder()
        .setMediaId(id)
        .setUri(stream)
        .setCustomCacheKey(Downloads.cacheKey(id))
        .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(stream).build())
        .setMediaMetadata(toMetadata(client))
        .build()
}

fun Song.toMetadata(client: SubsonicClient?): MediaMetadata =
    MediaMetadata.Builder()
        .setTitle(title)
        .setArtist(artist)
        .setAlbumTitle(album)
        .setAlbumArtist(artist)
        .setGenre(genre)
        .setTrackNumber(track)
        .setDiscNumber(discNumber)
        .setRecordingYear(year)
        .setDurationMs(duration * 1000L)
        .setArtworkUri(client?.coverUrl(coverArt, 600)?.let(Uri::parse))
        .setIsPlayable(true)
        .setIsBrowsable(false)
        .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
        .setExtras(Bundle().apply { putString(EXTRA_SONG, SubsonicClient.json.encodeToString(Song.serializer(), this@toMetadata)) })
        .build()

/** The Song a queue item was built from (falls back to its plain metadata). */
fun MediaItem.toSong(): Song {
    mediaMetadata.extras?.getString(EXTRA_SONG)?.let { raw ->
        runCatching { return SubsonicClient.json.decodeFromString(Song.serializer(), raw) }
    }
    val m = mediaMetadata
    return Song(
        id = mediaId,
        title = m.title?.toString().orEmpty(),
        artist = m.artist?.toString(),
        album = m.albumTitle?.toString(),
        duration = ((m.durationMs ?: 0L) / 1000).toInt(),
    )
}
