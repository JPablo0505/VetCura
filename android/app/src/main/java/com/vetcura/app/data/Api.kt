package com.vetcura.app.data

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

// Backend contract mirror (backend/src/routes/*). Totals and enforcement
// always come from the server; the app never computes billing.
data class User(val id: Int, val email: String, val role: String, val display_name: String)
data class LoginRequest(val email: String, val password: String)
data class GoogleRequest(val id_token: String)
data class AuthResponse(val token: String, val user: User)
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
)
data class PetsResponse(val pets: List<Pet>)
data class Vaccination(
    val id: Int,
    val pet_id: Int,
    val vaccine: String,
    val due_date: String,
    val given_date: String?,
)
data class PetDetailResponse(val pet: Pet, val vaccinations: List<Vaccination>)
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
data class MeResponse(val user: User)
data class Owner(val user_id: Int, val email: String, val display_name: String, val phone: String?, val address: String?)
data class OwnerDetailResponse(val owner: Owner, val pets: List<Pet>)

interface VetCuraApi {
    @POST("auth/login") suspend fun login(@Body body: LoginRequest): AuthResponse
    @POST("auth/google") suspend fun google(@Body body: GoogleRequest): AuthResponse
    @GET("auth/me") suspend fun me(@Header("Authorization") auth: String): MeResponse
    @GET("owners/{id}") suspend fun owner(@Header("Authorization") auth: String, @Path("id") id: Int): OwnerDetailResponse
    @GET("pets") suspend fun pets(@Header("Authorization") auth: String): PetsResponse
    @GET("pets/{id}") suspend fun pet(@Header("Authorization") auth: String, @Path("id") id: Int): PetDetailResponse
    @GET("pets/{id}/history") suspend fun history(@Header("Authorization") auth: String, @Path("id") id: Int): HistoryResponse
    @GET("appointments") suspend fun appointments(@Header("Authorization") auth: String): AppointmentsResponse
    @POST("appointments") suspend fun book(@Header("Authorization") auth: String, @Body body: AppointmentRequest): Map<String, Appointment>
    @GET("vaccinations/alerts") suspend fun alerts(@Header("Authorization") auth: String): AlertsResponse
    @GET("invoices") suspend fun invoices(@Header("Authorization") auth: String): InvoicesResponse
    @GET("invoices/{id}") suspend fun invoice(@Header("Authorization") auth: String, @Path("id") id: Int): InvoiceResponse
}

fun buildApi(baseUrl: String): VetCuraApi = Retrofit.Builder()
    .baseUrl(if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/")
    .addConverterFactory(GsonConverterFactory.create())
    .build()
    .create(VetCuraApi::class.java)
