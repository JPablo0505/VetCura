package com.vetcura.app.data

import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.ResponseBody
import retrofit2.Call
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

// Backend contract mirror (backend/src/routes/*). Totals and enforcement
// always come from the server; the app never computes billing.
data class User(val id: Int, val email: String, val role: String, val display_name: String)
data class LoginRequest(val email: String, val password: String)
data class GoogleRequest(val id_token: String)
data class AuthResponse(val token: String, val refreshToken: String, val user: User)
data class RefreshRequest(val refresh_token: String)
data class LinkRequest(val id_token: String, val email: String? = null, val password: String? = null)
data class LinkResponse(val linked: Boolean)
data class Pet(
    val id: Int,
    val owner_id: Int,
    val name: String,
    val species: String,
    val breed: String?,
    val birthdate: String?,
    val sex: String,
    val weight_kg: Double?,
    val photo_url: String?,
    val photo_path: String?,
)
data class PetsResponse(val pets: List<Pet>)
data class Vaccination(
    val id: Int,
    val pet_id: Int,
    val vaccine: String,
    val due_date: String,
    val given_date: String?,
)
data class Measurement(val weight_kg: Double, val date: String, val source: String)
data class PetDetailResponse(val pet: Pet, val vaccinations: List<Vaccination>, val measurements: List<Measurement> = emptyList())
data class PetPatch(
    val name: String? = null,
    val species: String? = null,
    val breed: String? = null,
    val birthdate: String? = null,
    val sex: String? = null,
    val weight_kg: Double? = null,
    val photo_url: String? = null,
)
data class Appointment(
    val id: Int,
    val pet_id: Int,
    val vet_user_id: Int?,
    val starts_at: String,
    val ends_at: String,
    val status: String,
    val reason: String?,
    val pet_name: String? = null,
)
data class AppointmentsResponse(val appointments: List<Appointment>)
data class AppointmentRequest(
    val pet_id: Int,
    val vet_user_id: Int?,
    val starts_at: String,
    val ends_at: String,
    val reason: String?,
)
data class Consultation(
    val id: Int,
    val diagnosis: String,
    val treatment: String?,
    val created_at: String,
    val allergies: List<String>,
)
data class HistoryResponse(val consultations: List<Consultation>, val vaccinations: List<Vaccination>)
data class InvoiceItem(val id: Int, val description: String, val qty: Int, val line_total_cents: Int)
data class Invoice(
    val id: Int,
    val status: String,
    val subtotal_cents: Int,
    val tax_cents: Int,
    val total_cents: Int,
    val items: List<InvoiceItem> = emptyList(),
)
data class InvoicesResponse(val invoices: List<Invoice>)
data class InvoiceResponse(val invoice: Invoice)
data class Alert(val id: Int, val pet_id: Int, val pet_name: String, val vaccine: String, val due_date: String, val overdue: Boolean)
data class AlertsResponse(val alerts: List<Alert>)
data class Vet(val id: Int, val email: String, val display_name: String)
data class VetsResponse(val vets: List<Vet>)
data class Slot(val starts_at: String, val ends_at: String)
data class SlotsResponse(val vet_id: Int, val date: String, val slot_min: Int, val slots: List<Slot>)
data class MeResponse(val user: User)
data class Owner(val user_id: Int, val email: String, val display_name: String, val phone: String?, val address: String?, val email_verified: Int = 0, val photo_path: String? = null)
data class OwnerDetailResponse(val owner: Owner, val pets: List<Pet>)
data class Prefs(val push_enabled: Int, val email_enabled: Int, val appointment_reminders: Int, val vaccination_reminders: Int)
data class ProfileResponse(val profile: Profile)
data class Profile(
    val user_id: Int,
    val email: String,
    val display_name: String,
    val phone: String?,
    val address: String?,
    val photo_path: String?,
    val email_verified: Int,
    val preferences: Prefs,
)
data class ProfilePatch(val display_name: String? = null, val phone: String? = null, val address: String? = null)
data class PrefsPatch(
    val push_enabled: Boolean? = null,
    val email_enabled: Boolean? = null,
    val appointment_reminders: Boolean? = null,
    val vaccination_reminders: Boolean? = null,
)
data class PrefsResponse(val preferences: Prefs)
data class Device(val id: Int, val platform: String, val last_seen: String, val created_at: String)
data class DevicesResponse(val devices: List<Device>)
data class DeviceRequest(val fcm_token: String, val platform: String = "android")
data class NotifItem(val id: Int, val kind: String, val title: String, val body: String, val status: String, val scheduled_for: String, val sent_at: String?)
data class NotificationsResponse(val notifications: List<NotifItem>)

