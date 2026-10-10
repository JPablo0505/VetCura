package com.vetcura.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.vetcura.app.data.AppointmentRequest
import com.vetcura.app.data.VetCuraApi
import kotlinx.coroutines.launch

// Every screen follows one contract: loading -> content | empty | error.
// No action button is decorative: each one calls the backend.

@Composable
fun LoginScreen(api: VetCuraApi, onToken: (String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().padding(24.dp), Arrangement.spacedBy(12.dp)) {
        Text("VetCura", style = MaterialTheme.typography.headlineLarge)
        Text("Tus mascotas, sus citas y su salud en un lugar.")
        OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Correo") })
        OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Contraseña") })
        if (busy) CircularProgressIndicator()
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            onClick = {
                busy = true
                error = null
                scope.launch {
                    try {
                        val r = api.login(com.vetcura.app.data.LoginRequest(email, password))
                        onToken(r.token)
                    } catch (e: Exception) {
                        error = "No se pudo iniciar sesión: ${e.message}"
                    } finally {
                        busy = false
                    }
                }
            },
            Modifier.fillMaxWidth(),
        ) { Text("Iniciar sesión") }
        Text("El acceso con Google requiere configurar OAuth (ver docs).", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun PetsDashboardScreen(api: VetCuraApi, auth: String, onPet: (Int) -> Unit) {
    var state by remember { mutableStateOf<UiState>(UiState.Loading) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(auth) {
        scope.launch {
            state = try {
                val pets = api.pets("Bearer $auth").pets
                val alerts = api.alerts("Bearer $auth").alerts
                // Alerts carry the vaccination id in `id`; match them to
                // pets through `pet_id` (present in the backend payload).
                UiState.Pets(pets.map { it to alerts.filter { a -> a.pet_id == it.id } })
            } catch (e: Exception) {
                UiState.Error("No se pudieron cargar tus mascotas: ${e.message}")
            }
        }
    }
    when (val s = state) {
        UiState.Loading -> CircularProgressIndicator(Modifier.padding(24.dp))
        is UiState.Error -> Text(s.message, Modifier.padding(24.dp), color = MaterialTheme.colorScheme.error)
        is UiState.Pets -> {
            if (s.items.isEmpty()) {
                Text("Aún no tienes mascotas registradas.", Modifier.padding(24.dp))
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(s.items) { (pet, _) ->
                        Card(onClick = { onPet(pet.id) }, Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp)) {
                                Text(pet.name, style = MaterialTheme.typography.titleLarge)
                                Text("${pet.species}${pet.breed?.let { " · $it" } ?: ""}")
                                Text("Peso: ${pet.weight_kg?.toString() ?: "—"} kg")
                            }
                        }
                    }
                }
            }
        }
        else -> Unit
    }
}

@Composable
fun AppointmentsScreen(api: VetCuraApi, auth: String) {
    var items by remember { mutableStateOf<List<com.vetcura.app.data.Appointment>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var petId by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var startsAt by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    LaunchedEffect(auth) {
        scope.launch {
            try {
                items = api.appointments("Bearer $auth").appointments
            } catch (e: Exception) {
                error = "No se pudieron cargar las citas: ${e.message}"
            }
        }
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Solicitar cita", style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(petId, { petId = it }, label = { Text("ID de mascota") })
            OutlinedTextField(reason, { reason = it }, label = { Text("Motivo") })
            OutlinedTextField(startsAt, { startsAt = it }, label = { Text("Inicio (ISO, ej. 2030-05-01T10:00:00Z)") })
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(onClick = {
                scope.launch {
                    try {
                        val id = petId.toInt()
                        val start = startsAt.ifBlank { "2030-05-01T10:00:00.000Z" }
                        api.book(
                            "Bearer $auth",
                            AppointmentRequest(id, null, start, start, reason.ifBlank { null }),
                        )
                        items = api.appointments("Bearer $auth").appointments
                        error = null
                    } catch (e: Exception) {
                        error = "No se pudo solicitar la cita: ${e.message}"
                    }
                }
            }) { Text("Solicitar") }
        }
        items(items ?: emptyList()) { a ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("#${a.id} · ${a.status}", style = MaterialTheme.typography.titleMedium)
                    Text("${a.starts_at} — ${a.reason ?: "Sin motivo"}")
                }
            }
        }
    }
}

@Composable
fun HistoryScreen(api: VetCuraApi, auth: String, petId: Int) {
    var state by remember { mutableStateOf<UiState>(UiState.Loading) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(petId) {
        scope.launch {
            state = try {
                val h = api.history("Bearer $auth", petId)
                UiState.History(h.consultations, h.vaccinations)
            } catch (e: Exception) {
                UiState.Error("No se pudo cargar el historial: ${e.message}")
            }
        }
    }
    when (val s = state) {
        UiState.Loading -> CircularProgressIndicator(Modifier.padding(24.dp))
        is UiState.Error -> Text(s.message, Modifier.padding(24.dp), color = MaterialTheme.colorScheme.error)
        is UiState.History -> {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(s.consultations) { c ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Text(c.diagnosis, style = MaterialTheme.typography.titleMedium)
                            Text(c.created_at)
                            c.treatment?.let { Text("Tratamiento: $it") }
                            if (c.allergies.isNotEmpty()) Text("Alergias: ${c.allergies.joinToString()}")
                        }
                    }
                }
                items(s.vaccinations) { v ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Text("${v.vaccine} · vence ${v.due_date}", style = MaterialTheme.typography.titleMedium)
                            Text(if (v.given_date == null) "Pendiente" else "Aplicada el ${v.given_date}")
                        }
                    }
                }
                if (s.consultations.isEmpty() && s.vaccinations.isEmpty()) {
                    item { Text("Sin historial clínico todavía.") }
                }
            }
        }
        else -> Unit
    }
}

@Composable
fun InvoicesScreen(api: VetCuraApi, auth: String) {
    var items by remember { mutableStateOf<List<com.vetcura.app.data.Invoice>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(auth) {
        scope.launch {
            try {
                items = api.invoices("Bearer $auth").invoices
            } catch (e: Exception) {
                error = "No se pudieron cargar las facturas: ${e.message}"
            }
        }
    }
    if (error != null) {
        Text(error!!, Modifier.padding(24.dp), color = MaterialTheme.colorScheme.error)
    } else if (items == null) {
        CircularProgressIndicator(Modifier.padding(24.dp))
    } else if (items!!.isEmpty()) {
        Text("No tienes facturas disponibles.", Modifier.padding(24.dp))
    } else {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(items!!) { i ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Factura #${i.id} · ${i.status}", style = MaterialTheme.typography.titleMedium)
                        Text("Total: ${(i.total_cents / 100.0)} €")
                    }
                }
            }
        }
    }
}

sealed interface UiState {
    data object Loading : UiState
    data class Error(val message: String) : UiState
    data class Pets(val items: List<Pair<com.vetcura.app.data.Pet, List<com.vetcura.app.data.Alert>>>) : UiState
    data class History(
        val consultations: List<com.vetcura.app.data.Consultation>,
        val vaccinations: List<com.vetcura.app.data.Vaccination>,
    ) : UiState
}
