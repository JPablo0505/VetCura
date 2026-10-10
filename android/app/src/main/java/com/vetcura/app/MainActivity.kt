package com.vetcura.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Pets
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import com.vetcura.app.data.RefreshRequest
import com.vetcura.app.data.TokenAuthenticator
import com.vetcura.app.data.TokenStore
import com.vetcura.app.data.buildApi
import com.vetcura.app.ui.screens.AppointmentsScreen
import com.vetcura.app.ui.screens.HistoryAllScreen
import com.vetcura.app.ui.screens.HistoryScreen
import com.vetcura.app.ui.screens.HomeScreen
import com.vetcura.app.ui.screens.InvoiceScreen
import com.vetcura.app.ui.screens.LoginScreen
import com.vetcura.app.ui.screens.ProfileScreen
import com.vetcura.app.ui.theme.VetCuraTheme
import kotlinx.coroutines.launch

private data class Tab(val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab("Mascotas", Icons.Filled.Pets),
    Tab("Historial", Icons.Filled.History),
    Tab("Citas", Icons.Filled.CalendarMonth),
    Tab("Perfil", Icons.Filled.Person),
)

class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            VetCuraTheme {
                var token by remember { mutableStateOf<String?>(null) }
                var loaded by remember { mutableStateOf(false) }
                var tab by remember { mutableStateOf(0) }
                var openPet by remember { mutableStateOf<Int?>(null) }
                var openInvoice by remember { mutableStateOf<Int?>(null) }
                // Bumped on every navigation so lists (and photos) refetch
                // instead of showing stale results when coming back.
                var homeTick by remember { mutableStateOf(0) }
                val store = remember { TokenStore(applicationContext) }
                val api = remember {
                    buildApi(
                        BuildConfig.API_URL,
                        TokenAuthenticator(store, BuildConfig.API_URL) {
                            // Dead session (revoked/expired refresh): drop it so
                            // the login screen — the only way back in — shows.
                            runOnUiThread { token = null; tab = 0; openPet = null; openInvoice = null }
                        },
                    )
                }
                val scope = rememberCoroutineScope()
                val notifPermission = rememberLauncherForActivityResult(
                    ActivityResultContracts.RequestPermission(),
                ) { }
                LaunchedEffect(Unit) {
                    token = store.access()
                    loaded = true
                    // Notification permission is requested upfront; the FCM
                    // token registration (POST /me/devices) activates once
                    // the Firebase project + google-services.json exist.
                    if (android.os.Build.VERSION.SDK_INT >= 33) {
                        notifPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                    }
                }
                if (!loaded) {
                    Box(Modifier)
                } else if (token == null) {
                    LoginScreen(api) { access, refresh ->
                        store.save(access, refresh)
                        token = access
                    }
                } else {
                    val auth = token!!
                    fun logout() {
                        scope.launch {
                            try {
                                store.refresh()?.let { api.logout(RefreshRequest(it)) }
                            } catch (_: Exception) {
                            } finally {
                                store.clear()
                                token = null
                                tab = 0
                                openPet = null
                                openInvoice = null
                            }
                        }
                    }
                    Scaffold(
                        topBar = {
                            TopAppBar(
                                title = {
                                    Column {
                                        Row {
                                            Text("Vet", fontWeight = FontWeight.ExtraBold)
                                            Text(
                                                "Cura",
                                                fontWeight = FontWeight.ExtraBold,
                                                color = MaterialTheme.colorScheme.secondary,
                                            )
                                        }
                                        Text(
                                            when {
                                                openPet != null -> "Carnet Clínico"
                                                else -> when (tab) {
                                                    0 -> "Inicio · Mascotas"
                                                    1 -> "Historial"
                                                    2 -> "Citas"
                                                    else -> "Perfil"
                                                }
                                            },
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                    }
                                },
                            )
                        },
                        bottomBar = {
                            NavigationBar {
                                TABS.forEachIndexed { i, t ->
                                    NavigationBarItem(
                                        selected = tab == i && openPet == null,
                                        onClick = { tab = i; openPet = null; openInvoice = null; homeTick += 1 },
                                        icon = { Icon(t.icon, t.label) },
                                        label = { Text(t.label) },
                                    )
                                }
                            }
                        },
                    ) { inner ->
                        Box(Modifier.padding(inner)) {
                            when {
                                openPet != null -> HistoryScreen(api, auth, openPet!!)
                                openInvoice != null -> InvoiceScreen(api, auth, openInvoice!!)
                                tab == 0 -> HomeScreen(api, auth, homeTick, { openPet = it }, { tab = it })
                                tab == 1 -> HistoryAllScreen(api, auth) { openPet = it }
                                tab == 2 -> AppointmentsScreen(api, auth)
                                else -> ProfileScreen(api, auth, { openInvoice = it }, ::logout)
                            }
                        }
                    }
                }
            }
        }
    }
}
