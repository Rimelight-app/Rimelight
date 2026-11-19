package com.tonihk00.clearplay.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke

private val LogoLight = Color(0xFFF4F4F5)
private val LogoDark = Color(0xFF0B0B0E)

/** ClearPlay logo (white rounded square, grooved disc). Source: build/icon.svg (100×100). */
@Composable
fun Logo(modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val u = size.minDimension / 100f
        fun o(x: Float, y: Float) = Offset(x * u, y * u)
        drawRoundRect(LogoLight, o(2f, 2f), Size(96 * u, 96 * u), CornerRadius(22 * u))
        drawCircle(LogoDark, 31 * u, o(50f, 50f))
        val groove = Stroke(1.9f * u)
        drawCircle(LogoLight, 25.63f * u, o(50.78f, 50f), style = groove)
        drawCircle(LogoLight, 21.02f * u, o(52.32f, 50f), style = groove)
        drawCircle(LogoLight, 17.11f * u, o(54.56f, 50f), style = groove)
        drawCircle(LogoLight, 13.8f * u, o(57.4f, 50f))
    }
}
