package com.vetcura.app.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

// Session tokens in EncryptedSharedPreferences (Android Keystore backed).
// No tokens in plain preferences, logs or URLs.
class TokenStore(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "vetcura_tokens",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    fun access(): String? = prefs.getString("access", null)
    fun refresh(): String? = prefs.getString("refresh", null)

    fun save(access: String, refresh: String) {
        prefs.edit().putString("access", access).putString("refresh", refresh).apply()
    }

    fun clear() {
        prefs.edit().remove("access").remove("refresh").apply()
    }
}

// Silently rotates the access token on 401 and retries the original
// request a single time. Refreshes are serialized: concurrent 401s
// (e.g. parallel screen loads) must not race the single-use rotation.
// When no usable session remains, onAuthLost fires so the UI can offer
// login again instead of trapping the user on error screens.
class TokenAuthenticator(
    private val store: TokenStore,
    private val baseUrl: String,
    private val onAuthLost: () -> Unit = {},
) : Authenticator {
    private val lock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        synchronized(lock) {
            if (responseCount(response) >= 2) return null
            if (response.request.url.encodedPath.endsWith("auth/refresh")) return null
            val failedToken = response.request.header("Authorization")
                ?.removePrefix("Bearer")?.trim()
            // Another request already rotated while we waited: retry with
            // the fresh token instead of burning the (now dead) refresh.
            val current = store.access()
            if (current != null && current != failedToken) {
                return response.request.newBuilder()
                    .header("Authorization", "Bearer $current")
                    .build()
            }
            val refresh = store.refresh()
            if (refresh == null) {
                onAuthLost()
                return null
            }
            val rotated = try {
                val plain = buildApi(baseUrl)
                val call = plain.refreshCall(RefreshRequest(refresh)).execute()
                if (!call.isSuccessful) null else call.body()
            } catch (_: Exception) {
                null
            }
            if (rotated == null) {
                store.clear()
                onAuthLost()
                return null
            }
            store.save(rotated.token, rotated.refreshToken)
            return response.request.newBuilder()
                .header("Authorization", "Bearer ${rotated.token}")
                .build()
        }
    }

    private fun responseCount(response: Response): Int {
        var result = 1
        var prior = response.priorResponse
        while (prior != null) {
            result += 1
            prior = prior.priorResponse
        }
        return result
    }
}
