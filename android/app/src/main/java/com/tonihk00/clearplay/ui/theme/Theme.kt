package com.tonihk00.clearplay.ui.theme

import android.provider.Settings
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.tonihk00.clearplay.R

/** Tokens copied from the desktop `.glass` theme (src/themes.css). */
object Cp {
    val Base = Color(0xFF0B0B0E) // hsl(240 14% 5%)
    val Popover = Color(0xFF14141A) // hsl(240 12% 9%)

    private val W = Color.White
    val Card = W.copy(alpha = 0.05f)
    val Secondary = W.copy(alpha = 0.10f)
    val Muted = W.copy(alpha = 0.06f)
    val Accent = W.copy(alpha = 0.09f)
    val Border = W.copy(alpha = 0.08f)
    val Input = W.copy(alpha = 0.12f)

    val GlassFill = W.copy(alpha = 0.055f)
    val GlassFillStrong = W.copy(alpha = 0.09f)
    val GlassStroke = W.copy(alpha = 0.09f)

    val TextStrong = W.copy(alpha = 0.96f)
    val TextSoft = W.copy(alpha = 0.72f)
    val TextFaint = W.copy(alpha = 0.48f)
    val Primary = Color(0xFFF5F5F5) // hsl(0 0% 96%)
    val OnPrimary = Color(0xFF121216)
    val Destructive = Color(0xFFDC2626)

    val Radius = 16.dp
    val Shape = RoundedCornerShape(Radius)
    val CoverShape = RoundedCornerShape(12.dp)
    val BigCoverShape = RoundedCornerShape(24.dp)

    val IconStroke = 1.75f

    /** --ease-out-soft: cubic-bezier(0.22, 1, 0.36, 1) */
    val EaseOutSoft = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)
    const val ControlMs = 180
    const val ScreenMs = 300
}

val Inter = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold),
)

private val base = TextStyle(fontFamily = Inter, color = Cp.TextStrong, letterSpacing = (-0.006).em)

private val CpTypography = Typography(
    displaySmall = base.copy(fontSize = 34.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.03).em, lineHeight = 38.sp),
    headlineMedium = base.copy(fontSize = 28.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.025).em),
    headlineSmall = base.copy(fontSize = 24.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.02).em),
    titleLarge = base.copy(fontSize = 20.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.015).em),
    titleMedium = base.copy(fontSize = 16.sp, fontWeight = FontWeight.Medium),
    titleSmall = base.copy(fontSize = 14.sp, fontWeight = FontWeight.Medium),
    bodyLarge = base.copy(fontSize = 16.sp),
    bodyMedium = base.copy(fontSize = 14.sp),
    bodySmall = base.copy(fontSize = 12.sp, color = Cp.TextSoft),
    labelLarge = base.copy(fontSize = 14.sp, fontWeight = FontWeight.Medium),
    labelMedium = base.copy(fontSize = 12.sp, fontWeight = FontWeight.Medium),
    labelSmall = base.copy(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.12.em),
)

private val CpColors = darkColorScheme(
    primary = Cp.Primary,
    onPrimary = Cp.OnPrimary,
    secondary = Cp.Secondary,
    onSecondary = Color.White,
    background = Cp.Base,
    onBackground = Cp.TextStrong,
    surface = Cp.Popover,
    onSurface = Cp.TextStrong,
    surfaceVariant = Cp.Muted,
    onSurfaceVariant = Cp.TextSoft,
    surfaceContainer = Cp.Popover,
    surfaceContainerHigh = Cp.Popover,
    surfaceContainerLow = Cp.Popover,
    outline = Cp.Border,
    outlineVariant = Cp.Border,
    error = Cp.Destructive,
)

/** True when the system "Remove animations" setting is on. */
val LocalReduceMotion = staticCompositionLocalOf { false }

@Composable
fun ClearPlayTheme(reduceMotion: Boolean? = null, content: @Composable () -> Unit) {
    val context = LocalContext.current
    val reduce = reduceMotion ?: remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    CompositionLocalProvider(LocalReduceMotion provides reduce) {
        MaterialTheme(colorScheme = CpColors, typography = CpTypography, content = content)
    }
}