interface VetCuraApi {
    @POST("auth/login") suspend fun login(@Body body: LoginRequest): AuthResponse
    @POST("auth/google") suspend fun google(@Body body: GoogleRequest): AuthResponse
    @PUT("auth/google/link") suspend fun linkGoogle(@Header("Authorization") auth: String, @Body body: GoogleRequest): LinkResponse
    @POST("auth/google/link") suspend fun linkGooglePassword(@Body body: LinkRequest): AuthResponse
    @POST("auth/refresh") suspend fun refresh(@Body body: RefreshRequest): AuthResponse
    @POST("auth/refresh") fun refreshCall(@Body body: RefreshRequest): Call<AuthResponse>
    @POST("auth/logout") suspend fun logout(@Body body: RefreshRequest): Map<String, Boolean>
    @GET("auth/me") suspend fun me(@Header("Authorization") auth: String): MeResponse
    @GET("owners/{id}") suspend fun owner(@Header("Authorization") auth: String, @Path("id") id: Int): OwnerDetailResponse
    @GET("me/profile") suspend fun myProfile(@Header("Authorization") auth: String): ProfileResponse
    @PATCH("me/profile") suspend fun updateProfile(@Header("Authorization") auth: String, @Body body: ProfilePatch): ProfileResponse
    @GET("me/preferences") suspend fun prefs(@Header("Authorization") auth: String): PrefsResponse
    @PATCH("me/preferences") suspend fun updatePrefs(@Header("Authorization") auth: String, @Body body: PrefsPatch): PrefsResponse
    @Multipart @POST("me/photo") suspend fun uploadMyPhoto(@Header("Authorization") auth: String, @Part photo: MultipartBody.Part): Map<String, String>
    @GET("me/photo") suspend fun myPhoto(@Header("Authorization") auth: String): ResponseBody
    @GET("pets") suspend fun pets(@Header("Authorization") auth: String): PetsResponse
    @GET("pets/{id}") suspend fun pet(@Header("Authorization") auth: String, @Path("id") id: Int): PetDetailResponse
    @PATCH("pets/{id}") suspend fun updatePet(@Header("Authorization") auth: String, @Path("id") id: Int, @Body body: PetPatch): PetDetailResponse
    @Multipart @POST("pets/{id}/photo") suspend fun uploadPetPhoto(@Header("Authorization") auth: String, @Path("id") id: Int, @Part photo: MultipartBody.Part): Map<String, String>
    @GET("pets/{id}/history") suspend fun history(@Header("Authorization") auth: String, @Path("id") id: Int): HistoryResponse
    @GET("appointments") suspend fun appointments(@Header("Authorization") auth: String): AppointmentsResponse
    @POST("appointments") suspend fun book(@Header("Authorization") auth: String, @Body body: AppointmentRequest): Map<String, Appointment>
    @GET("vaccinations/alerts") suspend fun alerts(@Header("Authorization") auth: String): AlertsResponse
    @GET("vets") suspend fun vets(@Header("Authorization") auth: String): VetsResponse
    @GET("vets/{id}/slots") suspend fun slots(@Header("Authorization") auth: String, @Path("id") id: Int, @Query("date") date: String): SlotsResponse
    @GET("invoices") suspend fun invoices(@Header("Authorization") auth: String): InvoicesResponse
    @GET("invoices/{id}") suspend fun invoice(@Header("Authorization") auth: String, @Path("id") id: Int): InvoiceResponse
    @GET("me/devices") suspend fun devices(@Header("Authorization") auth: String): DevicesResponse
    @POST("me/devices") suspend fun registerDevice(@Header("Authorization") auth: String, @Body body: DeviceRequest): Map<String, Boolean>
    @DELETE("me/devices/{id}") suspend fun removeDevice(@Header("Authorization") auth: String, @Path("id") id: Int): Map<String, Boolean>
    @GET("me/notifications") suspend fun notifications(@Header("Authorization") auth: String, @Query("status") status: String? = null): NotificationsResponse
}

fun okHttp(authenticator: okhttp3.Authenticator? = null): OkHttpClient =
    OkHttpClient.Builder().apply { authenticator?.let { authenticator(it) } }.build()

fun buildApi(baseUrl: String, authenticator: okhttp3.Authenticator? = null): VetCuraApi =
    Retrofit.Builder()
        .baseUrl(if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/")
        .client(okHttp(authenticator))
        .addConverterFactory(GsonConverterFactory.create())
        .build()
        .create(VetCuraApi::class.java)
