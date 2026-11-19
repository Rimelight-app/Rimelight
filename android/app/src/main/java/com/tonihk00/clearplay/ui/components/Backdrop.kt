package com.tonihk00.clearplay.ui.components

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Rect
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import com.tonihk00.clearplay.ui.theme.Cp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * Window-wide backdrop, as on the desktop: the current cover blurred ONCE into a tiny
 * bitmap and stretched (bilinear scaling finishes the blur for free), under a dark wash.
 * Nothing here blurs live; the only per-frame cost is drawing one small bitmap.
 */
@Composable
fun CoverBackdrop(coverArt: String?, modifier: Modifier = Modifier, dim: Float = 0f) {
    val client = LocalClient.current
    val context = LocalContext.current
    var blurred by remember { mutableStateOf<ImageBitmap?>(null) }

    LaunchedEffect(coverArt, client) {
        if (coverArt == null || client == null) return@LaunchedEffect
        val req = ImageRequest.Builder(context)
            .data(client.coverUrl(coverArt, 150))
            .memoryCacheKey("cover:${client.server.baseUrl}:$coverArt:150")
            .diskCacheKey("cover:${client.server.baseUrl}:$coverArt:150")
            .allowHardware(false)
            .build()
        val result = SingletonImageLoader.get(context).execute(req) as? SuccessResult ?: return@LaunchedEffect
        blurred = withContext(Dispatchers.Default) { blurOnce(result.image.toBitmap()).asImageBitmap() }
    }
    BackdropLayer(blurred, modifier, dim)
}

@Composable
fun BackdropLayer(blurred: ImageBitmap?, modifier: Modifier = Modifier, dim: Float = 0f) {
    val mode = com.tonihk00.clearplay.ui.LocalBackdropMode.current
    // Dark wash over the cover, same stops as the desktop's vivid / normal / dim modes.
    val wash = when (mode) {
        com.tonihk00.clearplay.data.Backdrop.Vivid -> floatArrayOf(0.15f, 0.25f, 0.50f)
        com.tonihk00.clearplay.data.Backdrop.Dim -> floatArrayOf(0.55f, 0.65f, 0.80f)
        else -> floatArrayOf(0.35f, 0.45f, 0.65f)
    }
    val show = if (mode == com.tonihk00.clearplay.data.Backdrop.Off) null else blurred
    Box(modifier.fillMaxSize().background(Cp.Base)) {
        // Faint cool light in the corners, visible before any cover loads.
        Box(
            Modifier.fillMaxSize().background(
                Brush.radialGradient(listOf(Color(70, 70, 90).copy(alpha = 0.35f), Color.Transparent), Offset(200f, 0f), 1400f),
            ),
        )
        Crossfade(show, animationSpec = tween(700, easing = Cp.EaseOutSoft), label = "backdrop") { bmp ->
            if (bmp != null) {
                Image(
                    bmp,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    filterQuality = FilterQuality.High,
                    modifier = Modifier.fillMaxSize().graphicsLayer { scaleX = 1.12f; scaleY = 1.12f },
                )
            }
        }
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    listOf(
                        Color.Black.copy(alpha = (wash[0] + dim).coerceAtMost(1f)),
                        Color.Black.copy(alpha = (wash[1] + dim).coerceAtMost(1f)),
                        Color.Black.copy(alpha = (wash[2] + dim * 0.5f).coerceAtMost(1f)),
                    ),
                ),
            ),
        )
    }
}

/** Shrinks the cover to 48 px, box-blurs it three times and boosts saturation (like the desktop's 160 %). */
fun blurOnce(src: Bitmap, size: Int = 48, radius: Int = 3): Bitmap {
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.FILTER_BITMAP_FLAG).apply {
        colorFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(1.6f) })
    }
    // Draw slightly oversized so the blur has no dark edges.
    val pad = radius * 3
    canvas.drawBitmap(src, null, Rect(-pad, -pad, size + pad, size + pad), paint)
    val px = IntArray(size * size)
    out.getPixels(px, 0, size, 0, 0, size, size)
    repeat(3) { boxBlur(px, size, size, radius) }
    out.setPixels(px, 0, size, 0, 0, size, size)
    return out
}

private fun boxBlur(px: IntArray, w: Int, h: Int, r: Int) {
    val tmp = IntArray(px.size)
    fun pass(src: IntArray, dst: IntArray, horizontal: Boolean) {
        val outer = if (horizontal) h else w
        val inner = if (horizontal) w else h
        for (o in 0 until outer) {
            for (i in 0 until inner) {
                var a = 0; var rr = 0; var g = 0; var b = 0; var n = 0
                for (k in max(0, i - r)..min(inner - 1, i + r)) {
                    val c = src[if (horizontal) o * w + k else k * w + o]
                    a += c ushr 24; rr += (c shr 16) and 0xFF; g += (c shr 8) and 0xFF; b += c and 0xFF; n++
                }
                dst[if (horizontal) o * w + i else i * w + o] = ((a / n) shl 24) or ((rr / n) shl 16) or ((g / n) shl 8) or (b / n)
            }
        }
    }
    pass(px, tmp, true)
    pass(tmp, px, false)
}

/** Up to four distinct, reasonably saturated colours from a cover (port of the desktop's extractPalette). */
fun extractPalette(src: Bitmap): List<Color> {
    val size = 32
    val small = Bitmap.createScaledBitmap(src, size, size, true)
    val px = IntArray(size * size).also { small.getPixels(it, 0, size, 0, 0, size, size) }
    data class B(var n: Int = 0, var r: Long = 0, var g: Long = 0, var b: Long = 0)
    val buckets = HashMap<Int, B>()
    for (c in px) {
        val r = (c shr 16) and 0xFF; val g = (c shr 8) and 0xFF; val b = c and 0xFF
        val bk = buckets.getOrPut(((r shr 4) shl 8) or ((g shr 4) shl 4) or (b shr 4)) { B() }
        bk.n++; bk.r += r; bk.g += g; bk.b += b
    }
    val scored = buckets.values.map { bk ->
        val c = floatArrayOf(bk.r / bk.n.toFloat(), bk.g / bk.n.toFloat(), bk.b / bk.n.toFloat())
        val mx = c.max(); val mn = c.min()
        val sat = if (mx == 0f) 0f else (mx - mn) / mx
        val light = mx / 255f
        c to bk.n * (0.35f + sat) * (if (light > 0.12f && light < 0.95f) 1f else 0.3f)
    }.sortedByDescending { it.second }
    val picked = ArrayList<FloatArray>()
    for ((c, _) in scored) {
        if (picked.all { hypot(hypot(it[0] - c[0], it[1] - c[1]), it[2] - c[2]) > 60f }) picked += c
        if (picked.size == 4) break
    }
    return picked.map { Color(it[0] / 255f, it[1] / 255f, it[2] / 255f) }
}
