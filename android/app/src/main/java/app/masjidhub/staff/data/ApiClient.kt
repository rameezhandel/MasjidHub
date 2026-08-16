package app.masjidhub.staff.data

import app.masjidhub.staff.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/** What went wrong, in words a person can read. */
sealed class ApiException(message: String) : Exception(message) {
    class Unauthorized : ApiException("Your session has expired. Please sign in again.")
    class Server(val status: Int, message: String) : ApiException(message)
    class Offline : ApiException("Cannot reach the server. Check your connection and try again.")
    class Malformed(detail: String) : ApiException("Unexpected response from the server. ($detail)")
}

/**
 * Everything the app sends goes through here: it attaches the bearer token,
 * retries once through /auth/refresh on a 401, and turns API error bodies into
 * readable text.
 */
class ApiClient(private val tokens: TokenStore) {

    private val baseUrl = BuildConfig.API_BASE_URL.trimEnd('/') + "/api/v1"

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    private val http = OkHttpClient.Builder()
        // Render's free tier sleeps; a cold start can take most of a minute.
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    /** Called when refreshing fails, so the app can drop back to the login screen. */
    var onAuthFailure: (() -> Unit)? = null

    private val refreshLock = Mutex()

    // Requests

    suspend fun <T> get(path: String, serializer: KSerializer<T>): T =
        decode(serializer, request("GET", path, null))

    suspend fun <T> post(path: String, body: String, serializer: KSerializer<T>): T =
        decode(serializer, request("POST", path, body))

    suspend fun <T> patch(path: String, body: String, serializer: KSerializer<T>): T =
        decode(serializer, request("PATCH", path, body))

    /** For endpoints that answer 204 with no body. */
    suspend fun postNoContent(path: String, body: String) {
        request("POST", path, body)
    }

    suspend fun login(email: String, password: String): AuthTokens = decode(
        AuthTokens.serializer(),
        request(
            method = "POST",
            path = "/auth/login",
            body = encode(Credentials.serializer(), Credentials(email, password)),
            authenticated = false,
        ),
    )

    /** Revokes the refresh token server-side; failures are not worth surfacing. */
    suspend fun logout() {
        val refresh = tokens.refreshToken ?: return
        try {
            request("POST", "/auth/logout", encode(RefreshRequest.serializer(), RefreshRequest(refresh)))
        } catch (_: Exception) {
            // Signing out locally is what matters.
        }
    }

    fun <T> encode(serializer: KSerializer<T>, value: T): String =
        json.encodeToString(serializer, value)

    // Plumbing

    private fun <T> decode(serializer: KSerializer<T>, payload: String): T = try {
        json.decodeFromString(serializer, payload)
    } catch (e: Exception) {
        throw ApiException.Malformed(e.message ?: e.javaClass.simpleName)
    }

    /** Returns the raw response body, or throws an [ApiException]. */
    private suspend fun request(
        method: String,
        path: String,
        body: String?,
        authenticated: Boolean = true,
        isRetry: Boolean = false,
    ): String = withContext(Dispatchers.IO) {
        val builder = Request.Builder()
            .url(baseUrl + path)
            .header("Accept", "application/json")
            .method(method, body?.toRequestBody(JSON_MEDIA_TYPE))

        if (authenticated) {
            tokens.accessToken?.let { builder.header("Authorization", "Bearer $it") }
        }

        val response = try {
            http.newCall(builder.build()).execute()
        } catch (_: IOException) {
            throw ApiException.Offline()
        }

        val status = response.code
        val payload = response.use { it.body?.string().orEmpty() }

        if (status == 401 && authenticated && !isRetry) {
            return@withContext if (refreshTokens()) {
                request(method, path, body, authenticated, isRetry = true)
            } else {
                onAuthFailure?.invoke()
                throw ApiException.Unauthorized()
            }
        }

        if (status !in 200..299) {
            throw ApiException.Server(status, messageFrom(payload, status))
        }

        payload
    }

    private suspend fun refreshTokens(): Boolean = refreshLock.withLock {
        val refresh = tokens.refreshToken ?: return@withLock false
        try {
            val fresh = decode(
                AuthTokens.serializer(),
                request(
                    method = "POST",
                    path = "/auth/refresh",
                    body = encode(RefreshRequest.serializer(), RefreshRequest(refresh)),
                    authenticated = false,
                    isRetry = true,
                ),
            )
            tokens.save(fresh)
            true
        } catch (_: Exception) {
            tokens.clear()
            false
        }
    }

    /** Nest returns `{ message: string | string[] }` on failures. */
    private fun messageFrom(payload: String, status: Int): String {
        val fallback = "The server returned an error ($status)."
        if (payload.isBlank()) return fallback
        return try {
            when (val message = (json.parseToJsonElement(payload) as? JsonObject)?.get("message")) {
                is JsonPrimitive -> message.content.ifBlank { fallback }
                is JsonArray ->
                    message.joinToString("; ") { it.jsonPrimitive.content }.ifBlank { fallback }
                else -> fallback
            }
        } catch (_: Exception) {
            fallback
        }
    }

    private companion object {
        val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }
}

/** Builds `/path?a=1&b=two%20words`. Null or blank values are dropped. */
fun endpoint(path: String, query: Map<String, String?> = emptyMap()): String {
    val items = query.entries
        .filter { !it.value.isNullOrBlank() }
        .joinToString("&") { (key, value) ->
            "${URLEncoder.encode(key, "UTF-8")}=${URLEncoder.encode(value, "UTF-8")}"
        }
    return if (items.isEmpty()) path else "$path?$items"
}
