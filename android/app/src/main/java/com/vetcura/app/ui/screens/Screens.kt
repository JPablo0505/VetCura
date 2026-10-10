package com.vetcura.app.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.vetcura.app.R
import com.vetcura.app.data.AppointmentRequest
import com.vetcura.app.data.VetCuraApi
import kotlinx.coroutines.launch

// Every screen follows one contract: loading -> content | empty | error.
// No action button is decorative: each one calls the backend.

// Decorative pet photos extracted from Mockups/ (pet-only shots).
// The clinical data alongside is always the real record.
fun photoFor(petId: Int, species: String): Int {
    if (species.lowercase().startsWith("cat")) return R.drawable.pet_3
    val pool = listOf(R.drawable.pet_1, R.drawable.pet_2, R.drawable.pet_4)
    return pool[petId % pool.size]
}

fun ageYears(birthdate: String?): String {
    if (birthdate == null) return "—"
    return try {
        val born = java.time.LocalDate.parse(birthdate)
        val years = java.time.Period.between(born, java.time.LocalDate.now()).years
        "$years años"
    } catch (_: Exception) {
        "—"
    }
}

@Composable
fun LoginScreen(api: VetCuraApi, onToken: (String) -> Unit) {
    // Mirrors Mockups/Login.svg. The mockup's anonymous pet-ID button
    // would expose clinical data without auth, so clinic access is the
    // real email login (deviation documented in docs/VISUAL-SPEC.md).
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        item {
            AssistChip(onClick = {}, label = { Text("Portal Clientes VetCura") })
            Image(
                painterResource(R.drawable.pet_2), "Mascota VetCura",
                Modifier.size(180.dp, 150.dp).clip(RoundedCornerShape(28.dp)),
                contentScale = ContentScale.Crop,
            )
            Surface(
                color = MaterialTheme.colorScheme.primary,
                shape = RoundedCornerShape(999.dp),
            ) { Text("ATENCIÓN 24/7", Modifier.padding(horizontal = 22.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.onPrimary) }
            Text("VetCura", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.ExtraBold)
            Text(
                "Cuidamos la salud de quienes más amas",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            Text("Historial médico, citas prioritarias y control veterinario integral en la palma de tu mano.")
        }
        item {
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
                            error = "No se pudo iniciar sesión: ${friendlyError(e)}"
                        } finally {
                            busy = false
                        }
                    }
                },
                Modifier.fillMaxWidth(),
            ) { Text("Acceder con mi clínica") }
            Text("El acceso con Google requiere configurar OAuth (ver docs).", style = MaterialTheme.typography.bodySmall)
        }
    }
}

private data class HomeData(
    val ownerName: String,
    val pets: List<com.vetcura.app.data.Pet>,
    val alerts: List<com.vetcura.app.data.Alert>,
    val upcoming: List<com.vetcura.app.data.Appointment>,
)

