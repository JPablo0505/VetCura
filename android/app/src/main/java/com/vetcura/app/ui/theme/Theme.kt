package com.vetcura.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

// Tokens observed in Mockups/ (see docs/VISUAL-SPEC.md).
// Palette discipline: greens, oranges and neutrals ONLY. Every slot is
// set explicitly because Material3 defaults inject a purple tertiary
// family (since removed everywhere by this scheme).
val VetPrimary = Color(0xFF00685F)
val VetPrimaryDark = Color(0xFF006947)
val VetOnPrimaryContainer = Color(0xFF00201C)
val VetPrimaryContainer = Color(0xFFB8EDE1)
val VetSecondary = Color(0xFFFD761A)
val VetOnSecondaryContainer = Color(0xFF4A2600)
val VetSecondaryContainer = Color(0xFFFFDCC4)
val VetTertiary = Color(0xFF3A6B2F)
val VetTertiaryContainer = Color(0xFFBDF0A9)
val VetOnTertiaryContainer = Color(0xFF072100)
val VetInk = Color(0xFF111C2D)
val VetMuted = Color(0xFF6D7A77)
val VetBackground = Color(0xFFF9F9FF)
val VetSurface = Color(0xFFFFFFFF)
val VetSurfaceContainer = Color(0xFFEFF3F1)
val VetChip = Color(0xFFF0F3FF)
val VetDanger = Color(0xFFBA1A1A)
val VetDangerContainer = Color(0xFFFFDAD6)

val CardRadius = 14.dp

private val VetColors = lightColorScheme(
    primary = VetPrimary,
    onPrimary = Color.White,
    primaryContainer = VetPrimaryContainer,
    onPrimaryContainer = VetOnPrimaryContainer,
    secondary = VetSecondary,
    onSecondary = Color.White,
    secondaryContainer = VetSecondaryContainer,
    onSecondaryContainer = VetOnSecondaryContainer,
    tertiary = VetTertiary,
    onTertiary = Color.White,
    tertiaryContainer = VetTertiaryContainer,
    onTertiaryContainer = VetOnTertiaryContainer,
    background = VetBackground,
    onBackground = VetInk,
    surface = VetSurface,
    onSurface = VetInk,
    surfaceVariant = VetSurfaceContainer,
    onSurfaceVariant = VetMuted,
    error = VetDanger,
    onError = Color.White,
    errorContainer = VetDangerContainer,
    onErrorContainer = VetDanger,
    outline = Color(0xFFCFD6E4),
)

// Headings: Nunito; body and clinical data: Inter (loaded via downloadable
// fonts in a follow-up; system fallback keeps the same roles).
@Composable
fun VetCuraTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = VetColors, content = content)
}
