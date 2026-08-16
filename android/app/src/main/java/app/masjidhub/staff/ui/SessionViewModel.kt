package app.masjidhub.staff.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.masjidhub.staff.data.ApiClient
import app.masjidhub.staff.data.AuthTokens
import app.masjidhub.staff.data.Masjid
import app.masjidhub.staff.data.TokenStore
import app.masjidhub.staff.data.User
import kotlinx.coroutines.launch

sealed interface SessionState {
    data object Loading : SessionState
    data object SignedOut : SessionState
    data class SignedIn(val user: User) : SessionState
}

/**
 * Who is signed in, and the masjid they work for. Every screen reads the masjid
 * id from here rather than passing it down.
 */
class SessionViewModel(application: Application) : AndroidViewModel(application) {

    private val tokens = TokenStore(application)
    val api = ApiClient(tokens)

    var state by mutableStateOf<SessionState>(SessionState.Loading)
        private set

    var masjid by mutableStateOf<Masjid?>(null)
        private set

    val user: User? get() = (state as? SessionState.SignedIn)?.user

    /** Platform admins have no masjid of their own; the staff app is for staff. */
    val masjidId: String? get() = user?.masjidId

    init {
        api.onAuthFailure = {
            viewModelScope.launch { signOutLocally() }
        }
        restore()
    }

    private fun restore() {
        viewModelScope.launch {
            if (!tokens.isSignedIn) {
                state = SessionState.SignedOut
                return@launch
            }
            try {
                state = SessionState.SignedIn(api.get("/auth/me", User.serializer()))
                loadMasjid()
            } catch (_: Exception) {
                tokens.clear()
                state = SessionState.SignedOut
            }
        }
    }

    suspend fun signIn(email: String, password: String) {
        val fresh: AuthTokens = api.login(email.trim(), password)
        tokens.save(fresh)
        state = SessionState.SignedIn(fresh.user)
        loadMasjid()
    }

    fun signOut() {
        viewModelScope.launch {
            api.logout()
            tokens.clear()
            signOutLocally()
        }
    }

    /** Re-reads the profile after the user edits their name. */
    suspend fun refreshProfile() {
        runCatching { api.get("/auth/me", User.serializer()) }
            .onSuccess { state = SessionState.SignedIn(it) }
    }

    private fun signOutLocally() {
        masjid = null
        state = SessionState.SignedOut
    }

    private suspend fun loadMasjid() {
        val id = masjidId ?: return
        masjid = runCatching { api.get("/masjids/$id", Masjid.serializer()) }.getOrNull()
    }
}