@Composable
fun HomeScreen(
    api: VetCuraApi,
    auth: String,
    onPet: (Int) -> Unit,
    onTab: (Int) -> Unit,
) {
    var state by remember { mutableStateOf<HomeData?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(auth) {
        scope.launch {
            try {
                val me = api.me("Bearer $auth").user
                val owner = api.owner("Bearer $auth", me.id).owner
                val pets = api.pets("Bearer $auth").pets
                val alerts = api.alerts("Bearer $auth").alerts
                val upcoming = api.appointments("Bearer $auth").appointments
                    .filter { it.status == "scheduled" || it.status == "checked_in" }
                    .sortedBy { it.starts_at }
                    .take(3)
                state = HomeData(owner.display_name, pets, alerts, upcoming)
            } catch (e: Exception) {
                error = "No se pudo cargar el inicio: ${friendlyError(e)}"
            }
        }
    }
    val s = state
    when {
        error != null -> Text(error!!, Modifier.padding(24.dp), color = MaterialTheme.colorScheme.error)
        s == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else -> LazyColumn(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Text("¡Hola, ${s.ownerName}!", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("Tus regalones al día y con mucho amor", style = MaterialTheme.typography.bodyMedium)
            }
            val top = s.alerts.firstOrNull()
            if (top != null) {
                item {
                    Card(
                        Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
                    ) {
                        Column(Modifier.padding(16.dp), Arrangement.spacedBy(6.dp)) {
                            Text(
                                if (top.overdue) "URGENTE · Venció el ${top.due_date}" else "Próximo vencimiento · ${top.due_date}",
                                style = MaterialTheme.typography.labelLarge,
                            )
                            Text("${top.vaccine} para ${top.pet_name}", style = MaterialTheme.typography.titleMedium)
                            Button(onClick = { onPet(top.pet_id) }) { Text("Ver detalle") }
                        }
                    }
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    Text("Mis Consentidos", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                }
            }
            if (s.pets.isEmpty()) {
                item { Text("Aún no tienes mascotas registradas.") }
            } else {
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(s.pets) { pet ->
                            val hasAlert = s.alerts.any { it.pet_id == pet.id }
                            Card(Modifier.width(220.dp)) {
                                Column {
                                    Image(
                                        painterResource(photoFor(pet.id, pet.species)), pet.name,
                                        Modifier.fillMaxWidth().height(130.dp),
                                        contentScale = ContentScale.Crop,
                                    )
                                    Column(Modifier.padding(12.dp), Arrangement.spacedBy(4.dp)) {
                                        Text(pet.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                        Text("${pet.breed ?: pet.species} · ${ageYears(pet.birthdate)}")
                                        Text(if (hasAlert) "Atención vacuna" else "Saludable")
                                        Text("Peso: ${pet.weight_kg?.toString() ?: "—"} kg")
                                        Button(onClick = { onPet(pet.id) }, Modifier.fillMaxWidth()) {
                                            Text("Ver Carnet Clínico")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            item {
                Text("Atención & Servicios", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(10.dp)) {
                        Card(onClick = { onTab(1) }, Modifier.weight(1f)) {
                            Column(Modifier.padding(14.dp)) {
                                Text("Historial de Vacunas", fontWeight = FontWeight.Bold)
                                Text("Control y refuerzos", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        Card(onClick = { onTab(1) }, Modifier.weight(1f)) {
                            Column(Modifier.padding(14.dp)) {
                                Text("Tratamientos", fontWeight = FontWeight.Bold)
                                Text("Dosis y recetas", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                    Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(10.dp)) {
                        Card(onClick = { onTab(2) }, Modifier.weight(1f)) {
                            Column(Modifier.padding(14.dp)) {
                                Text("Próximas Citas", fontWeight = FontWeight.Bold)
                                Text("${s.upcoming.size} programadas", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        Card(onClick = { onTab(3) }, Modifier.weight(1f)) {
                            Column(Modifier.padding(14.dp)) {
                                Text("Mi Perfil", fontWeight = FontWeight.Bold)
                                Text("Datos y facturas", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    Text("Próximas Citas", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    if (s.upcoming.isNotEmpty()) Text("${s.upcoming.size} programadas", style = MaterialTheme.typography.labelLarge)
                }
            }
            if (s.upcoming.isEmpty()) {
                item { Text("Sin citas programadas.") }
            } else {
                items(s.upcoming) { a ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp)) {
                            Text(friendlyDateTime(a.starts_at), style = MaterialTheme.typography.titleSmall)
                            Text(a.reason ?: "Control general", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            item {
                Button(onClick = { onTab(2) }, Modifier.fillMaxWidth()) { Text("+ Solicitar Cita") }
            }
        }
    }
}

private data class TimelineEntry(
    val date: String,
    val title: String,
    val detail: String,
)

@Composable
fun HistoryAllScreen(api: VetCuraApi, auth: String, onPet: (Int) -> Unit) {
    var entries by remember { mutableStateOf<List<Pair<Int, TimelineEntry>>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(auth) {
        scope.launch {
            try {
                val pets = api.pets("Bearer $auth").pets
                val all = mutableListOf<Pair<Int, TimelineEntry>>()
                for (pet in pets) {
                    val h = api.history("Bearer $auth", pet.id)
                    for (c in h.consultations) {
                        all.add(pet.id to TimelineEntry(c.created_at, "${pet.name} · ${c.diagnosis}", c.treatment ?: ""))
                    }
                    for (v in h.vaccinations) {
                        val state = if (v.given_date == null) "Pendiente (vence ${v.due_date})" else "Aplicada el ${v.given_date}"
                        all.add(pet.id to TimelineEntry(v.due_date, "${pet.name} · Vacuna ${v.vaccine}", state))
                    }
                }
                entries = all.sortedByDescending { it.second.date }
            } catch (e: Exception) {
                error = "No se pudo cargar el historial: ${friendlyError(e)}"
            }
        }
    }
    val list = entries
    when {
        error != null -> Text(error!!, Modifier.padding(24.dp), color = MaterialTheme.colorScheme.error)
        list == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        list.isEmpty() -> Text("Sin historial clínico todavía.", Modifier.padding(24.dp))
        else -> LazyColumn(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(list) { (petId, e) ->
                Card(onClick = { onPet(petId) }, Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Text(e.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text(e.date, style = MaterialTheme.typography.bodySmall)
                        if (e.detail.isNotBlank()) Text(e.detail)
                    }
                }
            }
        }
    }
}

@Composable
fun ProfileScreen(api: VetCuraApi, auth: String, onLogout: () -> Unit) {
    var name by remember { mutableStateOf<String?>(null) }
    var email by remember { mutableStateOf<String?>(null) }
    var phone by remember { mutableStateOf<String?>(null) }
    var invoices by remember { mutableStateOf<List<com.vetcura.app.data.Invoice>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(auth) {
        scope.launch {
            try {
                val me = api.me("Bearer $auth").user
                val owner = api.owner("Bearer $auth", me.id).owner
                name = owner.display_name
                email = owner.email
                phone = owner.phone
                invoices = api.invoices("Bearer $auth").invoices
            } catch (e: Exception) {
                error = "No se pudo cargar el perfil: ${friendlyError(e)}"
            }
        }
    }
    if (error != null) {
        Text(error!!, Modifier.padding(24.dp), color = MaterialTheme.colorScheme.error)
    } else if (name == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
    } else {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), Arrangement.spacedBy(4.dp)) {
                        Text(name!!, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text(email ?: "")
                        Text(phone ?: "Sin teléfono registrado")
                    }
                }
                Text("Mis Facturas", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
            }
            val invs = invoices
            if (invs == null) {
                item { CircularProgressIndicator() }
            } else if (invs.isEmpty()) {
                item { Text("No tienes facturas disponibles.") }
            } else {
                items(invs) { i ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp)) {
                            Text("Factura #${i.id} · ${i.status}", fontWeight = FontWeight.Bold)
                            Text("Total: ${(i.total_cents / 100.0)}")
                        }
                    }
                }
            }
            item {
                OutlinedButton(onClick = onLogout, Modifier.fillMaxWidth()) { Text("Cerrar sesión") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppointmentsScreen(api: VetCuraApi, auth: String) {
    var items by remember { mutableStateOf<List<com.vetcura.app.data.Appointment>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var petId by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }
    var durationMin by remember { mutableStateOf(30) }
    val dateState = rememberDatePickerState()
    val timeState = rememberTimePickerState(initialHour = 10, initialMinute = 0, is24Hour = true)
    val scope = rememberCoroutineScope()

    suspend fun refresh() {
        try {
            items = api.appointments("Bearer $auth").appointments
        } catch (e: Exception) {
            error = "No se pudieron cargar las citas: ${friendlyError(e)}"
        }
    }
    LaunchedEffect(auth) { refresh() }

    val dateLabel = dateState.selectedDateMillis?.let { millis ->
        java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
            .format(java.util.Date(millis))
    } ?: "Elegir fecha"
    val timeLabel = "%02d:%02d".format(timeState.hour, timeState.minute)

    if (showDate) {
        DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = { TextButton(onClick = { showDate = false }) { Text("Aceptar") } },
        ) {
            DatePicker(state = dateState)
        }
    }
    if (showTime) {
        AlertDialog(
            onDismissRequest = { showTime = false },
            confirmButton = { TextButton(onClick = { showTime = false }) { Text("Aceptar") } },
            text = { TimePicker(state = timeState) },
        )
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Solicitar cita", style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(petId, { petId = it }, label = { Text("ID de mascota (figura en su tarjeta)") })
            OutlinedTextField(reason, { reason = it }, label = { Text("Motivo") })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { showDate = true }) { Text(dateLabel) }
                OutlinedButton(onClick = { showTime = true }) { Text(timeLabel) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Duración:", modifier = Modifier.padding(top = 12.dp))
                listOf(30, 60).forEach { mins ->
                    if (mins == durationMin) {
                        Button(onClick = {}) { Text("$mins min") }
                    } else {
                        OutlinedButton(onClick = { durationMin = mins }) { Text("$mins min") }
                    }
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            notice?.let { Text(it) }
            Button(onClick = {
                val pet = petId.toIntOrNull()
                val day = dateState.selectedDateMillis
                error = when {
                    pet == null -> "Ingresá el ID numérico de tu mascota."
                    day == null -> "Elegí la fecha de la cita."
                    else -> null
                }
                if (error == null) {
                    val zone = java.time.ZoneId.systemDefault()
                    val localDay = java.time.Instant.ofEpochMilli(day!!).atZone(zone).toLocalDate()
                    val start = java.time.LocalDateTime.of(
                        localDay,
                        java.time.LocalTime.of(timeState.hour, timeState.minute),
                    )
                    val end = start.plusMinutes(durationMin.toLong())
                    scope.launch {
                        try {
                            api.book(
                                "Bearer $auth",
                                AppointmentRequest(
                                    pet!!,
                                    null,
                                    start.atZone(zone).toInstant().toString(),
                                    end.atZone(zone).toInstant().toString(),
                                    reason.ifBlank { null },
                                ),
                            )
                            notice = "Cita solicitada para el $dateLabel a las $timeLabel."
                            reason = ""
                            refresh()
                        } catch (e: Exception) {
                            error = "No se pudo solicitar la cita: ${friendlyError(e)}"
                        }
                    }
                }
            }) { Text("Solicitar") }
        }
        items(items ?: emptyList()) { a ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("#${a.id} · ${friendlyStatus(a.status)}", style = MaterialTheme.typography.titleMedium)
                    Text("${friendlyDateTime(a.starts_at)} — ${a.reason ?: "Sin motivo"}")
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
                UiState.Error("No se pudo cargar el historial: ${friendlyError(e)}")
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

private fun friendlyStatus(status: String): String = when (status) {
    "scheduled" -> "Programada"
    "checked_in" -> "En consulta"
    "done" -> "Atendida"
    "cancelled" -> "Cancelada"
    "no_show" -> "No asistió"
    else -> status
}

private fun friendlyDateTime(iso: String): String = try {
    val instant = java.time.Instant.parse(iso)
    val zoned = instant.atZone(java.time.ZoneId.systemDefault())
    java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.getDefault())
        .format(java.util.Date.from(zoned.toInstant()))
} catch (_: Exception) {
    iso
}

private fun friendlyError(e: Exception): String {
    val http = e as? retrofit2.HttpException ?: return e.message ?: "error desconocido"
    return when (http.code()) {
        400 -> "Revisá los datos ingresados."
        401 -> "Tu sesión venció; volvé a entrar."
        403 -> "No tenés permiso para esa acción."
        404 -> "La mascota no existe."
        409 -> "Ese horario ya está ocupado."
        else -> "Error ${http.code()}."
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
