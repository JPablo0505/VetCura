package com.vetcura.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.lifecycle.lifecycleScope
import com.vetcura.app.data.buildApi
import com.vetcura.app.ui.screens.AppointmentsScreen
import com.vetcura.app.ui.screens.HistoryScreen
import com.vetcura.app.ui.screens.InvoicesScreen
import com.vetcura.app.ui.screens.LoginScreen
import com.vetcura.app.ui.screens.PetsDashboardScreen
import com.vetcura.app.ui.theme.VetCuraTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

private val android.content.Context.authStore by preferencesDataStore("auth")
private val TOKEN_KEY = stringPreferencesKey("jwt")

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val api = buildApi(BuildConfig.API_URL)
        setContent {
            VetCuraTheme {
                var token by remember { mutableStateOf<String?>(null) }
                var tab by remember { mutableStateOf(0) }
                var openPet by remember { mutableStateOf<Int?>(null) }
                lifecycleScope.launch {
                    token = applicationContext.authStore.data.first()[TOKEN_KEY]
                }
                if (token == null) {
                    LoginScreen(api) { t ->
                        lifecycleScope.launch {
                            applicationContext.authStore.edit { it[TOKEN_KEY] = t }
                            token = t
                        }
                    }
                } else {
                    val auth = token!!
                    Scaffold(
                        bottomBar = {
                            NavigationBar {
                                listOf("Mascotas", "Citas", "Facturas").forEachIndexed { i, label ->
                                    NavigationBarItem(
                                        selected = tab == i,
                                        onClick = { tab = i; openPet = null },
                                        icon = {},
                                        label = { Text(label) },
                                    )
                                }
                            }
                        },
                    ) { inner ->
                        val mod = Modifier.padding(inner)
                        androidx.compose.foundation.layout.Box(mod) {
                            when {
                                openPet != null -> HistoryScreen(api, auth, openPet!!)
                                tab == 0 -> PetsDashboardScreen(api, auth) { openPet = it }
                                tab == 1 -> AppointmentsScreen(api, auth)
                                else -> InvoicesScreen(api, auth)
                            }
                        }
                    }
                }
            }
        }
    }
}
