package app.masjidhub.staff.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// The "Rub el Hizb" palette the web app uses: forest green and gold on a warm
// greige ground, with a darker, softer set for dark mode.

val BrandGreen = Color(0xFF1B4D33)
val BrandGold = Color(0xFFB98A2E)
val BrandGround = Color(0xFFF6F3EC)
val BrandInk = Color(0xFF1C1E1B)

val BrandGreenDark = Color(0xFF57A877)
val BrandGoldDark = Color(0xFFD9AE52)
val BrandGroundDark = Color(0xFF101410)
val BrandInkDark = Color(0xFFECEFE9)

private val LightColors = lightColorScheme(
    primary = BrandGreen,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD8E7DD),
    onPrimaryContainer = BrandGreen,
    secondary = BrandGold,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFF3E6C9),
    onSecondaryContainer = Color(0xFF5B4310),
    background = BrandGround,
    onBackground = BrandInk,
    surface = Color.White,
    onSurface = BrandInk,
    surfaceVariant = Color(0xFFEDE8DC),
    onSurfaceVariant = Color(0xFF6B6F67),
    outline = Color(0xFFE3DED2),
    error = Color(0xFFA4322A),
)

private val DarkColors = darkColorScheme(
    primary = BrandGreenDark,
    onPrimary = Color(0xFF0B1A11),
    primaryContainer = Color(0xFF1E3A28),
    onPrimaryContainer = Color(0xFFCDEBD9),
    secondary = BrandGoldDark,
    onSecondary = Color(0xFF241A03),
    secondaryContainer = Color(0xFF3D2F0F),
    onSecondaryContainer = Color(0xFFF3E1B6),
    background = BrandGroundDark,
    onBackground = BrandInkDark,
    surface = Color(0xFF181D18),
    onSurface = BrandInkDark,
    surfaceVariant = Color(0xFF232922),
    onSurfaceVariant = Color(0xFF9CA39A),
    outline = Color(0xFF2A312A),
    error = Color(0xFFE3796F),
)

/** Gold is the accent for money and highlights, whichever scheme is in play. */
val accentGold: Color
    @Composable get() = if (isSystemInDarkTheme()) BrandGoldDark else BrandGold

@Composable
fun MasjidHubTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
