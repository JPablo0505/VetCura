package com.vetcura.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.vetcura.app.data.buildApi
import com.vetcura.app.ui.screens.AppointmentsScreen
import com.vetcura.app.ui.screens.HistoryAllScreen
import com.vetcura.app.ui.screens.HistoryScreen
import com.vetcura.app.ui.screens.HomeScreen
import com.vetcura.app.ui.screens.LoginScreen
import com.vetcura.app.ui.screens.ProfileScreen
import com.vetcura.app.ui.theme.VetCuraTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

private val android.content.Context.authStore by preferencesDataStore("auth")
private val TOKEN_KEY = stringPreferencesKey("jwt")

private data class Tab(val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab("Mascotas", Icons.Filled.Pets),
    Tab("Historial", Icons.Filled.History),
    Tab("Citas", Icons.Filled.CalendarMonth),
    Tab("Perfil", Icons.Filled.Person),
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val api = buildApi(BuildConfig.API_URL)
        setContent {
            VetCuraTheme {
                var token by remember { mutableStateOf<String?>(null) }
                var loaded by remember { mutableStateOf(false) }
                var tab by remember { mutableStateOf(0) }
                var openPet by remember { mutableStateOf<Int?>(null) }
                val scope = rememberCoroutineScope()
                if (!loaded) {
                    scope.launch {
                        token = applicationContext.authStore.data.first()[TOKEN_KEY]
                        loaded = true
                    }
                }
                if (!loaded) {
                    Box(Modifier)
                } else if (token == null) {
                    LoginScreen(api) { t ->
                        scope.launch {
                            applicationContext.authStore.edit { it[TOKEN_KEY] = t }
                            token = t
                        }
                    }
                } else {
                    val auth = token!!
                    fun logout() {
                        scope.launch {
                            applicationContext.authStore.edit { it.remove(TOKEN_KEY) }
                            token = null
                            tab = 0
                            openPet = null
                        }
                    }
                    Scaffold(
                        bottomBar = {
                            NavigationBar {
                                TABS.forEachIndexed { i, t ->
                                    NavigationBarItem(
                                        selected = tab == i && openPet == null,
                                        onClick = { tab = i; openPet = null },
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
                                tab == 0 -> HomeScreen(api, auth, { openPet = it }, { tab = it })
                                tab == 1 -> HistoryAllScreen(api, auth) { openPet = it }
                                tab == 2 -> AppointmentsScreen(api, auth)
                                else -> ProfileScreen(api, auth, ::logout)
                            }
                        }
                    }
                }
            }
        }
    }
}
