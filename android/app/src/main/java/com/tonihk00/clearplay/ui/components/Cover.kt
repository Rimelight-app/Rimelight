package com.tonihk00.clearplay.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
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

/** Screenshot tests paint covers with gradients instead of loading them. */
val LocalFakeCovers = compositionLocalOf<((String) -> Brush)?> { null }

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
    Box(
        modifier
            .clip(shape)
            .background(Cp.Card)
            .then(if (outline) Modifier.border(1.dp, Cp.GlassStroke, shape) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        when {
            fake != null && coverArt != null -> Box(Modifier.fillMaxSize().background(fake(coverArt)))
            client != null && coverArt != null -> AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(client.coverUrl(coverArt, sizePx))
                    .memoryCacheKey("cover:${client.server.baseUrl}:$coverArt:$sizePx")
                    .diskCacheKey("cover:${client.server.baseUrl}:$coverArt:$sizePx")
                    .build(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            else -> CpIcon(R.drawable.ic_disc_3, size = 28.dp, tint = Cp.TextFaint)
        }
    }
}

@Composable
fun SquareCover(coverArt: String?, modifier: Modifier = Modifier, shape: Shape = Cp.Shape, sizePx: Int = 300) {
    Cover(coverArt, modifier.fillMaxWidth().aspectRatio(1f), shape, sizePx)
}
