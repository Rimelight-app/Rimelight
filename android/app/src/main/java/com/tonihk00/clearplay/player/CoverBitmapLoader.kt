package com.tonihk00.clearplay.player

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.BitmapLoader
import androidx.media3.common.util.UnstableApi
import coil3.SingletonImageLoader
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture
import com.tonihk00.clearplay.ClearPlayApp
import com.tonihk00.clearplay.ui.components.coverRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Notification, lock-screen and car artwork through the app's own cover cache (Coil),
 * so it shows offline, for downloads and for music on the phone.
 */
@UnstableApi
class CoverBitmapLoader(private val context: Context, private val scope: CoroutineScope) : BitmapLoader {
    override fun supportsMimeType(mimeType: String) = mimeType.startsWith("image/")

    override fun decodeBitmap(data: ByteArray): ListenableFuture<Bitmap> =
        BitmapFactory.decodeByteArray(data, 0, data.size)?.let { Futures.immediateFuture(it) }
            ?: Futures.immediateFailedFuture(IllegalArgumentException("Not an image"))

    override fun loadBitmap(uri: Uri): ListenableFuture<Bitmap> {
        val art = if (uri.scheme == "clearplay-cover") uri.toString().removePrefix("clearplay-cover://") else null
        val future = SettableFuture.create<Bitmap>()
        scope.launch {
            val req = art?.let { coverRequest(context, ClearPlayApp.instance.client, it, 300) }
                ?.newBuilder()?.allowHardware(false)?.build()
            val result = req?.let { SingletonImageLoader.get(context).execute(it) as? SuccessResult }
            result?.let { future.set(it.image.toBitmap()) } ?: future.setException(IllegalStateException("No cover"))
        }
        return future
    }

    override fun loadBitmapFromMetadata(metadata: MediaMetadata): ListenableFuture<Bitmap>? =
        metadata.artworkUri?.let { loadBitmap(it) }
}
