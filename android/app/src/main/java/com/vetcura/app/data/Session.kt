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

// Silently rotates the access token once per 401 using the stored
// refresh token, then retries the original request a single time.
class TokenAuthenticator(
    private val store: TokenStore,
    private val baseUrl: String,
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null
        if (response.request.url.encodedPath.endsWith("auth/refresh")) return null
        val refresh = store.refresh() ?: return null
        val rotated = try {
            val plain = buildApi(baseUrl)
            val call = plain.refreshCall(RefreshRequest(refresh)).execute()
            if (!call.isSuccessful) return null
            call.body() ?: return null
        } catch (_: Exception) {
            return null
        }
        store.save(rotated.token, rotated.refreshToken)
        return response.request.newBuilder()
            .header("Authorization", "Bearer ${rotated.token}")
            .build()
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
