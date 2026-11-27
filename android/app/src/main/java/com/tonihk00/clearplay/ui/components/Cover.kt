package com.tonihk00.clearplay.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import com.tonihk00.clearplay.R
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.ui.theme.Cp

/** The active server's client, for cover URLs. Null in previews and screenshot tests. */
val LocalClient = compositionLocalOf<SubsonicClient?> { null }

/**
 * Told each time a cover finishes loading. The Albums grid uses it to report the app fully
 * drawn (Activity.reportFullyDrawn) once its first covers are on screen, for startup metrics.
 */
val LocalCoverLoaded = compositionLocalOf<(() -> Unit)?> { null }

/** Screenshot tests paint covers with gradients instead of loading them. */
val LocalFakeCovers = compositionLocalOf<((String) -> Brush)?> { null }

/** Covers are fetched in three sizes only, so offline copies are always found in the cache. */
fun coverBucket(size: Int) = when {
    size <= 150 -> 150
    size <= 300 -> 300
    else -> 600
}

/**
 * The single place that builds cover requests. [coverArt] can be a server cover id, a
 * downloaded song's "srv:<base>|<id>", or a phone song's "local:<id>". A smaller copy
 * already in memory shows at once while the bigger one loads (no blank flash).
 */
fun coverRequest(context: android.content.Context, client: SubsonicClient?, coverArt: String, sizePx: Int): ImageRequest? {
    val bucket = coverBucket(sizePx)
    val smaller = listOf(150, 300, 600).filter { it < bucket }
    val b = ImageRequest.Builder(context)
    when {
        coverArt.startsWith(com.tonihk00.clearplay.data.api.Song.LOCAL_PREFIX) -> {
            fun key(n: Int) = "phone:$coverArt:$n"
            b.data(com.tonihk00.clearplay.data.PhoneArt(coverArt, bucket)).memoryCacheKey(key(bucket))
            smaller.lastOrNull()?.let { b.placeholderMemoryCacheKey(key(it)) }
        }
        else -> {
            val (base, art) = if (coverArt.startsWith("srv:")) {
                coverArt.removePrefix("srv:").substringBefore('|') to coverArt.substringAfter('|')
            } else {
                (client?.server?.baseUrl ?: return null) to coverArt
            }
            fun key(n: Int) = "cover:$base:$art:$n"
            val url = client?.takeIf { it.server.baseUrl == base }?.coverUrl(art, bucket) ?: "$base/rest/getCoverArt?id=$art&size=$bucket"
            b.data(url).memoryCacheKey(key(bucket)).diskCacheKey(key(bucket))
            smaller.lastOrNull()?.let { b.placeholderMemoryCacheKey(key(it)) }
        }
    }
    return b.build()
}

@Composable
fun Cover(
    coverArt: String?,
    modifier: Modifier = Modifier,
    shape: Shape = Cp.CoverShape,
    sizePx: Int = 300,
    outline: Boolean = true,
) {
    val client = LocalClient.current
    val fake = LocalFakeCovers.current
    val context = LocalContext.current
    val loaded = LocalCoverLoaded.current
    val request = remember(coverArt, sizePx, client) { coverArt?.let { coverRequest(context, client, it, sizePx) } }
    Box(
        modifier
            .clip(shape)
            .background(Cp.Card)
            .then(if (outline) Modifier.border(1.dp, Cp.GlassStroke, shape) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        when {
            fake != null && coverArt != null -> Box(Modifier.fillMaxSize().background(fake(coverArt)))
            request != null -> AsyncImage(
                model = request,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                onSuccess = loaded?.let { l -> { l() } },
                // A cover that can't load shows the placeholder: that tile is drawn too (else the
                // start-up "fully drawn" report never comes when an album has no cover).
                onError = loaded?.let { l -> { l() } },
            )
            else -> {
                if (loaded != null) androidx.compose.runtime.LaunchedEffect(Unit) { loaded() }
                CpIcon(R.drawable.ic_disc_3, size = 28.dp, tint = Cp.TextFaint)
            }
        }
    }
}

@Composable
fun SquareCover(coverArt: String?, modifier: Modifier = Modifier, shape: Shape = Cp.Shape, sizePx: Int = 300) {
    Cover(coverArt, modifier.fillMaxWidth().aspectRatio(1f), shape, sizePx)
}
