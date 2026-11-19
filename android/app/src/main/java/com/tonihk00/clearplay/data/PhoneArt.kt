package com.tonihk00.clearplay.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.os.Build
import android.util.Size
import coil3.ImageLoader
import coil3.asImage
import coil3.decode.DataSource
import coil3.fetch.FetchResult
import coil3.fetch.Fetcher
import coil3.fetch.ImageFetchResult
import coil3.request.Options

/** Cover of a song on the phone: the art embedded in the file. */
data class PhoneArt(val songId: String, val size: Int)

class PhoneArtFetcher(private val context: Context, private val data: PhoneArt) : Fetcher {
    override suspend fun fetch(): FetchResult? {
        val uri = PhoneMusic.uriOf(data.songId)
        val px = data.size.coerceIn(96, 800)
        val bmp: Bitmap? = if (Build.VERSION.SDK_INT >= 29) {
            runCatching { context.contentResolver.loadThumbnail(uri, Size(px, px), null) }.getOrNull()
        } else {
            null
        } ?: runCatching {
            MediaMetadataRetriever().use { r ->
                r.setDataSource(context, uri)
                r.embeddedPicture?.let { bytes ->
                    val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                    var sample = 1
                    while (opts.outWidth / (sample * 2) >= px) sample *= 2
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
                }
            }
        }.getOrNull()
        return bmp?.let { ImageFetchResult(it.asImage(), isSampled = true, dataSource = DataSource.DISK) }
    }

    class Factory(private val context: Context) : Fetcher.Factory<PhoneArt> {
        override fun create(data: PhoneArt, options: Options, imageLoader: ImageLoader): Fetcher = PhoneArtFetcher(context, data)
    }
}
