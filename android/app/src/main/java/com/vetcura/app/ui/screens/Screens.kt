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
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Medication
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Vaccines
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
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
import coil.compose.AsyncImage
import coil.request.ImageRequest
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.vetcura.app.R
import com.vetcura.app.data.AppointmentRequest
import com.vetcura.app.data.VetCuraApi
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

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
fun LoginScreen(api: VetCuraApi, onSession: (String, String) -> Unit) {
    // Mirrors Mockups/Login.svg. The mockup's anonymous pet-ID button
    // would expose clinical data without auth, so clinic access is the
    // real email login (deviation documented in docs/VISUAL-SPEC.md).
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current
    val googleReady = com.vetcura.app.BuildConfig.GOOGLE_CLIENT_ID.isNotBlank()
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
            if (googleReady) {
                OutlinedButton(
                    onClick = {
                        busy = true
                        error = null
                        scope.launch {
                            try {
                                when (val g = requestGoogleIdToken(context)) {
                                    is GoogleResult.Token -> {
                                        val r = api.google(com.vetcura.app.data.GoogleRequest(g.idToken))
                                        onSession(r.token, r.refreshToken)
                                    }
                                    is GoogleResult.Cancelled -> Unit
                                    is GoogleResult.Error -> error = "Google: ${g.message}"
                                }
                            } catch (e: Exception) {
                                error = googleLinkHint(e)
                            } finally {
                                busy = false
                            }
                        }
                    },
                    Modifier.fillMaxWidth(),
                ) { Text("Continuar con Google") }
            }
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
                            onSession(r.token, r.refreshToken)
                        } catch (e: Exception) {
                            error = "No se pudo iniciar sesión: ${friendlyError(e)}"
                        } finally {
                            busy = false
                        }
                    }
                },
                Modifier.fillMaxWidth(),
            ) { Text("Acceder con mi clínica") }
            if (!googleReady) {
                Text("El acceso con Google requiere configurar OAuth (ver docs).", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

private fun googleLinkHint(e: Exception): String {
    val http = e as? retrofit2.HttpException
    if (http?.code() == 409) {
        return "Tu correo ya tiene cuenta: entra con tu correo y vincúlalo desde Perfil."
    }
    return "No se pudo iniciar sesión con Google: ${friendlyError(e)}"
}

private data class HomeData(
    val ownerName: String,
    val ownerPhoto: String?,
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
                state = HomeData(owner.display_name, owner.photo_path, pets, alerts, upcoming)
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
                Row(
                    Modifier.fillMaxWidth(),
                    Arrangement.SpaceBetween,
                    Alignment.CenterVertically,
                ) {
                    Column {
                        Text("¡Hola, ${s.ownerName}!", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        Text("Tus regalones al día y con mucho amor", style = MaterialTheme.typography.bodyMedium)
                    }
                    if (s.ownerPhoto != null) {
                        AuthImage(
                            auth,
                            "${com.vetcura.app.BuildConfig.API_URL}/me/photo",
                            s.ownerName,
                            Modifier.size(56.dp).clip(CircleShape),
                        )
                    } else {
                        Surface(
                            color = MaterialTheme.colorScheme.primary,
                            shape = CircleShape,
                            modifier = Modifier.size(56.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    s.ownerName.take(1).uppercase(),
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }
                }
            }
            val top = s.alerts.firstOrNull()
            if (top != null) {
                item {
                    Card(
                        Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
                        shape = RoundedCornerShape(20.dp),
                    ) {
                        Column(Modifier.padding(16.dp), Arrangement.spacedBy(6.dp)) {
                            AssistChip(
                                onClick = {},
                                label = { Text(if (top.overdue) "URGENTE" else "PRÓXIMO VENCIMIENTO") },
                            )
                            Text("${top.vaccine} para ${top.pet_name}", style = MaterialTheme.typography.titleMedium)
                            Text("Vence el ${top.due_date}", style = MaterialTheme.typography.bodyMedium)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = { onPet(top.pet_id) }) { Text("Ver detalle") }
                            }
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
                            val petAlerts = s.alerts.filter { it.pet_id == pet.id }
                            Card(Modifier.width(230.dp), shape = RoundedCornerShape(20.dp)) {
                                Column {
                                    Box {
                                        if (pet.photo_path != null) {
                                            AuthImage(
                                                auth,
                                                "${com.vetcura.app.BuildConfig.API_URL}/pets/${pet.id}/photo",
                                                pet.name,
                                                Modifier.fillMaxWidth().height(140.dp),
                                            )
                                        } else {
                                            Image(
                                                painterResource(photoFor(pet.id, pet.species)), pet.name,
                                                Modifier.fillMaxWidth().height(140.dp),
                                                contentScale = ContentScale.Crop,
                                            )
                                        }
                                        Surface(
                                            color = if (petAlerts.isEmpty()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                                            shape = RoundedCornerShape(999.dp),
                                            modifier = Modifier.padding(8.dp),
                                        ) {
                                            Text(
                                                if (petAlerts.isEmpty()) "Saludable" else "Atención",
                                                Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                                color = MaterialTheme.colorScheme.onPrimary,
                                                style = MaterialTheme.typography.labelSmall,
                                            )
                                        }
                                    }
                                    Column(Modifier.padding(12.dp), Arrangement.spacedBy(4.dp)) {
                                        Text(pet.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                        Text("${pet.breed ?: pet.species} · ${ageYears(pet.birthdate)}")
                                        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                                            Column {
                                                Text("Peso Actual", style = MaterialTheme.typography.labelSmall)
                                                Text(
                                                    "${pet.weight_kg?.toString() ?: "—"} kg",
                                                    style = MaterialTheme.typography.titleMedium,
                                                    color = MaterialTheme.colorScheme.primary,
                                                    fontWeight = FontWeight.Bold,
                                                )
                                            }
                                            Column(horizontalAlignment = Alignment.End) {
                                                Text("Vacunas", style = MaterialTheme.typography.labelSmall)
                                                Text(
                                                    if (petAlerts.isEmpty()) "Al día" else "${petAlerts.size} pendientes",
                                                    style = MaterialTheme.typography.titleSmall,
                                                    fontWeight = FontWeight.Bold,
                                                )
                                            }
                                        }
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
                            Column(Modifier.padding(14.dp), Arrangement.spacedBy(4.dp)) {
                                Icon(
                                    Icons.Filled.Vaccines, "Vacunas",
                                    tint = MaterialTheme.colorScheme.primary,
                                )
                                Text("Historial de Vacunas", fontWeight = FontWeight.Bold)
                                Text("Control y refuerzos", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        Card(onClick = { onTab(1) }, Modifier.weight(1f)) {
                            Column(Modifier.padding(14.dp), Arrangement.spacedBy(4.dp)) {
                                Icon(
                                    Icons.Filled.Medication, "Tratamientos",
                                    tint = MaterialTheme.colorScheme.primary,
                                )
                                Text("Tratamientos", fontWeight = FontWeight.Bold)
                                Text("Dosis y recetas", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                    Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(10.dp)) {
                        Card(onClick = { onTab(2) }, Modifier.weight(1f)) {
                            Column(Modifier.padding(14.dp), Arrangement.spacedBy(4.dp)) {
                                Icon(
                                    Icons.Filled.CalendarMonth, "Citas",
                                    tint = MaterialTheme.colorScheme.secondary,
                                )
                                Text("Próximas Citas", fontWeight = FontWeight.Bold)
                                Text("${s.upcoming.size} programadas", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        Card(onClick = { onTab(3) }, Modifier.weight(1f)) {
                            Column(Modifier.padding(14.dp), Arrangement.spacedBy(4.dp)) {
                                Icon(
                                    Icons.Filled.Person, "Perfil",
                                    tint = MaterialTheme.colorScheme.secondary,
                                )
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
                    if (s.upcoming.isNotEmpty()) {
                        AssistChip(onClick = {}, label = { Text("${s.upcoming.size} programadas") })
                    }
                }
            }
            if (s.upcoming.isEmpty()) {
                item { Text("Sin citas programadas.") }
            } else {
                items(s.upcoming) { a ->
                    Card(Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(14.dp), Arrangement.spacedBy(12.dp), Alignment.CenterVertically) {
                            Surface(
                                color = MaterialTheme.colorScheme.primary,
                                shape = RoundedCornerShape(12.dp),
                            ) {
                                Column(
                                    Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    Text(
                                        appointmentDay(a.starts_at),
                                        color = MaterialTheme.colorScheme.onPrimary,
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Text(
                                        appointmentMonth(a.starts_at),
                                        color = MaterialTheme.colorScheme.onPrimary,
                                        style = MaterialTheme.typography.labelSmall,
                                    )
                                }
                            }
                            Column {
                                Text(friendlyTime(a.starts_at), style = MaterialTheme.typography.bodyMedium)
                                Text(a.reason ?: "Control general", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
            item {
                Button(
                    onClick = { onTab(2) },
                    Modifier.fillMaxWidth(),
                    colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.secondary,
                    ),
                ) { Text("+ Solicitar Cita") }
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
    var profile by remember { mutableStateOf<com.vetcura.app.data.Profile?>(null) }
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf(false) }
    var invoices by remember { mutableStateOf<List<com.vetcura.app.data.Invoice>?>(null) }
    var notifs by remember { mutableStateOf<List<com.vetcura.app.data.NotifItem>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var photoTick by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current

    suspend fun reload() {
        try {
            val p = api.myProfile("Bearer $auth").profile
            profile = p
            name = p.display_name
            phone = p.phone ?: ""
            address = p.address ?: ""
            invoices = api.invoices("Bearer $auth").invoices
            notifs = api.notifications("Bearer $auth").notifications.take(10)
        } catch (e: Exception) {
            error = "No se pudo cargar el perfil: ${friendlyError(e)}"
        }
    }
    LaunchedEffect(auth) { reload() }

    val picker = rememberPhotoPicker { bytes, mime ->
        scope.launch {
            try {
                api.uploadMyPhoto("Bearer $auth", photoPart(bytes, mime))
                photoTick += 1
                notice = "Foto actualizada."
                reload()
            } catch (e: Exception) {
                error = "No se pudo subir la foto: ${friendlyError(e)}"
            }
        }
    }

    val p = profile
    if (error != null && p == null) {
        Text(error!!, Modifier.padding(24.dp), color = MaterialTheme.colorScheme.error)
    } else if (p == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
    } else {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), Arrangement.spacedBy(6.dp)) {
                        if (p.photo_path != null) {
                            AuthImage(
                                auth,
                                "${com.vetcura.app.BuildConfig.API_URL}/me/photo?v=$photoTick",
                                "Foto de perfil",
                                Modifier.size(96.dp).clip(CircleShape),
                            )
                        }
                        if (!editing) {
                            Text(p.display_name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            Text(p.email + if (p.email_verified == 1) " · verificado" else "")
                            Text(p.phone ?: "Sin teléfono registrado")
                            Text(p.address ?: "")
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = { editing = true }) { Text("Editar") }
                                OutlinedButton(onClick = { picker.launch("image/*") }) { Text("Foto") }
                            }
                        } else {
                            OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Nombre completo") })
                            OutlinedTextField(phone, { phone = it }, Modifier.fillMaxWidth(), label = { Text("Teléfono") })
                            OutlinedTextField(address, { address = it }, Modifier.fillMaxWidth(), label = { Text("Dirección") })
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = {
                                    scope.launch {
                                        try {
                                            val updated = api.updateProfile(
                                                "Bearer $auth",
                                                com.vetcura.app.data.ProfilePatch(
                                                    display_name = name.ifBlank { null },
                                                    phone = phone.ifBlank { null },
                                                    address = address.ifBlank { null },
                                                ),
                                            )
                                            profile = updated.profile
                                            editing = false
                                            notice = "Perfil guardado."
                                        } catch (e: Exception) {
                                            error = "No se pudo guardar: ${friendlyError(e)}"
                                        }
                                    }
                                }) { Text("Guardar") }
                                OutlinedButton(onClick = {
                                    name = p.display_name
                                    phone = p.phone ?: ""
                                    address = p.address ?: ""
                                    editing = false
                                }) { Text("Cancelar") }
                            }
                        }
                        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                        notice?.let { Text(it) }
                    }
                }
            }
            item {
                PrefRow("Notificaciones push", p.preferences.push_enabled == 1) {
                    scope.launch {
                        try {
                            profile = profile?.copy(preferences = api.updatePrefs("Bearer $auth", com.vetcura.app.data.PrefsPatch(push_enabled = it)).preferences)
                        } catch (e: Exception) {
                            error = friendlyError(e)
                        }
                    }
                }
                PrefRow("Correo", p.preferences.email_enabled == 1) {
                    scope.launch {
                        try {
                            profile = profile?.copy(preferences = api.updatePrefs("Bearer $auth", com.vetcura.app.data.PrefsPatch(email_enabled = it)).preferences)
                        } catch (e: Exception) {
                            error = friendlyError(e)
                        }
                    }
                }
                PrefRow("Recordatorios de citas", p.preferences.appointment_reminders == 1) {
                    scope.launch {
                        try {
                            profile = profile?.copy(preferences = api.updatePrefs("Bearer $auth", com.vetcura.app.data.PrefsPatch(appointment_reminders = it)).preferences)
                        } catch (e: Exception) {
                            error = friendlyError(e)
                        }
                    }
                }
                PrefRow("Recordatorios de vacunas", p.preferences.vaccination_reminders == 1) {
                    scope.launch {
                        try {
                            profile = profile?.copy(preferences = api.updatePrefs("Bearer $auth", com.vetcura.app.data.PrefsPatch(vaccination_reminders = it)).preferences)
                        } catch (e: Exception) {
                            error = friendlyError(e)
                        }
                    }
                }
                if (com.vetcura.app.BuildConfig.GOOGLE_CLIENT_ID.isNotBlank()) {
                    OutlinedButton(onClick = {
                        scope.launch {
                            try {
                                when (val g = requestGoogleIdToken(context)) {
                                    is GoogleResult.Token -> {
                                        api.linkGoogle("Bearer $auth", com.vetcura.app.data.GoogleRequest(g.idToken))
                                        notice = "Cuenta de Google vinculada."
                                        reload()
                                    }
                                    is GoogleResult.Cancelled -> Unit
                                    is GoogleResult.Error -> error = "Google: ${g.message}"
                                }
                            } catch (e: Exception) {
                                error = googleLinkHint(e)
                            }
                        }
                    }, Modifier.fillMaxWidth()) { Text("Vincular cuenta de Google") }
                }
            }
            item {
                Text("Avisos recientes", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            val ns = notifs
            if (ns == null) {
                item { CircularProgressIndicator() }
            } else if (ns.isEmpty()) {
                item { Text("Sin avisos por ahora.") }
            } else {
                items(ns) { n ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            Text(n.title, fontWeight = FontWeight.Bold)
                            Text(n.body, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
            item {
                Text("Mis Facturas", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
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
                            Text("Total: ${formatCOP(i.total_cents)}")
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

@Composable
private fun PrefRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
        Text(label)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppointmentsScreen(api: VetCuraApi, auth: String) {
    var items by remember { mutableStateOf<List<com.vetcura.app.data.Appointment>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var myPets by remember { mutableStateOf<List<com.vetcura.app.data.Pet>>(emptyList()) }
    var selectedPet by remember { mutableStateOf<com.vetcura.app.data.Pet?>(null) }
    var petMenu by remember { mutableStateOf(false) }
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
            myPets = api.pets("Bearer $auth").pets
            if (selectedPet == null) selectedPet = myPets.firstOrNull()
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
            ExposedDropdownMenuBox(expanded = petMenu, onExpandedChange = { petMenu = it }) {
                OutlinedTextField(
                    selectedPet?.name ?: "Elegí tu mascota",
                    {},
                    readOnly = true,
                    label = { Text("Mascota") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(petMenu) },
                    modifier = Modifier.menuAnchor().fillMaxWidth(),
                )
                ExposedDropdownMenu(expanded = petMenu, onDismissRequest = { petMenu = false }) {
                    myPets.forEach { pet ->
                        DropdownMenuItem(
                            text = { Text("${pet.name} · ${pet.breed ?: pet.species}") },
                            onClick = { selectedPet = pet; petMenu = false },
                        )
                    }
                }
            }
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
                val pet = selectedPet
                val day = dateState.selectedDateMillis
                error = when {
                    pet == null -> "Elegí tu mascota."
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
                                    pet!!.id,
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
    var detail by remember { mutableStateOf<com.vetcura.app.data.PetDetailResponse?>(null) }
    var state by remember { mutableStateOf<UiState>(UiState.Loading) }
    var error by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var species by remember { mutableStateOf("") }
    var breed by remember { mutableStateOf("") }
    var birthdate by remember { mutableStateOf("") }
    var weightAdd by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    suspend fun reload() {
        try {
            val d = api.pet("Bearer $auth", petId)
            detail = d
            name = d.pet.name
            species = d.pet.species
            breed = d.pet.breed ?: ""
            birthdate = d.pet.birthdate ?: ""
            val h = api.history("Bearer $auth", petId)
            state = UiState.History(h.consultations, h.vaccinations)
        } catch (e: Exception) {
            state = UiState.Error("No se pudo cargar el historial: ${friendlyError(e)}")
        }
    }
    LaunchedEffect(petId) { reload() }

    val picker = rememberPhotoPicker { bytes, mime ->
        scope.launch {
            try {
                api.uploadPetPhoto("Bearer $auth", petId, photoPart(bytes, mime))
                reload()
            } catch (e: Exception) {
                error = "No se pudo subir la foto: ${friendlyError(e)}"
            }
        }
    }

    val d = detail
    when (val s = state) {
        UiState.Loading -> CircularProgressIndicator(Modifier.padding(24.dp))
        is UiState.Error -> Text(s.message, Modifier.padding(24.dp), color = MaterialTheme.colorScheme.error)
        is UiState.History -> {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (d != null) {
                    item {
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp), Arrangement.spacedBy(6.dp)) {
                                if (d.pet.photo_path != null) {
                                    AuthImage(
                                        auth,
                                        "${com.vetcura.app.BuildConfig.API_URL}/pets/$petId/photo",
                                        d.pet.name,
                                        Modifier.fillMaxWidth().height(170.dp).clip(RoundedCornerShape(12.dp)),
                                    )
                                }
                                if (!editing) {
                                    Text(d.pet.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                                    Text("${d.pet.species}${d.pet.breed?.let { " · $it" } ?: ""} · ${ageYears(d.pet.birthdate)}")
                                    Text("Peso: ${d.pet.weight_kg?.toString() ?: "—"} kg")
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        OutlinedButton(onClick = { editing = true }) { Text("Editar datos") }
                                        OutlinedButton(onClick = { picker.launch("image/*") }) { Text("Foto") }
                                    }
                                } else {
                                    OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Nombre") })
                                    OutlinedTextField(species, { species = it }, Modifier.fillMaxWidth(), label = { Text("Especie") })
                                    OutlinedTextField(breed, { breed = it }, Modifier.fillMaxWidth(), label = { Text("Raza") })
                                    OutlinedTextField(birthdate, { birthdate = it }, Modifier.fillMaxWidth(), label = { Text("Nacimiento (AAAA-MM-DD)") })
                                    OutlinedTextField(weightAdd, { weightAdd = it }, Modifier.fillMaxWidth(), label = { Text("Nuevo peso en kg (se registra fechado)") })
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Button(onClick = {
                                            scope.launch {
                                                try {
                                                    val w = weightAdd.ifBlank { null }?.toDoubleOrNull()
                                                    if (weightAdd.isNotBlank() && (w == null || w <= 0)) {
                                                        error = "El peso debe ser un número mayor que cero."
                                                        return@launch
                                                    }
                                                    api.updatePet(
                                                        "Bearer $auth", petId,
                                                        com.vetcura.app.data.PetPatch(
                                                            name = name.ifBlank { null },
                                                            species = species.ifBlank { null },
                                                            breed = breed.ifBlank { null },
                                                            birthdate = birthdate.ifBlank { null },
                                                            weight_kg = w,
                                                        ),
                                                    )
                                                    weightAdd = ""
                                                    editing = false
                                                    reload()
                                                } catch (e: Exception) {
                                                    error = "No se pudo guardar: ${friendlyError(e)}"
                                                }
                                            }
                                        }) { Text("Guardar") }
                                        OutlinedButton(onClick = { editing = false }) { Text("Cancelar") }
                                    }
                                }
                                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                            }
                        }
                    }
                    if (d.measurements.isNotEmpty()) {
                        item {
                            Card(Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(16.dp), Arrangement.spacedBy(4.dp)) {
                                    Text("Historial de peso", fontWeight = FontWeight.Bold)
                                    d.measurements.takeLast(5).reversed().forEach { m ->
                                        Text("${m.date}: ${m.weight_kg} kg")
                                    }
                                }
                            }
                        }
                    }
                }
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

// Colombian pesos, whole amounts ($ 6.545).
private fun formatCOP(cents: Int): String {
    val pesos = Math.round(cents / 100.0)
    val grouped = java.text.NumberFormat.getInstance(java.util.Locale("es", "CO")).format(pesos)
    return "$ $grouped"
}

private fun friendlyStatus(status: String): String = when (status) {
    "scheduled" -> "Programada"
    "checked_in" -> "En consulta"
    "done" -> "Atendida"
    "cancelled" -> "Cancelada"
    "no_show" -> "No asistió"
    else -> status
}

private fun appointmentDay(iso: String): String = try {
    java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault()).dayOfMonth.toString()
} catch (_: Exception) {
    "•"
}

private fun appointmentMonth(iso: String): String = try {
    val month = java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault()).month
    month.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale("es", "CO"))
} catch (_: Exception) {
    ""
}

private fun friendlyTime(iso: String): String = try {
    val zoned = java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault())
    java.text.SimpleDateFormat("hh:mm a", java.util.Locale("es", "CO"))
        .format(java.util.Date.from(zoned.toInstant()))
} catch (_: Exception) {
    iso
}

private fun friendlyDateTime(iso: String): String = try {    val instant = java.time.Instant.parse(iso)
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

sealed interface GoogleResult {
    data class Token(val idToken: String) : GoogleResult
    data object Cancelled : GoogleResult
    data class Error(val message: String) : GoogleResult
}

// Official Credential Manager flow. The ID token is verified by the
// backend (signature, issuer, expiry, audience); the app never trusts
// identity claims on its own.
suspend fun requestGoogleIdToken(context: android.content.Context): GoogleResult {
    if (com.vetcura.app.BuildConfig.GOOGLE_CLIENT_ID.isBlank()) {
        return GoogleResult.Error("Google no está configurado en esta compilación")
    }
    return try {
        val manager = androidx.credentials.CredentialManager.create(context)
        val option = com.google.android.libraries.identity.googleid.GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(com.vetcura.app.BuildConfig.GOOGLE_CLIENT_ID)
            .build()
        val request = androidx.credentials.GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()
        val result = manager.getCredential(context, request)
        val credential = com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
            .createFrom(result.credential.data)
        if (credential.idToken.isBlank()) GoogleResult.Error("Sin credencial válida")
        else GoogleResult.Token(credential.idToken)
    } catch (_: androidx.credentials.exceptions.GetCredentialCancellationException) {
        GoogleResult.Cancelled
    } catch (e: Exception) {
        GoogleResult.Error(e.message ?: "error desconocido")
    }
}

// Authenticated image loader: private photos travel with the Bearer
// token, never through public URLs.
@Composable
fun AuthImage(
    auth: String,
    url: String,
    desc: String,
    modifier: Modifier = Modifier,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val request = remember(url) {
        coil.request.ImageRequest.Builder(context)
            .data(url)
            .addHeader("Authorization", "Bearer $auth")
            .crossfade(false)
            .build()
    }
    coil.compose.AsyncImage(
        model = request,
        contentDescription = desc,
        modifier = modifier,
        contentScale = ContentScale.Crop,
    )
}

@Composable
fun rememberPhotoPicker(onBytes: (ByteArray, String) -> Unit): androidx.activity.result.ActivityResultLauncher<String> {
    val context = androidx.compose.ui.platform.LocalContext.current
    return rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        try {
            val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            if (bytes != null) onBytes(bytes, mime)
        } catch (_: Exception) {
        }
    }
}

fun photoPart(bytes: ByteArray, mime: String): okhttp3.MultipartBody.Part {
    val media = mime.substringBefore(";").ifBlank { "image/jpeg" }.toMediaType()
    val body = bytes.toRequestBody(media)
    val ext = when {
        media.subtype.contains("png") -> "png"
        media.subtype.contains("webp") -> "webp"
        else -> "jpg"
    }
    return okhttp3.MultipartBody.Part.createFormData("photo", "photo.$ext", body)
}
