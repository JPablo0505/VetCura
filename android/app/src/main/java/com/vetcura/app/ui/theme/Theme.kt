package com.vetcura.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp

// Tokens observed in Mockups/ (see docs/VISUAL-SPEC.md).
val VetPrimary = Color(0xFF00685F)
val VetPrimaryDark = Color(0xFF006947)
val VetSecondary = Color(0xFFFD761A)
val VetInk = Color(0xFF111C2D)
val VetMuted = Color(0xFF6D7A77)
val VetBackground = Color(0xFFF9F9FF)
val VetChip = Color(0xFFF0F3FF)
val VetDanger = Color(0xFFBA1A1A)

val CardRadius = 14.dp

private val VetColors = lightColorScheme(
    primary = VetPrimary,
    onPrimary = Color.White,
    secondary = VetSecondary,
    onSecondary = Color.White,
    background = VetBackground,
    onBackground = VetInk,
    surface = Color.White,
    onSurface = VetInk,
    error = VetDanger,
)

// Headings: Nunito; body and clinical data: Inter (loaded via downloadable
// fonts in a follow-up; system fallback keeps the same roles).
@Composable
fun VetCuraTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = VetColors, content = content)
}
